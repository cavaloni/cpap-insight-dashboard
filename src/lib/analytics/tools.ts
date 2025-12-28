import { getDatabase } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import { METRIC_DEFINITIONS, MetricName } from '@/lib/db/schema';

export interface ToolResult<T = any> {
  data: T;
  provenance: {
    toolName: string;
    parameters: Record<string, any>;
    computedAt: string;
    definitions: string[];
    artifactId: string;
  };
}

export interface NightlySummary {
  date: string;
  ahi: number;
  total_usage_minutes: number;
  mask_on_minutes: number;
  median_pressure: number;
  median_leak_rate: number;
  large_leak_percent: number;
  sleep_quality_score: number;
}

export interface TrendData {
  metric: string;
  slope: number;
  trend: 'improving' | 'worsening' | 'stable';
  rolling_avg: number[];
  dates: string[];
}

export interface Anomaly {
  date: string;
  metric: string;
  value: number;
  expected_range: { min: number; max: number };
  reason_code: string;
  severity: 'mild' | 'moderate' | 'severe';
}

export interface CorrelationResult {
  metricA: string;
  metricB: string;
  correlation: number;
  strength: 'weak' | 'moderate' | 'strong';
  direction: 'positive' | 'negative' | 'none';
  interpretation: string;
}

export interface RangeComparison {
  metrics: Record<string, {
    rangeA: { avg: number; min: number; max: number };
    rangeB: { avg: number; min: number; max: number };
    delta: number;
    percent_change: number;
    significance: 'increase' | 'decrease' | 'no_change';
  }>;
}

export interface SessionBreakdown {
  date: string;
  total_sessions: number;
  sessions: Array<{
    start_time: string;
    end_time: string;
    duration_minutes: number;
    avg_pressure: number;
    avg_leak_rate: number;
    large_leak_periods: Array<{
      start: string;
      end: string;
      duration_minutes: number;
      peak_leak: number;
    }>;
  }>;
}

// Tool 1: Get Nightly Summary
export function getNightlySummary(dateRange: { start: string; end: string }): ToolResult<NightlySummary[]> {
  const db = getDatabase();
  const artifactId = uuidv4();
  
  const stmt = db.prepare(`
    SELECT 
      date,
      ahi,
      total_usage_minutes,
      mask_on_minutes,
      median_pressure,
      median_leak_rate,
      large_leak_percent,
      sleep_quality_score
    FROM nightly_aggregates
    WHERE date >= ? AND date <= ?
    ORDER BY date ASC
  `);
  
  const results = stmt.all(dateRange.start, dateRange.end) as NightlySummary[];
  
  const result: ToolResult<NightlySummary[]> = {
    data: results,
    provenance: {
      toolName: 'getNightlySummary',
      parameters: { dateRange },
      computedAt: new Date().toISOString(),
      definitions: [
        `AHI: ${METRIC_DEFINITIONS.ahi.description} (${METRIC_DEFINITIONS.ahi.unit})`,
        `Usage: Total time device was used (${METRIC_DEFINITIONS.total_usage_minutes.unit})`,
        `Leak Rate: ${METRIC_DEFINITIONS.leak_rate.description} (${METRIC_DEFINITIONS.leak_rate.unit})`,
        `Quality Score: ${METRIC_DEFINITIONS.sleep_quality_score.description}`
      ],
      artifactId
    }
  };
  
  // Store evidence artifact
  storeEvidenceArtifact(artifactId, result);
  
  return result;
}

// Tool 2: Get Trends
export function getTrends(
  metric: MetricName,
  dateRange: { start: string; end: string },
  window: number = 7
): ToolResult<TrendData> {
  const db = getDatabase();
  const artifactId = uuidv4();
  
  const stmt = db.prepare(`
    SELECT date, ${metric} as value
    FROM nightly_aggregates
    WHERE date >= ? AND date <= ?
    ORDER BY date ASC
  `);
  
  const results = stmt.all(dateRange.start, dateRange.end) as { date: string; value: number }[];
  
  // Calculate rolling average
  const rollingAvg: number[] = [];
  for (let i = 0; i < results.length; i++) {
    const start = Math.max(0, i - Math.floor(window / 2));
    const end = Math.min(results.length, i + Math.floor(window / 2) + 1);
    const windowValues = results.slice(start, end).map(r => r.value).filter(v => v !== null);
    rollingAvg.push(windowValues.length > 0 ? 
      windowValues.reduce((a, b) => a + b, 0) / windowValues.length : 0);
  }
  
  // Calculate slope (linear regression)
  const slope = calculateSlope(results.map((r, i) => ({ x: i, y: r.value || 0 })));
  
  // Determine trend
  let trend: 'improving' | 'worsening' | 'stable' = 'stable';
  if (metric === 'ahi' || metric === 'leak_rate' || metric === 'large_leak_percent') {
    // Lower is better for these metrics
    if (slope < -0.1) trend = 'improving';
    else if (slope > 0.1) trend = 'worsening';
  } else {
    // Higher is better for these metrics
    if (slope > 0.1) trend = 'improving';
    else if (slope < -0.1) trend = 'worsening';
  }
  
  const result: ToolResult<TrendData> = {
    data: {
      metric,
      slope,
      trend,
      rolling_avg: rollingAvg,
      dates: results.map(r => r.date)
    },
    provenance: {
      toolName: 'getTrends',
      parameters: { metric, dateRange, window },
      computedAt: new Date().toISOString(),
      definitions: [
        `${METRIC_DEFINITIONS[metric].name}: ${METRIC_DEFINITIONS[metric].description}`,
        `Trend calculated over ${window}-day rolling average`,
        `Slope: Linear regression coefficient (${metric === 'ahi' ? 'lower is better' : 'varies by metric'})`
      ],
      artifactId
    }
  };
  
  storeEvidenceArtifact(artifactId, result);
  
  return result;
}

// Tool 3: Detect Anomalies
export function detectAnomalies(
  metric: MetricName,
  dateRange: { start: string; end: string },
  threshold: number = 2
): ToolResult<Anomaly[]> {
  const db = getDatabase();
  const artifactId = uuidv4();
  
  const stmt = db.prepare(`
    SELECT date, ${metric} as value
    FROM nightly_aggregates
    WHERE date >= ? AND date <= ? AND ${metric} IS NOT NULL
    ORDER BY date ASC
  `);
  
  const results = stmt.all(dateRange.start, dateRange.end) as { date: string; value: number }[];
  
  // Calculate statistics
  const values = results.map(r => r.value);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const stdDev = Math.sqrt(values.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / values.length);
  
  // Detect outliers (z-score > threshold)
  const anomalies: Anomaly[] = [];
  for (const result of results) {
    const zScore = Math.abs((result.value - mean) / stdDev);
    if (zScore > threshold) {
      let severity: 'mild' | 'moderate' | 'severe' = 'mild';
      if (zScore > 3) severity = 'severe';
      else if (zScore > 2.5) severity = 'moderate';
      
      let reasonCode = '';
      if (metric === 'ahi') {
        if (result.value > mean) reasonCode = 'elevated_events';
        else reasonCode = 'low_events';
      } else if (metric === 'leak_rate' || metric === 'large_leak_percent') {
        if (result.value > mean) reasonCode = 'mask_leak';
        else reasonCode = 'good_seal';
      } else if (metric === 'sleep_quality_score') {
        if (result.value < mean) reasonCode = 'poor_quality';
        else reasonCode = 'high_quality';
      }
      
      anomalies.push({
        date: result.date,
        metric,
        value: result.value,
        expected_range: {
          min: mean - 2 * stdDev,
          max: mean + 2 * stdDev
        },
        reason_code: reasonCode,
        severity
      });
    }
  }
  
  const result: ToolResult<Anomaly[]> = {
    data: anomalies,
    provenance: {
      toolName: 'detectAnomalies',
      parameters: { metric, dateRange, threshold },
      computedAt: new Date().toISOString(),
      definitions: [
        `Anomaly detection using z-score > ${threshold} standard deviations`,
        `Mean: ${mean.toFixed(2)}, StdDev: ${stdDev.toFixed(2)}`,
        `${anomalies.length} anomalies detected out of ${results.length} data points`
      ],
      artifactId
    }
  };
  
  storeEvidenceArtifact(artifactId, result);
  
  return result;
}

// Tool 4: Correlate Metrics
export function correlate(
  metricA: MetricName,
  metricB: MetricName,
  dateRange: { start: string; end: string }
): ToolResult<CorrelationResult> {
  const db = getDatabase();
  const artifactId = uuidv4();
  
  const stmt = db.prepare(`
    SELECT ${metricA} as valueA, ${metricB} as valueB
    FROM nightly_aggregates
    WHERE date >= ? AND date <= ? 
      AND ${metricA} IS NOT NULL AND ${metricB} IS NOT NULL
    ORDER BY date ASC
  `);
  
  const results = stmt.all(dateRange.start, dateRange.end) as { valueA: number; valueB: number }[];
  
  // Calculate Pearson correlation
  const correlation = calculateCorrelation(results.map(r => r.valueA), results.map(r => r.valueB));
  
  // Determine strength and direction
  let strength: 'weak' | 'moderate' | 'strong' = 'weak';
  const absCorr = Math.abs(correlation);
  if (absCorr > 0.7) strength = 'strong';
  else if (absCorr > 0.3) strength = 'moderate';
  
  let direction: 'positive' | 'negative' | 'none' = 'none';
  if (correlation > 0.1) direction = 'positive';
  else if (correlation < -0.1) direction = 'negative';
  
  // Generate interpretation
  let interpretation = '';
  if (direction === 'positive') {
    interpretation = `When ${METRIC_DEFINITIONS[metricA].name.toLowerCase()} increases, ${METRIC_DEFINITIONS[metricB].name.toLowerCase()} tends to increase as well.`;
  } else if (direction === 'negative') {
    interpretation = `When ${METRIC_DEFINITIONS[metricA].name.toLowerCase()} increases, ${METRIC_DEFINITIONS[metricB].name.toLowerCase()} tends to decrease.`;
  } else {
    interpretation = `No clear relationship found between ${METRIC_DEFINITIONS[metricA].name.toLowerCase()} and ${METRIC_DEFINITIONS[metricB].name.toLowerCase()}.`;
  }
  
  const result: ToolResult<CorrelationResult> = {
    data: {
      metricA,
      metricB,
      correlation,
      strength,
      direction,
      interpretation
    },
    provenance: {
      toolName: 'correlate',
      parameters: { metricA, metricB, dateRange },
      computedAt: new Date().toISOString(),
      definitions: [
        `Pearson correlation coefficient ranges from -1 to 1`,
        `${results.length} data points analyzed`,
        `Strength: ${strength} (${absCorr.toFixed(2)})`
      ],
      artifactId
    }
  };
  
  storeEvidenceArtifact(artifactId, result);
  
  return result;
}

// Tool 5: Compare Ranges
export function compareRanges(
  rangeA: { start: string; end: string },
  rangeB: { start: string; end: string },
  metrics: MetricName[]
): ToolResult<RangeComparison> {
  const db = getDatabase();
  const artifactId = uuidv4();
  
  const comparison: RangeComparison = { metrics: {} };
  
  for (const metric of metrics) {
    // Get stats for range A
    const stmtA = db.prepare(`
      SELECT 
        AVG(${metric}) as avg,
        MIN(${metric}) as min,
        MAX(${metric}) as max
      FROM nightly_aggregates
      WHERE date >= ? AND date <= ? AND ${metric} IS NOT NULL
    `);
    const statsA = stmtA.get(rangeA.start, rangeA.end) as { avg: number; min: number; max: number };
    
    // Get stats for range B
    const stmtB = db.prepare(`
      SELECT 
        AVG(${metric}) as avg,
        MIN(${metric}) as min,
        MAX(${metric}) as max
      FROM nightly_aggregates
      WHERE date >= ? AND date <= ? AND ${metric} IS NOT NULL
    `);
    const statsB = stmtB.get(rangeB.start, rangeB.end) as { avg: number; min: number; max: number };
    
    // Calculate change
    const delta = statsB.avg - statsA.avg;
    const percentChange = statsA.avg !== 0 ? (delta / statsA.avg) * 100 : 0;
    
    let significance: 'increase' | 'decrease' | 'no_change' = 'no_change';
    if (Math.abs(percentChange) > 5) {
      significance = delta > 0 ? 'increase' : 'decrease';
    }
    
    comparison.metrics[metric] = {
      rangeA: statsA,
      rangeB: statsB,
      delta,
      percent_change: percentChange,
      significance
    };
  }
  
  const result: ToolResult<RangeComparison> = {
    data: comparison,
    provenance: {
      toolName: 'compareRanges',
      parameters: { rangeA, rangeB, metrics },
      computedAt: new Date().toISOString(),
      definitions: [
        `Comparing ${metrics.length} metrics between two date ranges`,
        `Significance threshold: >5% change`,
        `Percent change calculated from average values`
      ],
      artifactId
    }
  };
  
  storeEvidenceArtifact(artifactId, result);
  
  return result;
}

// Tool 6: Get Session Breakdown
export function getSessionBreakdown(date: string): ToolResult<SessionBreakdown> {
  const db = getDatabase();
  const artifactId = uuidv4();
  
  // Get samples for the night
  const samplesStmt = db.prepare(`
    SELECT timestamp, pressure, leak_rate, mask_on
    FROM cpap_samples
    WHERE date(timestamp) = ?
    ORDER BY timestamp ASC
  `);
  const samples = samplesStmt.all(date) as {
    timestamp: string;
    pressure: number;
    leak_rate: number;
    mask_on: number;
  }[];
  
  // Identify sessions (continuous mask-on periods)
  const sessions: any[] = [];
  let currentSession: any = null;
  
  for (const sample of samples) {
    if (sample.mask_on === 1 && !currentSession) {
      // Start new session
      currentSession = {
        start_time: sample.timestamp,
        end_time: null,
        duration_minutes: 0,
        avg_pressure: 0,
        avg_leak_rate: 0,
        large_leak_periods: [],
        pressures: [],
        leak_rates: []
      };
    } else if (sample.mask_on === 0 && currentSession) {
      // End session
      currentSession.end_time = sample.timestamp;
      currentSession.duration_minutes = calculateDurationMinutes(
        currentSession.start_time,
        currentSession.end_time
      );
      currentSession.avg_pressure = currentSession.pressures.length > 0 ?
        currentSession.pressures.reduce((a: number, b: number) => a + b, 0) / currentSession.pressures.length : 0;
      currentSession.avg_leak_rate = currentSession.leak_rates.length > 0 ?
        currentSession.leak_rates.reduce((a: number, b: number) => a + b, 0) / currentSession.leak_rates.length : 0;
      
      // Identify large leak periods
      currentSession.large_leak_periods = identifyLargeLeakPeriods(
        currentSession.leak_rates,
        currentSession.start_time
      );
      
      sessions.push(currentSession);
      currentSession = null;
    }
    
    if (currentSession && sample.mask_on === 1) {
      if (sample.pressure) currentSession.pressures.push(sample.pressure);
      if (sample.leak_rate) currentSession.leak_rates.push(sample.leak_rate);
    }
  }
  
  // Handle session that extends to end of data
  if (currentSession) {
    currentSession.end_time = samples[samples.length - 1].timestamp;
    currentSession.duration_minutes = calculateDurationMinutes(
      currentSession.start_time,
      currentSession.end_time
    );
    sessions.push(currentSession);
  }
  
  const result: ToolResult<SessionBreakdown> = {
    data: {
      date,
      total_sessions: sessions.length,
      sessions: sessions.map(s => ({
        start_time: s.start_time,
        end_time: s.end_time,
        duration_minutes: s.duration_minutes,
        avg_pressure: s.avg_pressure,
        avg_leak_rate: s.avg_leak_rate,
        large_leak_periods: s.large_leak_periods
      }))
    },
    provenance: {
      toolName: 'getSessionBreakdown',
      parameters: { date },
      computedAt: new Date().toISOString(),
      definitions: [
        `Session: Continuous period with mask on`,
        `Large leak period: Leak rate > 24 L/min for > 1 minute`,
        `${sessions.length} sessions identified for ${date}`
      ],
      artifactId
    }
  };
  
  storeEvidenceArtifact(artifactId, result);
  
  return result;
}

// Helper functions
function calculateSlope(points: { x: number; y: number }[]): number {
  if (points.length < 2) return 0;
  
  const n = points.length;
  const sumX = points.reduce((sum, p) => sum + p.x, 0);
  const sumY = points.reduce((sum, p) => sum + p.y, 0);
  const sumXY = points.reduce((sum, p) => sum + p.x * p.y, 0);
  const sumXX = points.reduce((sum, p) => sum + p.x * p.x, 0);
  
  return (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
}

function calculateCorrelation(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length === 0) return 0;
  
  const n = x.length;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
  const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);
  const sumYY = y.reduce((sum, yi) => sum + yi * yi, 0);
  
  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumXX - sumX * sumX) * (n * sumYY - sumY * sumY));
  
  return denominator === 0 ? 0 : numerator / denominator;
}

function calculateDurationMinutes(startTime: string, endTime: string): number {
  const start = new Date(startTime);
  const end = new Date(endTime);
  return (end.getTime() - start.getTime()) / (1000 * 60);
}

function identifyLargeLeakPeriods(leakRates: number[], startTime: string): Array<{
  start: string;
  end: string;
  duration_minutes: number;
  peak_leak: number;
}> {
  const periods = [];
  const threshold = 24; // L/min
  let inPeriod = false;
  let periodStart = 0;
  let currentPeak = 0;
  
  for (let i = 0; i < leakRates.length; i++) {
    if (leakRates[i] > threshold && !inPeriod) {
      // Start large leak period
      inPeriod = true;
      periodStart = i;
      currentPeak = leakRates[i];
    } else if (leakRates[i] > threshold && inPeriod) {
      // Continue large leak period
      currentPeak = Math.max(currentPeak, leakRates[i]);
    } else if (leakRates[i] <= threshold && inPeriod) {
      // End large leak period
      const duration = i - periodStart;
      if (duration >= 5) { // At least 5 data points
        const startOffset = periodStart * 5; // Assuming 5-minute intervals
        const endOffset = i * 5;
        const startDate = new Date(startTime);
        startDate.setMinutes(startDate.getMinutes() + startOffset);
        const endDate = new Date(startTime);
        endDate.setMinutes(endDate.getMinutes() + endOffset);
        
        periods.push({
          start: startDate.toISOString(),
          end: endDate.toISOString(),
          duration_minutes: duration * 5,
          peak_leak: currentPeak
        });
      }
      inPeriod = false;
    }
  }
  
  return periods;
}

function storeEvidenceArtifact(artifactId: string, result: ToolResult) {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO evidence_artifacts (id, tool_name, parameters, result, provenance)
    VALUES (?, ?, ?, ?, ?)
  `);
  
  stmt.run(
    artifactId,
    result.provenance.toolName,
    JSON.stringify(result.provenance.parameters),
    JSON.stringify(result.data),
    JSON.stringify(result.provenance)
  );
}

// Custom SQL Query Tool with Security
export interface CustomQueryResult {
  query: string;
  results: any[];
  row_count: number;
  execution_time_ms: number;
  columns: string[];
}

export async function executeCustomQuery(
  naturalLanguageQuery: string,
  dateRange?: { start: string; end: string }
): Promise<ToolResult<CustomQueryResult>> {
  const artifactId = uuidv4();
  
  try {
    // Phase 1: Convert natural language to safe SQL intent
    const sqlIntent = await generateSQLIntent(naturalLanguageQuery, dateRange);
    
    // Phase 2: Validate and build secure SQL
    const secureSQL = buildSecureSQL(sqlIntent);
    
    // Phase 3: Execute with safeguards
    const result = await executeSecurely(secureSQL.sql, secureSQL.params);
    
    const toolResult: ToolResult<CustomQueryResult> = {
      data: result,
      provenance: {
        toolName: 'executeCustomQuery',
        parameters: { naturalLanguageQuery, dateRange },
        computedAt: new Date().toISOString(),
        definitions: ['Custom SQL analysis based on user query'],
        artifactId
      }
    };
    
    storeEvidenceArtifact(artifactId, toolResult);
    return toolResult;
    
  } catch (error) {
    throw new Error(`Custom query failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Phase 1: LLM generates structured intent, not raw SQL
async function generateSQLIntent(
  query: string,
  dateRange?: { start: string; end: string }
): Promise<SQLIntent> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OpenRouter API key not found');
  }
  
  const prompt = `Convert this query to a structured SQL intent for CPAP data analysis:
Query: "${query}"
${dateRange ? `Date range: ${dateRange.start} to ${dateRange.end}` : ''}

Valid tables: 
- nightly_aggregates: contains daily summaries with columns: date, ahi, total_usage_minutes, mask_on_minutes, median_pressure, median_leak_rate, large_leak_percent, sleep_quality_score
- cpap_samples: contains raw 5-minute samples with columns: timestamp, leak_rate, pressure, flow_limitation, mask_on
- cpap_events: contains events with columns: timestamp, event_type, event_duration, event_severity

Return ONLY a JSON object with:
{
  "table": "table_name",
  "columns": ["col1", "col2"],
  "aggregations": [{"column": "col", "func": "avg|sum|count|min|max"}],
  "filters": [{"column": "col", "operator": ">|<|=|>=|<=", "value": "number|string"}],
  "groupBy": ["col1"],
  "orderBy": {"column": "col", "direction": "asc|desc"},
  "limit": number
}

Rules:
- Always include date filter if date range provided
- Limit results to 100 rows maximum
- Only use valid columns from the specified table
- For aggregations, specify the aggregation function`;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'CPAP Insight Dashboard'
      },
      body: JSON.stringify({
        model: 'anthropic/claude-3.5-sonnet',
        messages: [
          { role: 'system', content: 'You are a SQL query generator. Return only valid JSON without any explanations.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1
      })
    });
    
    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.statusText}`);
    }
    
    const data = await response.json();
    const content = data.choices[0]?.message?.content || '';
    
    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in LLM response');
    }
    
    const intent = JSON.parse(jsonMatch[0]) as SQLIntent;
    
    // Validate required fields
    if (!intent.table || !intent.columns || !Array.isArray(intent.columns)) {
      throw new Error('Invalid SQL intent structure');
    }
    
    // Set defaults
    intent.aggregations = intent.aggregations || [];
    intent.filters = intent.filters || [];
    intent.groupBy = intent.groupBy || [];
    intent.limit = Math.min(intent.limit || 100, 100);
    
    return intent;
    
  } catch (error) {
    // Fallback to simple date-based query if LLM fails
    console.warn('LLM intent generation failed, using fallback:', error);
    return {
      table: 'nightly_aggregates',
      columns: ['date', 'ahi'],
      aggregations: [{ column: 'ahi', func: 'avg' }],
      filters: dateRange ? [
        { column: 'date', operator: '>=', value: dateRange.start },
        { column: 'date', operator: '<=', value: dateRange.end }
      ] : [],
      groupBy: [],
      orderBy: { column: 'date', direction: 'asc' },
      limit: 100
    };
  }
}

interface SQLIntent {
  table: string;
  columns: string[];
  aggregations: { column: string; func: 'avg' | 'sum' | 'count' | 'min' | 'max' }[];
  filters: { column: string; operator: '>' | '<' | '=' | '>=' | '<='; value: number | string }[];
  groupBy: string[];
  orderBy: { column: string; direction: 'asc' | 'desc' };
  limit: number;
}

// Phase 2: Build secure SQL from intent
function buildSecureSQL(intent: SQLIntent): { sql: string; params: any[] } {
  // Whitelist of allowed tables and columns
  const allowedTables = ['nightly_aggregates', 'cpap_samples', 'cpap_events'];
  const allowedColumns = {
    nightly_aggregates: ['date', 'ahi', 'total_usage_minutes', 'mask_on_minutes', 
                        'median_pressure', 'median_leak_rate', 'large_leak_percent', 
                        'sleep_quality_score'],
    cpap_samples: ['timestamp', 'leak_rate', 'pressure', 'flow_limitation', 'mask_on'],
    cpap_events: ['timestamp', 'event_type', 'event_duration', 'event_severity']
  };
  
  // Validate table
  if (!allowedTables.includes(intent.table)) {
    throw new Error(`Table not allowed: ${intent.table}`);
  }
  
  // Validate columns
  const tableColumns = allowedColumns[intent.table as keyof typeof allowedColumns];
  if (!tableColumns) {
    throw new Error(`No columns defined for table: ${intent.table}`);
  }
  
  for (const col of intent.columns) {
    if (!tableColumns.includes(col)) {
      throw new Error(`Column not allowed: ${col} in table ${intent.table}`);
    }
  }
  
  // Build SELECT clause
  let select = intent.columns.map(col => `"${col}"`).join(', ');
  
  // Add aggregations
  for (const agg of intent.aggregations) {
    if (!tableColumns.includes(agg.column)) {
      throw new Error(`Column not allowed for aggregation: ${agg.column}`);
    }
    select = select.replace(`"${agg.column}"`, `${agg.func}("${agg.column}") as ${agg.column}_${agg.func}`);
  }
  
  // Build query
  let sql = `SELECT ${select} FROM "${intent.table}"`;
  
  // Add WHERE clause with parameterized filters
  if (intent.filters.length > 0) {
    const whereClause = intent.filters.map(f => `"${f.column}" ${f.operator} ?`).join(' AND ');
    sql += ` WHERE ${whereClause}`;
  }
  
  // Add GROUP BY
  if (intent.groupBy.length > 0) {
    sql += ` GROUP BY ${intent.groupBy.map(col => `"${col}"`).join(', ')}`;
  }
  
  // Add ORDER BY
  if (intent.orderBy) {
    sql += ` ORDER BY "${intent.orderBy.column}" ${intent.orderBy.direction.toUpperCase()}`;
  }
  
  // Always add LIMIT (max 100)
  const limit = Math.min(intent.limit || 100, 100);
  sql += ` LIMIT ${limit}`;
  
  // Extract parameter values in the same order as placeholders
  const params = intent.filters.map(f => f.value);
  
  return { sql, params };
}

// Phase 3: Execute with security measures
async function executeSecurely(sql: string, params: any[] = []): Promise<CustomQueryResult> {
  // Create read-only connection
  const readOnlyDb = new (require('better-sqlite3'))('cpap-data.db', { readonly: true });
  
  try {
    // Parse and validate SQL structure
    if (!sql.trim().toUpperCase().startsWith('SELECT')) {
      throw new Error('Only SELECT queries are allowed');
    }
    
    // Check for dangerous keywords
    const dangerous = ['DROP', 'DELETE', 'UPDATE', 'INSERT', 'ALTER', 'CREATE', 'PRAGMA'];
    for (const word of dangerous) {
      if (sql.toUpperCase().includes(word)) {
        throw new Error(`Dangerous keyword detected: ${word}`);
      }
    }
    
    // Explain query plan to check complexity
    const explain = readOnlyDb.prepare(`EXPLAIN QUERY PLAN ${sql}`).all();
    const complexity = estimateQueryComplexity(explain);
    
    if (complexity > 1000) {
      throw new Error('Query too complex');
    }
    
    // Execute with timeout
    const startTime = Date.now();
    const stmt = readOnlyDb.prepare(sql);
    const results = stmt.all(...params);
    const executionTime = Date.now() - startTime;
    
    // Return structured result
    return {
      query: sql,
      results,
      row_count: results.length,
      execution_time_ms: executionTime,
      columns: results.length > 0 ? Object.keys(results[0]) : []
    };
    
  } finally {
    readOnlyDb.close();
  }
}

function estimateQueryComplexity(explainPlan: any[]): number {
  // Simple complexity estimation based on scan type
  let complexity = 0;
  for (const row of explainPlan) {
    if (row.detail.includes('SCAN')) {
      complexity += 100;
    } else if (row.detail.includes('SEARCH')) {
      complexity += 10;
    }
  }
  return complexity;
}
