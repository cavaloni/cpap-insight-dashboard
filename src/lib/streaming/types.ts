// Streaming event types for premium chat experience

export type StreamEventType = 
  | 'status'      // Status updates like "Analyzing your sleep data..."
  | 'thinking'    // Initial thinking message before tools
  | 'tool_start'  // Tool execution started
  | 'tool_end'    // Tool execution completed
  | 'text'        // Streamed text chunks from LLM
  | 'citation'    // Citation/artifact reference
  | 'error'       // Error occurred
  | 'complete';   // Stream finished

export interface StreamEvent {
  type: StreamEventType;
  data: StreamEventData;
  timestamp: number;
}

export interface StreamEventData {
  // For status/thinking events
  message?: string;
  
  // For tool events
  toolName?: string;
  toolDisplayName?: string;
  
  // For text events
  chunk?: string;
  
  // For citation events
  artifactId?: string;
  toolSource?: string;
  
  // For error events
  error?: string;
  
  // For complete events
  fullMessage?: string;
  toolsExecuted?: number;
  citations?: number;
}

// User-friendly tool names and status messages
export const TOOL_DISPLAY_INFO: Record<string, { displayName: string; statusMessage: string }> = {
  getNightlySummary: {
    displayName: 'Nightly Summary',
    statusMessage: 'Reviewing your nightly CPAP metrics...'
  },
  getTrends: {
    displayName: 'Trend Analysis',
    statusMessage: 'Analyzing trends over time...'
  },
  detectAnomalies: {
    displayName: 'Anomaly Detection',
    statusMessage: 'Looking for unusual patterns in your data...'
  },
  correlate: {
    displayName: 'Correlation Analysis',
    statusMessage: 'Calculating correlations between metrics...'
  },
  compareRanges: {
    displayName: 'Period Comparison',
    statusMessage: 'Comparing different time periods...'
  },
  getSessionBreakdown: {
    displayName: 'Session Details',
    statusMessage: 'Breaking down your sleep session...'
  },
  analyzeBestSleep: {
    displayName: 'Best Sleep Analysis',
    statusMessage: 'Identifying your best sleep nights and contributing factors...'
  },
  executeCustomQuery: {
    displayName: 'Custom Analysis',
    statusMessage: 'Running custom analysis on your data...'
  },
  searchJournal: {
    displayName: 'Journal Search',
    statusMessage: 'Searching your journal entries for relevant patterns...'
  },
  getJournalDateRange: {
    displayName: 'Journal Overview',
    statusMessage: 'Checking your journal entry history...'
  }
};

// Initial thinking messages based on query intent
export const THINKING_MESSAGES: Record<string, string[]> = {
  cpap_only: [
    "Let me analyze your CPAP therapy data...",
    "I'll look into your sleep metrics for this period...",
    "Examining your therapy data to find insights..."
  ],
  journal_only: [
    "Let me search through your journal entries...",
    "I'll look for relevant notes in your journal...",
    "Searching your personal notes for context..."
  ],
  cpap_plus_journal: [
    "Let me analyze your sleep data and journal entries together...",
    "I'll correlate your CPAP metrics with your journal notes...",
    "Combining your therapy data with your personal observations..."
  ],
  unknown: [
    "Let me look into that for you...",
    "I'll analyze your data to answer that...",
    "Examining your sleep information..."
  ]
};

// Helper to get a random thinking message
export function getThinkingMessage(intent: string): string {
  const messages = THINKING_MESSAGES[intent] || THINKING_MESSAGES.unknown;
  return messages[Math.floor(Math.random() * messages.length)];
}

// Helper to get tool display info
export function getToolInfo(toolName: string): { displayName: string; statusMessage: string } {
  return TOOL_DISPLAY_INFO[toolName] || {
    displayName: toolName,
    statusMessage: `Processing ${toolName}...`
  };
}

// Encode event for SSE
export function encodeSSEEvent(event: StreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

// Parse SSE event
export function parseSSEEvent(data: string): StreamEvent | null {
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}
