import { getDatabase } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';

// Simplified CPAP CSV format
export interface CPAPCSVRow {
  timestamp: string;
  leak_rate?: number;
  pressure?: number;
  flow_limitation?: number;
  mask_on?: number;
  event_type?: string;
  event_duration?: number;
  event_severity?: number;
}

export interface IngestResult {
  nightsImported: number;
  samplesImported: number;
  eventsImported: number;
  errors: string[];
  dateRange: { start: string; end: string } | null;
}

export async function ingestCPAPCSV(filePath: string): Promise<IngestResult> {
  const db = getDatabase();
  const result: IngestResult = {
    nightsImported: 0,
    samplesImported: 0,
    eventsImported: 0,
    errors: [],
    dateRange: null
  };

  try {
    // Read and parse CSV
    const csvContent = fs.readFileSync(filePath, 'utf-8');
    const rows = parseCSV(csvContent);
    
    if (rows.length === 0) {
      result.errors.push('CSV file is empty or invalid');
      return result;
    }

    // Group data by session
    const sessions = groupBySession(rows);
    
    // Process each session
    const dates = new Set<string>();
    const insertSample = db.prepare(`
      INSERT INTO cpap_samples (timestamp, leak_rate, pressure, flow_limitation, mask_on, session_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    const insertEvent = db.prepare(`
      INSERT INTO cpap_events (timestamp, event_type, duration_seconds, severity, session_id)
      VALUES (?, ?, ?, ?, ?)
    `);

    const insertAggregate = db.prepare(`
      INSERT OR REPLACE INTO nightly_aggregates (
        date, session_id, total_usage_minutes, mask_on_minutes,
        median_pressure, min_pressure, max_pressure, pressure_95th_percentile,
        median_leak_rate, max_leak_rate, leak_95th_percentile,
        large_leak_minutes, large_leak_percent,
        ahi, apnea_count, hypopnea_count, total_events,
        median_flow_limitation, max_flow_limitation,
        sleep_quality_score
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Begin transaction
    const transaction = db.transaction(() => {
      for (const [sessionId, sessionData] of sessions) {
        // Insert samples
        for (const sample of sessionData.samples) {
          insertSample.run(
            sample.timestamp,
            sample.leak_rate,
            sample.pressure,
            sample.flow_limitation,
            sample.mask_on,
            sessionId
          );
          result.samplesImported++;
        }

        // Insert events
        for (const event of sessionData.events) {
          insertEvent.run(
            event.timestamp,
            event.event_type,
            event.event_duration,
            event.event_severity,
            sessionId
          );
          result.eventsImported++;
        }

        // Calculate and insert nightly aggregates
        const aggregates = calculateAggregates(sessionData);
        if (aggregates) {
          insertAggregate.run(
            aggregates.date,
            sessionId,
            aggregates.total_usage_minutes,
            aggregates.mask_on_minutes,
            aggregates.median_pressure,
            aggregates.min_pressure,
            aggregates.max_pressure,
            aggregates.pressure_95th_percentile,
            aggregates.median_leak_rate,
            aggregates.max_leak_rate,
            aggregates.leak_95th_percentile,
            aggregates.large_leak_minutes,
            aggregates.large_leak_percent,
            aggregates.ahi,
            aggregates.apnea_count,
            aggregates.hypopnea_count,
            aggregates.total_events,
            aggregates.median_flow_limitation,
            aggregates.max_flow_limitation,
            aggregates.sleep_quality_score
          );
          
          dates.add(aggregates.date);
          result.nightsImported++;
        }
      }
    });

    transaction();

    // Calculate date range
    if (dates.size > 0) {
      const sortedDates = Array.from(dates).sort();
      result.dateRange = {
        start: sortedDates[0],
        end: sortedDates[sortedDates.length - 1]
      };
    }

  } catch (error) {
    result.errors.push(`Failed to process file: ${error}`);
  }

  return result;
}

function parseCSV(content: string): CPAPCSVRow[] {
  const lines = content.split('\n').filter(line => line.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const rows: CPAPCSVRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    if (values.length !== headers.length) continue;

    const row: CPAPCSVRow = {
      timestamp: values[headers.indexOf('timestamp')] || ''
    };

    // Parse numeric fields
    const numericFields = ['leak_rate', 'pressure', 'flow_limitation', 'mask_on', 'event_duration', 'event_severity'];
    for (const field of numericFields) {
      const idx = headers.indexOf(field);
      if (idx !== -1 && values[idx]) {
        (row as any)[field] = parseFloat(values[idx]) || 0;
      }
    }

    // Parse string fields
    const stringFields = ['event_type'];
    for (const field of stringFields) {
      const idx = headers.indexOf(field);
      if (idx !== -1) {
        (row as any)[field] = values[idx] || '';
      }
    }

    rows.push(row);
  }

  return rows;
}

function groupBySession(rows: CPAPCSVRow[]) {
  const sessions = new Map();
  
  // Simple session detection: group by date or continuous mask-on periods
  for (const row of rows) {
    const date = new Date(row.timestamp).toISOString().split('T')[0];
    const sessionId = `${date}-${uuidv4()}`;
    
    if (!sessions.has(sessionId)) {
      sessions.set(sessionId, {
        samples: [],
        events: []
      });
    }
    
    const session = sessions.get(sessionId);
    
    // Separate samples from events
    if (row.event_type) {
      session.events.push(row);
    } else {
      session.samples.push(row);
    }
  }
  
  return sessions;
}

function calculateAggregates(sessionData: { samples: CPAPCSVRow[], events: CPAPCSVRow[] }) {
  const { samples, events } = sessionData;
  
  if (samples.length === 0) return null;
  
  // Sort samples by timestamp
  samples.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  
  const firstTimestamp = new Date(samples[0].timestamp);
  const lastTimestamp = new Date(samples[samples.length - 1].timestamp);
  const date = firstTimestamp.toISOString().split('T')[0];
  
  // Calculate usage
  const totalMinutes = (lastTimestamp.getTime() - firstTimestamp.getTime()) / (1000 * 60);
  const maskOnSamples = samples.filter(s => s.mask_on === 1);
  const maskOnMinutes = maskOnSamples.length > 0 ? 
    (maskOnSamples.length / samples.length) * totalMinutes : 0;
  
  // Pressure calculations
  const pressures = samples.filter(s => s.pressure !== undefined).map(s => s.pressure!);
  const medianPressure = calculateMedian(pressures);
  const minPressure = Math.min(...pressures);
  const maxPressure = Math.max(...pressures);
  const pressure95th = calculatePercentile(pressures, 0.95);
  
  // Leak calculations
  const leaks = samples.filter(s => s.leak_rate !== undefined).map(s => s.leak_rate!);
  const medianLeak = calculateMedian(leaks);
  const maxLeak = Math.max(...leaks);
  const leak95th = calculatePercentile(leaks, 0.95);
  
  // Large leak threshold (typically > 24 L/min)
  const largeLeakThreshold = 24;
  const largeLeakSamples = leaks.filter(l => l > largeLeakThreshold);
  const largeLeakMinutes = largeLeakSamples.length > 0 ? 
    (largeLeakSamples.length / samples.length) * totalMinutes : 0;
  const largeLeakPercent = (largeLeakMinutes / totalMinutes) * 100;
  
  // Event calculations
  const apneaEvents = events.filter(e => e.event_type?.toLowerCase().includes('apnea'));
  const hypopneaEvents = events.filter(e => e.event_type?.toLowerCase().includes('hypopnea'));
  const totalEvents = events.length;
  
  // Calculate AHI (events per hour)
  const usageHours = maskOnMinutes / 60;
  const ahi = usageHours > 0 ? totalEvents / usageHours : 0;
  
  // Flow limitation calculations
  const flowLimitations = samples.filter(s => s.flow_limitation !== undefined).map(s => s.flow_limitation!);
  const medianFlow = calculateMedian(flowLimitations);
  const maxFlow = Math.max(...flowLimitations);
  
  // Simple sleep quality score (0-100)
  const sleepQualityScore = calculateSleepQualityScore({
    ahi,
    largeLeakPercent,
    maskOnMinutes,
    totalMinutes
  });
  
  return {
    date,
    session_id: '', // Will be filled by caller
    total_usage_minutes: totalMinutes,
    mask_on_minutes: maskOnMinutes,
    median_pressure: medianPressure,
    min_pressure: minPressure,
    max_pressure: maxPressure,
    pressure_95th_percentile: pressure95th,
    median_leak_rate: medianLeak,
    max_leak_rate: maxLeak,
    leak_95th_percentile: leak95th,
    large_leak_minutes: largeLeakMinutes,
    large_leak_percent: largeLeakPercent,
    ahi,
    apnea_count: apneaEvents.length,
    hypopnea_count: hypopneaEvents.length,
    total_events: totalEvents,
    median_flow_limitation: medianFlow,
    max_flow_limitation: maxFlow,
    sleep_quality_score: sleepQualityScore
  };
}

function calculateMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? 
    (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil(sorted.length * percentile) - 1;
  return sorted[index];
}

function calculateSleepQualityScore(metrics: {
  ahi: number;
  largeLeakPercent: number;
  maskOnMinutes: number;
  totalMinutes: number;
}): number {
  let score = 100;
  
  // Deduct for high AHI
  if (metrics.ahi > 5) score -= Math.min(30, (metrics.ahi - 5) * 2);
  if (metrics.ahi > 15) score -= Math.min(20, (metrics.ahi - 15) * 1);
  
  // Deduct for large leaks
  if (metrics.largeLeakPercent > 10) score -= Math.min(20, metrics.largeLeakPercent);
  
  // Deduct for low usage
  const usagePercent = (metrics.maskOnMinutes / metrics.totalMinutes) * 100;
  if (usagePercent < 80) score -= Math.min(30, (80 - usagePercent));
  
  return Math.max(0, Math.min(100, Math.round(score)));
}
