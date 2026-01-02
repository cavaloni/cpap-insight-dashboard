# CPAP Insight Dashboard

A web application for analyzing CPAP therapy data with deterministic analytics and LLM-powered insights.

## Features

- **High-Frequency Data Support**: Handles ResMed AirSense 10 data at 25Hz (720,000 samples per 8-hour night)
- **3-Tier Data Architecture**: Optimized storage and querying for massive time-series data using Parquet + DuckDB
- **Data Upload**: Streaming CSV ingestion that processes high-frequency data without memory limits
- **Journal Upload**: Upload personal journal entries with automatic date parsing and RAG integration
- **Overview Dashboard**: View key metrics, trends, and anomalies
- **Analytics Tools**: 8 deterministic analysis functions (AHI, usage, pressure, leaks, quality score, journal search)
- **AI Insights**: Chat interface with LLM that cites evidence artifacts and searches journal entries
- **Evidence Tracking**: All insights reference computed artifacts with IDs
- **RAG-Powered Chat**: Semantic search through journal entries to provide personalized insights

## Tech Stack

- **Frontend**: Next.js 14 (App Router), React, TypeScript, TailwindCSS, shadcn/ui, Recharts
- **Backend**: Next.js API routes, SQLite (better-sqlite3)
- **Data Processing**: DuckDB for high-performance analytics on Parquet files
- **Data Storage**: Parquet files for columnar storage, SQLite for aggregates and metadata
- **AI**: OpenRouter API for LLM integration (Claude 3.5 Sonnet)

## 3-Tier Data Architecture

The application uses a sophisticated 3-tier data architecture to efficiently handle high-frequency CPAP data (25Hz sampling rate), supporting up to 720,000 samples per 8-hour night and 21.6 million samples per month.

### Tier 1 (Macro) - SQLite Aggregates
- **Storage**: SQLite `nightly_aggregates` table
- **Resolution**: 1 row per night
- **Purpose**: Dashboard, trends, RAG correlations
- **Contents**: AHI, usage minutes, pressure stats, leak stats, quality score, `parquet_path` reference

### Tier 2 (Meso) - On-the-fly Aggregation
- **Storage**: **NONE** (computed dynamically)
- **Resolution**: Configurable buckets (default 60 seconds)
- **Engine**: DuckDB queries Parquet files
- **API**: `GET /api/session/[id]/meso?bucket=60`
- **Purpose**: Night overview graphs without loading millions of points

### Tier 3 (Micro) - Raw Parquet Data
- **Storage**: Parquet files in `data/parquet/{session_id}.parquet`
- **Resolution**: Full 25Hz raw data
- **Features**: Columnar compression, predicate pushdown
- **API**: `GET /api/session/[id]/micro?start=X&end=Y&points=2000`
- **Purpose**: Zoom detail views with LTTB downsampling

### Performance Benefits

| Approach | 1 Month Storage | Query Performance | Memory Usage |
|----------|-----------------|-------------------|--------------|
| **Old (SQLite rows)** | ~1-2 GB | Slow aggregations | High |
| **New (Parquet + SQLite)** | ~150-300 MB | Fast columnar queries | Low |

### Why This Architecture?

- **Scalability**: Handles millions of samples without database bloat
- **Performance**: DuckDB's columnar queries are 10-100x faster than SQLite for analytics
- **Efficiency**: Only Tier 1 data is stored long-term; Tier 2 computed on-demand
- **Flexibility**: Easy to change aggregation logic without data migration
- **Cost**: 80% storage reduction for same analytical capabilities

1. Clone the repository:
```bash
git clone <repository-url>
cd cpap-insight-dashboard
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
# Create .env.local file in root directory
echo "OPENROUTER_API_KEY=your_api_key_here" > .env.local
echo "OPENAI_API_KEY=your_openai_api_key_here" >> .env.local  # Required for journal embeddings
# Edit .env.local and add your API keys
```

4. Initialize the database:
```bash
npm run dev
# The database will be created automatically on first run
```

5. Start the development server:
```bash
npm run dev
```

6. Open http://localhost:3000 in your browser

## Environment Variables

Create a `.env.local` file in the root directory:

```
OPENROUTER_API_KEY=your_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
```

Get your OpenRouter API key from [OpenRouter.ai](https://openrouter.ai/)
Get your OpenAI API key from [OpenAI Platform](https://platform.openai.com/) (required for journal embeddings)

## Data Format

Upload CPAP data in CSV format supporting high-frequency ResMed AirSense 10 data (25Hz sampling rate = 720,000 samples per 8-hour night).

### Supported Sampling Rates
- **25Hz**: Full-resolution AirSense 10 data (recommended)
- **1Hz**: Downsampled data (also supported)

### Streaming Ingestion
- **Memory Efficient**: Processes files line-by-line, no memory limits
- **Automatic Session Detection**: Groups data by date automatically
- **Real-time Processing**: Converts CSV → Parquet (Tier 3) + SQLite aggregates (Tier 1)
- **Progress Tracking**: Handles large files without blocking the UI

```csv
timestamp,leak_rate,pressure,flow_limitation,mask_on,event_type,event_duration,event_severity
2024-01-01 22:00:00,5.2,8.5,0.2,1,,,
2024-01-01 22:00:00.04,5.1,8.6,0.1,1,,,
2024-01-01 22:00:00.08,4.8,8.7,0.3,1,,,
```

### Column Descriptions

- `timestamp`: ISO 8601 datetime (YYYY-MM-DD HH:MM:SS)
- `leak_rate`: Leak rate in L/min
- `pressure`: Pressure in cm H2O
- `flow_limitation`: Flow limitation score (0-1)
- `mask_on`: 1 if mask is on, 0 if off
- `event_type`: Type of event (apnea, hypopnea, etc.)
- `event_duration`: Duration of event in seconds
- `event_severity`: Severity score (1-3)

## Analytics Tools

The application provides 8 deterministic analytics tools:

1. **getNightlySummary**: Daily metrics (AHI, usage, pressure, leaks, quality)
2. **getTrends**: Time series analysis with rolling averages
3. **detectAnomalies**: Statistical outlier detection
4. **correlate**: Correlation analysis between metrics
5. **compareRanges**: Compare metrics between date ranges
6. **getSessionBreakdown**: Detailed session analysis for a specific night
7. **searchJournal**: Semantic search through uploaded journal entries
8. **getJournalDateRange**: Get available journal entry dates

## Journal Upload & RAG

The journal feature allows users to upload personal journal entries that are automatically processed and made searchable through the AI chat:

### Supported Formats
- `.txt` files - Plain text journal entries
- `.md` files - Markdown formatted journals
- `.csv` files - Structured journal data

### Date Recognition
The parser automatically recognizes various date formats:
- ISO format: 2024-01-15 or 2024/01/15
- US format: 01/15/2024 or 1/15/2024
- European format: 15-01-2024 or 15/01/2024
- Natural language: "January 15, 2024" or "15 January 2024"
- Relative dates: "Yesterday", "Last Tuesday", etc.

### RAG Integration
- Journal entries are automatically chunked and embedded using OpenAI's text-embedding-3-small model
- Semantic search allows the AI to find relevant journal content based on user queries
- Results are ranked by similarity and can be filtered by date range
- Chat responses include relevant journal excerpts with proper citations

### Privacy & Security
- All journal data is stored locally in SQLite database
- Embeddings are generated using secure API calls
- No journal content is sent to third parties except for embedding generation
- Users maintain full control over their data

## Safety & Compliance

- **No Medical Advice**: The application provides informational analysis only
- **Evidence-Based**: All insights cite computed artifacts
- **Transparent**: Every claim references the underlying data
- **Disclaimer**: Medical decisions should be made with healthcare professionals

## Observability & Production Monitoring

This application demonstrates enterprise-grade observability practices with comprehensive tracking for LLM-powered features:

### 🔍 Langfuse Integration
- **Full Trace Visibility**: Every LLM interaction is traced with parent/child spans
- **Tool Execution Tracking**: All 6 analytics tools are individually instrumented
- **Cost Monitoring**: Real-time cost calculation per request using OpenRouter pricing
- **Performance Metrics**: Time-to-first-output tracking for user experience monitoring

### 📊 Key Metrics Tracked
- **Cost per Request**: Input/output tokens × model pricing
- **Success Rate**: User feedback via 👍/👎 buttons on responses
- **Time to First Output**: Latency from request to initial response
- **Token Usage**: Detailed breakdown for cost optimization
- **Validation Results**: Automated hallucination detection tracking

### 🎯 Business Intelligence
- **Cost per Successful Outcome**: Calculate ROI on LLM features
- **User Satisfaction**: Direct feedback collection on every response
- **Performance Analytics**: Identify bottlenecks in the analysis pipeline
- **Error Tracking**: Comprehensive error handling with trace correlation

### Implementation Highlights
```typescript
// Example: Cost tracking with trace correlation
const trace = langfuse.trace({
  name: 'cpap-analysis',
  input: { messages, model },
  metadata: { userId, timeToFirstOutputMs }
});

// User feedback scored for success metrics
await langfuse.score({
  traceId,
  name: 'user_feedback',
  value: feedback ? 1 : 0,
  dataType: 'BOOLEAN'
});
```

### Production Features
- **Graceful Degradation**: Observability disabled if credentials missing
- **Async Flush**: Ensures traces are sent before request completion
- **Type Safety**: Full TypeScript implementation with proper interfaces
- **Error Boundaries**: Comprehensive error tracking at every layer

This observability stack provides the insights needed to:
- Optimize LLM costs while maintaining quality
- Measure user satisfaction and feature adoption
- Debug issues with full request context
- Make data-driven decisions about AI features

### Environment Setup for Observability
```bash
# Add to .env.local for production monitoring
LANGFUSE_SECRET_KEY=your_langfuse_secret_key
LANGFUSE_PUBLIC_KEY=your_langfuse_public_key
LANGFUSE_HOST=https://cloud.langfuse.com  # or self-hosted
```

## API Endpoints

- `POST /api/upload`: Streaming CSV upload → Parquet (Tier 3) + SQLite aggregates (Tier 1)
- `GET /api/dashboard`: Get dashboard metrics from nightly aggregates (Tier 1)
- `GET /api/session/[id]/meso`: On-the-fly downsampled data (Tier 2) - configurable buckets
- `GET /api/session/[id]/micro`: Raw high-resolution data with LTTB downsampling (Tier 3)
- `POST /api/chat`: Send chat messages to AI
- `GET /api/journal/search`: Semantic search through journal entries

## Architecture

### Data Flow Architecture
```
CSV Upload → Streaming Ingestion → Parquet (Tier 3) + SQLite Aggregates (Tier 1)

┌─────────────────────────────────────────────────────────────────────────┐
│                           Frontend Layer                                │
│  Dashboard (Tier 1) ← Meso API (Tier 2) ← Micro API (Tier 3)          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
            ┌───────▼──────┐ ┌──────▼──────┐ ┌─────▼─────┐
            │  Tier 1      │ │  Tier 2      │ │  Tier 3    │
            │  SQLite       │ │  DuckDB       │ │  Parquet   │
            │  Aggregates   │ │  On-the-fly   │ │  Raw Data  │
            │  (Nightly)    │ │  Aggregation  │ │  (25Hz)    │
            └───────────────┘ └───────────────┘ └────────────┘
                    ↑               ↑               ↑
               Dashboard       Session View    Zoom Detail
               Trends          1-min buckets   LTTB sampling
               RAG Context     No storage      Predicate pushdown
```

### Directory Structure
```
src/
├── app/                 # Next.js app router
│   ├── api/            # API routes
│   │   ├── upload/     # Streaming CSV upload
│   │   ├── session/    # Meso/Micro data APIs
│   │   └── dashboard/  # Macro dashboard API
│   └── page.tsx        # Main dashboard page
├── components/         # React components
│   ├── ui/            # UI primitives
│   ├── upload/        # Data upload interface
│   ├── dashboard/     # Dashboard components
│   └── chat/          # Chat interface
├── lib/               # Core libraries
│   ├── db/           # SQLite schema and connection
│   ├── data/         # Data ingestion & DuckDB services
│   │   ├── streaming-ingest.ts  # CSV → Parquet pipeline
│   │   └── duckdb-service.ts    # DuckDB operations
│   ├── analytics/    # Analytics tools
│   └── llm/          # LLM integration
└── types/            # TypeScript types

data/
├── parquet/          # Tier 3: Raw Parquet files
└── database.db       # Tier 1: SQLite aggregates
```

## Adding New Metrics

1. Update `METRIC_DEFINITIONS` in `src/lib/db/schema.ts`
2. Modify the analytics tools in `src/lib/analytics/tools.ts`
3. Update the dashboard UI components
4. Add the metric to the LLM system prompt

## Sample Data

A sample CPAP data file (`sample-cpap-data.csv`) is included for testing. Upload it through the interface to see the dashboard in action.

## Development

- Build: `npm run build`
- Start: `npm run dev`
- Lint: `npm run lint`
- Type check: `npm run type-check`

## License

MIT License - see LICENSE file for details

## Support

For issues and questions, please create an issue in the repository.
