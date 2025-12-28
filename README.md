# CPAP Insight Dashboard

A web application for analyzing CPAP therapy data with deterministic analytics and LLM-powered insights.

## Features

- **Data Upload**: Import CPAP data from CSV files (simplified format)
- **Overview Dashboard**: View key metrics, trends, and anomalies
- **Analytics Tools**: 6 deterministic analysis functions (AHI, usage, pressure, leaks, quality score)
- **AI Insights**: Chat interface with LLM that cites evidence artifacts
- **Evidence Tracking**: All insights reference computed artifacts with IDs

## Tech Stack

- **Frontend**: Next.js 14 (App Router), React, TypeScript, TailwindCSS, shadcn/ui, Recharts
- **Backend**: Next.js API routes, SQLite (better-sqlite3)
- **AI**: OpenRouter API for LLM integration (Claude 3.5 Sonnet)

## Setup

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
# Edit .env.local and add your OpenRouter API key
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
```

Get your API key from [OpenRouter.ai](https://openrouter.ai/)

## Data Format

Upload CPAP data in CSV format with the following columns:

```csv
timestamp,leak_rate,pressure,flow_limitation,mask_on,event_type,event_duration,event_severity
2024-01-01 22:00:00,5.2,8.5,0.2,1,,,
2024-01-01 22:05:00,4.8,8.6,0.1,1,,,
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

The application provides 6 deterministic analytics tools:

1. **getNightlySummary**: Daily metrics (AHI, usage, pressure, leaks, quality)
2. **getTrends**: Time series analysis with rolling averages
3. **detectAnomalies**: Statistical outlier detection
4. **correlate**: Correlation analysis between metrics
5. **compareRanges**: Compare metrics between date ranges
6. **getSessionBreakdown**: Detailed session analysis for a specific night

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

- `POST /api/upload`: Upload CPAP data
- `GET /api/dashboard`: Get dashboard metrics
- `POST /api/chat`: Send chat messages to AI

## Architecture

```
src/
├── app/                 # Next.js app router
│   ├── api/            # API routes
│   └── page.tsx        # Main dashboard page
├── components/         # React components
│   ├── ui/            # UI primitives
│   ├── upload/        # Data upload interface
│   ├── dashboard/     # Dashboard components
│   └── chat/          # Chat interface
├── lib/               # Core libraries
│   ├── db/           # Database schema and connection
│   ├── data/         # Data ingestion
│   ├── analytics/    # Analytics tools
│   └── llm/          # LLM integration
└── types/            # TypeScript types
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
