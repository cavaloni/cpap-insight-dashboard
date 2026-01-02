import * as duckdb from 'duckdb';
import path from 'path';
import fs from 'fs';

// Singleton DuckDB instance
let db: duckdb.Database | null = null;

const DATA_DIR = path.join(process.cwd(), 'data');
const PARQUET_DIR = path.join(DATA_DIR, 'parquet');

// Ensure directories exist
if (!fs.existsSync(PARQUET_DIR)) {
  fs.mkdirSync(PARQUET_DIR, { recursive: true });
}

/**
 * Get the DuckDB database instance (in-memory for queries)
 */
export function getDuckDB(): duckdb.Database {
  if (!db) {
    db = new duckdb.Database(':memory:');
  }
  return db;
}

/**
 * Close the DuckDB connection
 */
export function closeDuckDB(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Get the path for a session's Parquet file
 */
export function getParquetPath(sessionId: string): string {
  return path.join(PARQUET_DIR, `${sessionId}.parquet`);
}

/**
 * Check if a Parquet file exists for a session
 */
export function parquetExists(sessionId: string): boolean {
  return fs.existsSync(getParquetPath(sessionId));
}

/**
 * Write raw CPAP samples to a Parquet file using DuckDB
 * This is the Tier 3 (Micro) storage
 */
export async function writeToParquet(
  sessionId: string,
  samples: Array<{
    timestamp: number; // Unix timestamp in ms
    flow_rate: number;
    pressure: number;
    leak_rate: number;
    mask_on: number;
  }>
): Promise<string> {
  const db = getDuckDB();
  const parquetPath = getParquetPath(sessionId);
  
  return new Promise((resolve, reject) => {
    db.run(`
      CREATE OR REPLACE TABLE temp_samples (
        timestamp BIGINT,
        flow_rate FLOAT,
        pressure FLOAT,
        leak_rate FLOAT,
        mask_on INTEGER
      )
    `, (err) => {
      if (err) return reject(err);
      
      // Insert data in batches
      const stmt = db.prepare(`
        INSERT INTO temp_samples VALUES (?, ?, ?, ?, ?)
      `);
      
      for (const sample of samples) {
        stmt.run(
          sample.timestamp,
          sample.flow_rate,
          sample.pressure,
          sample.leak_rate,
          sample.mask_on
        );
      }
      
      stmt.finalize((err) => {
        if (err) return reject(err);
        
        // Export to Parquet
        db.run(`
          COPY temp_samples TO '${parquetPath}' (FORMAT PARQUET, COMPRESSION SNAPPY)
        `, (err) => {
          if (err) return reject(err);
          
          // Clean up temp table
          db.run(`DROP TABLE temp_samples`, (err) => {
            if (err) return reject(err);
            resolve(parquetPath);
          });
        });
      });
    });
  });
}

/**
 * Tier 2 (Meso) Query: Get downsampled data on-the-fly
 * Aggregates 25Hz data into 1-minute buckets without storing
 */
export async function getMesoView(
  sessionId: string,
  bucketSeconds: number = 60
): Promise<Array<{
  bucket_start: number;
  flow_min: number;
  flow_max: number;
  flow_avg: number;
  pressure_avg: number;
  leak_max: number;
  mask_on_pct: number;
}>> {
  const parquetPath = getParquetPath(sessionId);
  
  if (!fs.existsSync(parquetPath)) {
    throw new Error(`Parquet file not found for session: ${sessionId}`);
  }
  
  const db = getDuckDB();
  
  return new Promise((resolve, reject) => {
    const query = `
      SELECT 
        (timestamp / ${bucketSeconds * 1000}) * ${bucketSeconds * 1000} as bucket_start,
        MIN(flow_rate) as flow_min,
        MAX(flow_rate) as flow_max,
        AVG(flow_rate) as flow_avg,
        AVG(pressure) as pressure_avg,
        MAX(leak_rate) as leak_max,
        AVG(mask_on) * 100 as mask_on_pct
      FROM read_parquet('${parquetPath}')
      GROUP BY bucket_start
      ORDER BY bucket_start ASC
    `;
    
    db.all(query, (err, rows) => {
      if (err) return reject(err);
      resolve(rows as any);
    });
  });
}

/**
 * Tier 3 (Micro) Query: Get raw high-resolution data for a time range
 * Uses predicate pushdown to only read the needed chunks
 */
export async function getMicroView(
  sessionId: string,
  startTime: number,
  endTime: number
): Promise<Array<{
  timestamp: number;
  flow_rate: number;
  pressure: number;
  leak_rate: number;
  mask_on: number;
}>> {
  const parquetPath = getParquetPath(sessionId);
  
  if (!fs.existsSync(parquetPath)) {
    throw new Error(`Parquet file not found for session: ${sessionId}`);
  }
  
  const db = getDuckDB();
  
  return new Promise((resolve, reject) => {
    const query = `
      SELECT timestamp, flow_rate, pressure, leak_rate, mask_on
      FROM read_parquet('${parquetPath}')
      WHERE timestamp >= ${startTime} AND timestamp <= ${endTime}
      ORDER BY timestamp ASC
    `;
    
    db.all(query, (err, rows) => {
      if (err) return reject(err);
      resolve(rows as any);
    });
  });
}

/**
 * LTTB (Largest-Triangle-Three-Buckets) downsampling algorithm
 * Preserves visual shape while reducing data points
 */
export function lttbDownsample<T extends { timestamp: number; value: number }>(
  data: T[],
  targetPoints: number
): T[] {
  if (data.length <= targetPoints) return data;
  
  const result: T[] = [];
  const bucketSize = (data.length - 2) / (targetPoints - 2);
  
  // Always keep first point
  result.push(data[0]);
  
  let a = 0; // Previous selected point index
  
  for (let i = 0; i < targetPoints - 2; i++) {
    // Calculate bucket range
    const bucketStart = Math.floor((i + 1) * bucketSize) + 1;
    const bucketEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1, data.length - 1);
    
    // Calculate average point for next bucket (for triangle area calculation)
    let avgX = 0;
    let avgY = 0;
    const nextBucketStart = Math.floor((i + 2) * bucketSize) + 1;
    const nextBucketEnd = Math.min(Math.floor((i + 3) * bucketSize) + 1, data.length - 1);
    const nextBucketSize = nextBucketEnd - nextBucketStart;
    
    for (let j = nextBucketStart; j < nextBucketEnd; j++) {
      avgX += data[j].timestamp;
      avgY += data[j].value;
    }
    avgX /= nextBucketSize || 1;
    avgY /= nextBucketSize || 1;
    
    // Find point in current bucket with largest triangle area
    let maxArea = -1;
    let maxAreaIndex = bucketStart;
    
    const pointAX = data[a].timestamp;
    const pointAY = data[a].value;
    
    for (let j = bucketStart; j < bucketEnd; j++) {
      // Calculate triangle area
      const area = Math.abs(
        (pointAX - avgX) * (data[j].value - pointAY) -
        (pointAX - data[j].timestamp) * (avgY - pointAY)
      ) * 0.5;
      
      if (area > maxArea) {
        maxArea = area;
        maxAreaIndex = j;
      }
    }
    
    result.push(data[maxAreaIndex]);
    a = maxAreaIndex;
  }
  
  // Always keep last point
  result.push(data[data.length - 1]);
  
  return result;
}

/**
 * Get session statistics from Parquet file
 */
export async function getSessionStats(sessionId: string): Promise<{
  total_samples: number;
  start_time: number;
  end_time: number;
  duration_minutes: number;
  avg_pressure: number;
  avg_leak: number;
  max_leak: number;
}> {
  const parquetPath = getParquetPath(sessionId);
  
  if (!fs.existsSync(parquetPath)) {
    throw new Error(`Parquet file not found for session: ${sessionId}`);
  }
  
  const db = getDuckDB();
  
  return new Promise((resolve, reject) => {
    const query = `
      SELECT 
        COUNT(*) as total_samples,
        MIN(timestamp) as start_time,
        MAX(timestamp) as end_time,
        (MAX(timestamp) - MIN(timestamp)) / 60000.0 as duration_minutes,
        AVG(pressure) as avg_pressure,
        AVG(leak_rate) as avg_leak,
        MAX(leak_rate) as max_leak
      FROM read_parquet('${parquetPath}')
    `;
    
    db.get(query, (err, row) => {
      if (err) return reject(err);
      resolve(row as any);
    });
  });
}
