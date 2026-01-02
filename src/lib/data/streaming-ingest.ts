import { getDatabase } from '@/lib/db';
import { writeToParquet, getParquetPath } from './duckdb-service';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import readline from 'readline';

export interface StreamingIngestResult {
  nightsImported: number;
  samplesProcessed: number;
  eventsImported: number;
  parquetFiles: string[];
  errors: string[];
  dateRange: { start: string; end: string } | null;
}

interface RawSample {
  timestamp: number; // Unix ms
  flow_rate: number;
  pressure: number;
  leak_rate: number;
  mask_on: number;
}

interface SessionAccumulator {
  sessionId: string;
  date: string;
  samples: RawSample[];
  events: Array<{
    timestamp: string;
    event_type: string;
    duration: number;
    severity: number;
  }>;
  stats: {
    pressures: number[];
    leaks: number[];
    flowLimitations: number[];
    maskOnCount: number;
    totalCount: number;
  };
}

/**
 * Stream-based CSV ingestion that:
 * 1. Reads line-by-line (no full file in memory)
 * 2. Accumulates samples per session
 * 3. Writes raw data to Parquet (Tier 3)
 * 4. Writes summary to SQLite (Tier 1)
 * 5. Does NOT store Tier 2 (Meso) - computed on-the-fly
 */
export async function ingestCPAPStreamingCSV(filePath: string): Promise<StreamingIngestResult> {
  const result: StreamingIngestResult = {
    nightsImported: 0,
    samplesProcessed: 0,
    eventsImported: 0,
    parquetFiles: [],
    errors: [],
    dateRange: null
  };

  const db = getDatabase();
  const sessions = new Map<string, SessionAccumulator>();
  const dates = new Set<string>();

  // Prepare SQLite statements
  const insertAggregate = db.prepare(`
    INSERT OR REPLACE INTO nightly_aggregates (
      date, session_id, total_usage_minutes, mask_on_minutes,
      median_pressure, min_pressure, max_pressure, pressure_95th_percentile,
      median_leak_rate, max_leak_rate, leak_95th_percentile,
      large_leak_minutes, large_leak_percent,
      ahi, apnea_count, hypopnea_count, total_events,
      median_flow_limitation, max_flow_limitation,
      sleep_quality_score, parquet_path
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertEvent = db.prepare(`
    INSERT INTO cpap_events (timestamp, event_type, duration_seconds, severity, session_id)
    VALUES (?, ?, ?, ?, ?)
  `);

  try {
    // Create readline interface for streaming
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let headers: string[] = [];
    let lineNumber = 0;
    let currentSessionId: string | null = null;
    let currentDate: string | null = null;

    for await (const line of rl) {
      lineNumber++;
      
      // Skip empty lines
      if (!line.trim()) continue;

      // Parse header row
      if (lineNumber === 1) {
        headers = line.split(',').map(h => h.trim().toLowerCase());
        continue;
      }

      // Parse data row
      const values = line.split(',').map(v => v.trim());
      if (values.length !== headers.length) continue;

      const row = parseRow(headers, values);
      if (!row.timestamp) continue;

      // Determine session (group by date)
      const rowDate = new Date(row.timestamp).toISOString().split('T')[0];
      
      // Start new session if date changes
      if (rowDate !== currentDate) {
        // Flush previous session if exists
        if (currentSessionId && sessions.has(currentSessionId)) {
          await flushSession(
            sessions.get(currentSessionId)!,
            insertAggregate,
            insertEvent,
            result
          );
          sessions.delete(currentSessionId);
        }
        
        currentDate = rowDate;
        currentSessionId = `${rowDate}-${uuidv4().slice(0, 8)}`;
        
        sessions.set(currentSessionId, {
          sessionId: currentSessionId,
          date: rowDate,
          samples: [],
          events: [],
          stats: {
            pressures: [],
            leaks: [],
            flowLimitations: [],
            maskOnCount: 0,
            totalCount: 0
          }
        });
        
        dates.add(rowDate);
      }

      const session = sessions.get(currentSessionId!)!;

      // Handle events vs samples
      if (row.event_type) {
        session.events.push({
          timestamp: row.timestamp,
          event_type: row.event_type,
          duration: row.event_duration || 0,
          severity: row.event_severity || 0
        });
      } else {
        // Add to raw samples buffer (for Parquet)
        const timestamp = new Date(row.timestamp).getTime();
        session.samples.push({
          timestamp,
          flow_rate: row.flow_rate || 0,
          pressure: row.pressure || 0,
          leak_rate: row.leak_rate || 0,
          mask_on: row.mask_on || 0
        });

        // Update running stats
        if (row.pressure !== undefined) session.stats.pressures.push(row.pressure);
        if (row.leak_rate !== undefined) session.stats.leaks.push(row.leak_rate);
        if (row.flow_limitation !== undefined) session.stats.flowLimitations.push(row.flow_limitation);
        if (row.mask_on === 1) session.stats.maskOnCount++;
        session.stats.totalCount++;

        result.samplesProcessed++;

        // Flush to Parquet in batches to avoid memory issues
        // Batch size: 50,000 samples (~33 minutes at 25Hz)
        if (session.samples.length >= 50000) {
          await appendToParquet(session);
          session.samples = []; // Clear buffer
        }
      }
    }

    // Flush final session
    if (currentSessionId && sessions.has(currentSessionId)) {
      await flushSession(
        sessions.get(currentSessionId)!,
        insertAggregate,
        insertEvent,
        result
      );
    }

    // Calculate date range
    if (dates.size > 0) {
      const sortedDates = Array.from(dates).sort();
      result.dateRange = {
        start: sortedDates[0],
        end: sortedDates[sortedDates.length - 1]
      };
    }

  } catch (error) {
    result.errors.push(`Streaming ingest failed: ${error}`);
  }

  return result;
}

function parseRow(headers: string[], values: string[]): Record<string, any> {
  const row: Record<string, any> = {};
  
  const timestampIdx = headers.indexOf('timestamp');
  if (timestampIdx !== -1) row.timestamp = values[timestampIdx];

  const numericFields = ['leak_rate', 'pressure', 'flow_limitation', 'mask_on', 'event_duration', 'event_severity'];
  for (const field of numericFields) {
    const idx = headers.indexOf(field);
    if (idx !== -1 && values[idx]) {
      row[field] = parseFloat(values[idx]) || 0;
    }
  }

  const eventTypeIdx = headers.indexOf('event_type');
  if (eventTypeIdx !== -1 && values[eventTypeIdx]) {
    row.event_type = values[eventTypeIdx];
  }

  return row;
}

async function appendToParquet(session: SessionAccumulator): Promise<void> {
  if (session.samples.length === 0) return;
  
  await writeToParquet(session.sessionId, session.samples);
}

async function flushSession(
  session: SessionAccumulator,
  insertAggregate: any,
  insertEvent: any,
  result: StreamingIngestResult
): Promise<void> {
  // Write remaining samples to Parquet
  if (session.samples.length > 0) {
    await appendToParquet(session);
  }

  const parquetPath = getParquetPath(session.sessionId);
  result.parquetFiles.push(parquetPath);

  // Insert events to SQLite
  for (const event of session.events) {
    insertEvent.run(
      event.timestamp,
      event.event_type,
      event.duration,
      event.severity,
      session.sessionId
    );
    result.eventsImported++;
  }

  // Calculate aggregates from accumulated stats
  const stats = session.stats;
  if (stats.totalCount === 0) return;

  const totalMinutes = stats.totalCount / 25 / 60; // 25Hz sampling
  const maskOnMinutes = stats.maskOnCount / 25 / 60;

  const medianPressure = calculateMedian(stats.pressures);
  const minPressure = stats.pressures.length > 0 ? Math.min(...stats.pressures) : 0;
  const maxPressure = stats.pressures.length > 0 ? Math.max(...stats.pressures) : 0;
  const pressure95th = calculatePercentile(stats.pressures, 0.95);

  const medianLeak = calculateMedian(stats.leaks);
  const maxLeak = stats.leaks.length > 0 ? Math.max(...stats.leaks) : 0;
  const leak95th = calculatePercentile(stats.leaks, 0.95);

  const largeLeakThreshold = 24;
  const largeLeakCount = stats.leaks.filter(l => l > largeLeakThreshold).length;
  const largeLeakMinutes = largeLeakCount / 25 / 60;
  const largeLeakPercent = totalMinutes > 0 ? (largeLeakMinutes / totalMinutes) * 100 : 0;

  const apneaCount = session.events.filter(e => 
    e.event_type.toLowerCase().includes('apnea')
  ).length;
  const hypopneaCount = session.events.filter(e => 
    e.event_type.toLowerCase().includes('hypopnea')
  ).length;
  const totalEvents = session.events.length;

  const usageHours = maskOnMinutes / 60;
  const ahi = usageHours > 0 ? totalEvents / usageHours : 0;

  const medianFlow = calculateMedian(stats.flowLimitations);
  const maxFlow = stats.flowLimitations.length > 0 ? Math.max(...stats.flowLimitations) : 0;

  const sleepQualityScore = calculateSleepQualityScore({
    ahi,
    largeLeakPercent,
    maskOnMinutes,
    totalMinutes
  });

  // Insert aggregate with parquet_path reference
  insertAggregate.run(
    session.date,
    session.sessionId,
    totalMinutes,
    maskOnMinutes,
    medianPressure,
    minPressure,
    maxPressure,
    pressure95th,
    medianLeak,
    maxLeak,
    leak95th,
    largeLeakMinutes,
    largeLeakPercent,
    ahi,
    apneaCount,
    hypopneaCount,
    totalEvents,
    medianFlow,
    maxFlow,
    sleepQualityScore,
    parquetPath
  );

  result.nightsImported++;
}

function calculateMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 
    ? (sorted[mid - 1] + sorted[mid]) / 2 
    : sorted[mid];
}

function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil(sorted.length * percentile) - 1;
  return sorted[Math.max(0, index)];
}

function calculateSleepQualityScore(metrics: {
  ahi: number;
  largeLeakPercent: number;
  maskOnMinutes: number;
  totalMinutes: number;
}): number {
  let score = 100;

  if (metrics.ahi > 5) score -= Math.min(30, (metrics.ahi - 5) * 2);
  if (metrics.ahi > 15) score -= Math.min(20, (metrics.ahi - 15) * 1);

  if (metrics.largeLeakPercent > 10) score -= Math.min(20, metrics.largeLeakPercent);

  const usagePercent = metrics.totalMinutes > 0 
    ? (metrics.maskOnMinutes / metrics.totalMinutes) * 100 
    : 0;
  if (usagePercent < 80) score -= Math.min(30, (80 - usagePercent));

  return Math.max(0, Math.min(100, Math.round(score)));
}
