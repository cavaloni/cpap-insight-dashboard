import Database from 'better-sqlite3';

export function initDatabase(db: Database.Database) {
  // Raw time-series data table
  db.exec(`
    CREATE TABLE IF NOT EXISTS cpap_samples (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      leak_rate REAL,
      pressure REAL,
      flow_limitation REAL,
      mask_on INTEGER DEFAULT 0,
      session_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Events table (apnea/hypopnea, leaks, etc.)
  db.exec(`
    CREATE TABLE IF NOT EXISTS cpap_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      event_type TEXT NOT NULL,
      duration_seconds REAL,
      severity REAL,
      session_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Nightly aggregates table
  db.exec(`
    CREATE TABLE IF NOT EXISTS nightly_aggregates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL UNIQUE,
      session_id TEXT,
      
      -- Usage metrics
      total_usage_minutes REAL,
      mask_on_minutes REAL,
      
      -- Pressure metrics
      median_pressure REAL,
      min_pressure REAL,
      max_pressure REAL,
      pressure_95th_percentile REAL,
      
      -- Leak metrics
      median_leak_rate REAL,
      max_leak_rate REAL,
      leak_95th_percentile REAL,
      large_leak_minutes REAL,
      large_leak_percent REAL,
      
      -- Event metrics
      ahi REAL,
      apnea_count INTEGER,
      hypopnea_count INTEGER,
      total_events INTEGER,
      
      -- Flow metrics
      median_flow_limitation REAL,
      max_flow_limitation REAL,
      
      -- Quality indicators
      sleep_quality_score REAL,
      
      -- Tier 3 reference (Parquet file path for raw data)
      parquet_path TEXT,
      
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Evidence artifacts table for LLM tool outputs
  db.exec(`
    CREATE TABLE IF NOT EXISTS evidence_artifacts (
      id TEXT PRIMARY KEY,
      tool_name TEXT NOT NULL,
      parameters TEXT NOT NULL,
      result TEXT NOT NULL,
      provenance TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // User annotations (sleep diary)
  db.exec(`
    CREATE TABLE IF NOT EXISTS sleep_annotations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      note TEXT,
      factors TEXT, -- JSON array of factors like alcohol, congestion, etc.
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Journal entries table
  db.exec(`
    CREATE TABLE IF NOT EXISTS journal_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_date TEXT NOT NULL,
      content TEXT NOT NULL,
      metadata TEXT, -- JSON for additional metadata
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Journal embeddings for RAG
  db.exec(`
    CREATE TABLE IF NOT EXISTS journal_embeddings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      journal_entry_id INTEGER NOT NULL,
      chunk_text TEXT NOT NULL,
      embedding BLOB NOT NULL, -- Stored as binary blob
      chunk_index INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE CASCADE
    );
  `);

  // Chat logs for debugging and history
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request TEXT NOT NULL,
      response TEXT NOT NULL,
      model_used TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Data metadata table for tracking uploads and other metadata
  db.exec(`
    CREATE TABLE IF NOT EXISTS data_metadata (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create indexes for performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_cpap_samples_timestamp ON cpap_samples(timestamp);
    CREATE INDEX IF NOT EXISTS idx_cpap_samples_session ON cpap_samples(session_id);
    CREATE INDEX IF NOT EXISTS idx_cpap_events_timestamp ON cpap_events(timestamp);
    CREATE INDEX IF NOT EXISTS idx_cpap_events_session ON cpap_events(session_id);
    CREATE INDEX IF NOT EXISTS idx_nightly_aggregates_date ON nightly_aggregates(date);
    CREATE INDEX IF NOT EXISTS idx_evidence_artifacts_tool ON evidence_artifacts(tool_name);
    CREATE INDEX IF NOT EXISTS idx_sleep_annotations_date ON sleep_annotations(date);
    CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON journal_entries(entry_date);
    CREATE INDEX IF NOT EXISTS idx_journal_embeddings_entry ON journal_embeddings(journal_entry_id);
  `);

  // Migrations for existing databases
  runMigrations(db);
}

function runMigrations(db: Database.Database) {
  // Check if parquet_path column exists in nightly_aggregates
  const columns = db.prepare(`PRAGMA table_info(nightly_aggregates)`).all() as Array<{ name: string }>;
  const hasParquetPath = columns.some(col => col.name === 'parquet_path');
  
  if (!hasParquetPath) {
    db.exec(`ALTER TABLE nightly_aggregates ADD COLUMN parquet_path TEXT`);
  }
}

// Metric definitions registry
export const METRIC_DEFINITIONS = {
  ahi: {
    name: 'Apnea-Hypopnea Index',
    unit: 'events/hour',
    description: 'Number of apnea and hypopnea events per hour of sleep',
    category: 'events'
  },
  median_leak_rate: {
    name: 'Median Leak Rate',
    unit: 'L/min',
    description: 'Median rate of air leak from the mask',
    category: 'leak'
  },
  median_pressure: {
    name: 'Median Pressure',
    unit: 'cm H2O',
    description: 'Median therapeutic pressure delivered by the device',
    category: 'pressure'
  },
  median_flow_limitation: {
    name: 'Median Flow Limitation',
    unit: 'score',
    description: 'Median measure of airflow limitation',
    category: 'flow'
  },
  total_usage_minutes: {
    name: 'Total Usage',
    unit: 'minutes',
    description: 'Total time the device was used',
    category: 'usage'
  },
  mask_on_minutes: {
    name: 'Mask On Time',
    unit: 'minutes',
    description: 'Time the mask was properly sealed',
    category: 'usage'
  },
  large_leak_percent: {
    name: 'Large Leak Percentage',
    unit: '%',
    description: 'Percentage of time with significant mask leak',
    category: 'leak'
  },
  sleep_quality_score: {
    name: 'Sleep Quality Score',
    unit: 'score (0-100)',
    description: 'Overall sleep quality based on multiple factors',
    category: 'quality'
  }
} as const;

export type MetricName = keyof typeof METRIC_DEFINITIONS;
