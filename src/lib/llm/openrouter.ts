import { METRIC_DEFINITIONS, MetricName } from '@/lib/db/schema';
import { ToolResult } from '@/lib/analytics/tools';
import { getLangfuseClient } from '@/lib/observability/langfuse';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolMessage {
  role: 'tool';
  content: string;
  tool_call_id: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatRequest {
  messages: ChatMessage[];
  dateRange: { start: string; end: string };
  selectedMetrics?: MetricName[];
  userContext?: string;
  model?: string;
}

export interface ChatResponse {
  message: string;
  tool_calls_executed: ToolCall[];
  evidence_artifacts: string[];
  model_used: string;
  citations: Citation[];
}

export interface Citation {
  artifact_id: string;
  tool_name: string;
  snippet: string;
}

// Tool definitions for function calling
export const TOOL_DEFINITIONS = [
  {
    name: 'getNightlySummary',
    description: 'Get nightly summary metrics for a date range including AHI, usage, pressure, leaks, and quality score',
    parameters: {
      type: 'object',
      properties: {
        dateRange: {
          type: 'object',
          properties: {
            start: { type: 'string', description: 'Start date in YYYY-MM-DD format' },
            end: { type: 'string', description: 'End date in YYYY-MM-DD format' }
          },
          required: ['start', 'end']
        }
      },
      required: ['dateRange']
    }
  },
  {
    name: 'getTrends',
    description: 'Analyze trends for a specific metric over time with rolling averages',
    parameters: {
      type: 'object',
      properties: {
        metric: { 
          type: 'string', 
          enum: Object.keys(METRIC_DEFINITIONS),
          description: 'The metric to analyze trends for'
        },
        dateRange: {
          type: 'object',
          properties: {
            start: { type: 'string' },
            end: { type: 'string' }
          },
          required: ['start', 'end']
        },
        window: { 
          type: 'number', 
          description: 'Rolling average window in days (default: 7)',
          default: 7
        }
      },
      required: ['metric', 'dateRange']
    }
  },
  {
    name: 'detectAnomalies',
    description: 'Detect outlier nights for a specific metric using statistical analysis',
    parameters: {
      type: 'object',
      properties: {
        metric: { 
          type: 'string', 
          enum: Object.keys(METRIC_DEFINITIONS)
        },
        dateRange: {
          type: 'object',
          properties: {
            start: { type: 'string' },
            end: { type: 'string' }
          },
          required: ['start', 'end']
        },
        threshold: { 
          type: 'number', 
          description: 'Z-score threshold for anomaly detection (default: 2)',
          default: 2
        }
      },
      required: ['metric', 'dateRange']
    }
  },
  {
    name: 'correlate',
    description: 'Calculate correlation between two metrics',
    parameters: {
      type: 'object',
      properties: {
        metricA: { 
          type: 'string', 
          enum: Object.keys(METRIC_DEFINITIONS)
        },
        metricB: { 
          type: 'string', 
          enum: Object.keys(METRIC_DEFINITIONS)
        },
        dateRange: {
          type: 'object',
          properties: {
            start: { type: 'string' },
            end: { type: 'string' }
          },
          required: ['start', 'end']
        }
      },
      required: ['metricA', 'metricB', 'dateRange']
    }
  },
  {
    name: 'compareRanges',
    description: 'Compare metrics between two date ranges',
    parameters: {
      type: 'object',
      properties: {
        rangeA: {
          type: 'object',
          properties: {
            start: { type: 'string' },
            end: { type: 'string' }
          },
          required: ['start', 'end']
        },
        rangeB: {
          type: 'object',
          properties: {
            start: { type: 'string' },
            end: { type: 'string' }
          },
          required: ['start', 'end']
        },
        metrics: { 
          type: 'array', 
          items: { type: 'string', enum: Object.keys(METRIC_DEFINITIONS) },
          description: 'List of metrics to compare'
        }
      },
      required: ['rangeA', 'rangeB', 'metrics']
    }
  },
  {
    name: 'getSessionBreakdown',
    description: 'Get detailed session breakdown for a specific night',
    parameters: {
      type: 'object',
      properties: {
        date: { 
          type: 'string', 
          description: 'Date in YYYY-MM-DD format'
        }
      },
      required: ['date']
    }
  },
  {
    name: 'analyzeBestSleep',
    description: 'Find the best sleep nights (by sleep_quality_score) and compute which metrics correlate with sleep_quality_score over the date range',
    parameters: {
      type: 'object',
      properties: {
        dateRange: {
          type: 'object',
          properties: {
            start: { type: 'string', description: 'Start date in YYYY-MM-DD format' },
            end: { type: 'string', description: 'End date in YYYY-MM-DD format' }
          },
          required: ['start', 'end']
        },
        topN: {
          type: 'number',
          description: 'How many best nights to include (default: 5)',
          default: 5
        }
      },
      required: ['dateRange']
    }
  },
  {
    name: 'executeCustomQuery',
    description: 'Execute a custom SQL query on CPAP data for analysis not covered by standard tools',
    parameters: {
      type: 'object',
      properties: {
        naturalLanguageQuery: {
          type: 'string',
          description: 'Natural language description of the analysis you want to perform'
        },
        dateRange: {
          type: 'object',
          properties: {
            start: { type: 'string', description: 'Start date in YYYY-MM-DD format' },
            end: { type: 'string', description: 'End date in YYYY-MM-DD format' }
          },
          required: ['start', 'end']
        }
      },
      required: ['naturalLanguageQuery']
    }
  },
  {
    name: 'searchJournal',
    description: 'Search journal entries for relevant content using semantic similarity',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query to find relevant journal entries'
        },
        dateRange: {
          type: 'object',
          properties: {
            start: { type: 'string', description: 'Start date in YYYY-MM-DD format' },
            end: { type: 'string', description: 'End date in YYYY-MM-DD format' }
          },
          description: 'Optional date range to filter journal entries'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return (default: 5)',
          default: 5
        }
      },
      required: ['query']
    }
  },
  {
    name: 'getJournalDateRange',
    description: 'Get the available date range and count of journal entries',
    parameters: {
      type: 'object',
      properties: {},
      required: []
    }
  }
];

export class OpenRouterClient {
  private apiKey: string;
  private baseUrl = 'https://openrouter.ai/api/v1';
  private defaultModel = 'anthropic/claude-3.5-sonnet';
  private defaultEmbeddingModel = 'openai/text-embedding-3-large';
  
  // OpenRouter pricing per 1M tokens (approximate, check current rates)
  private MODEL_PRICING = {
    'anthropic/claude-3.5-sonnet': { input: 3, output: 15 },
    'anthropic/claude-3-haiku': { input: 0.25, output: 1.25 },
    'openai/gpt-4o': { input: 2.5, output: 10 },
    'openai/gpt-4o-mini': { input: 0.15, output: 0.6 },
  };
  
  // Embedding pricing per 1M tokens
  private EMBEDDING_PRICING = {
    'openai/text-embedding-3-large': { input: 0.13 },
    'openai/text-embedding-3-small': { input: 0.02 },
    'qwen/qwen3-embedding-8b': { input: 0.01 },
    'google/gemini-embedding-001': { input: 0.025 },
  };

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.OPENROUTER_API_KEY || '';
    if (!this.apiKey) {
      throw new Error('OpenRouter API key is required');
    }
  }

  // Generate embeddings using OpenRouter's API
  async generateEmbedding(text: string, model?: string): Promise<number[]> {
    const embeddingModel = model || this.defaultEmbeddingModel;
    
    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'CPAP Insight Dashboard'
      },
      body: JSON.stringify({
        model: embeddingModel,
        input: text,
        encoding_format: 'float'
      })
    });

    if (!response.ok) {
      throw new Error(`OpenRouter embeddings API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data[0].embedding;
  }

  async chat(request: ChatRequest): Promise<ChatResponse & { traceId?: string }> {
    const model = request.model || this.defaultModel;
    const langfuse = getLangfuseClient();
    const startTime = Date.now();
    
    // Create main trace for the entire chat interaction
    const trace = langfuse.trace({
      name: 'cpap-analysis',
      input: {
        messages: request.messages,
        dateRange: request.dateRange,
        selectedMetrics: request.selectedMetrics,
        model
      },
      metadata: {
        userContext: request.userContext,
        toolCount: TOOL_DEFINITIONS.length
      }
    });
    
    // Optional router/planner step to improve tool reliability
    const routingSpan = trace.span({
      name: 'router',
      input: {
        model,
        messageCount: request.messages.length,
        dateRange: request.dateRange
      }
    });

    const routing = await this.routeRequest(request).catch((error) => {
      routingSpan.end({
        output: {
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      });
      return null;
    });

    if (routing) {
      routingSpan.end({
        output: routing
      });
    }

    // Build system message with strict instructions
    const systemMessage: ChatMessage = {
      role: 'system',
      content: this.buildSystemPrompt(request, routing)
    };

    // Prepare messages with context
    const messages: (ChatMessage | ToolMessage)[] = [systemMessage, ...request.messages];

    const executedToolCalls: ToolCall[] = [];
    const evidenceArtifacts: string[] = [];
    const toolResults: { [key: string]: ToolResult } = {};

    const maxIterations = 5;
    let totalUsage: any = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    let timeToFirstOutput: number | null = null;

    try {
      for (let iteration = 0; iteration < maxIterations; iteration++) {
        const llmSpan = trace.span({
          name: iteration === 0 ? 'initial-llm-call' : 'react-llm-call',
          input: {
            model,
            iteration,
            messageCount: messages.length,
            hasToolChoice: true
          }
        });

        const llmResponse = await this.makeAPIRequest({
          model,
          messages,
          tools: TOOL_DEFINITIONS,
          tool_choice: 'auto'
        });

        if (!timeToFirstOutput) {
          timeToFirstOutput = Date.now() - startTime;
        }

        const usage = llmResponse.usage;
        if (usage) {
          totalUsage.prompt_tokens += usage.prompt_tokens || 0;
          totalUsage.completion_tokens += usage.completion_tokens || 0;
          totalUsage.total_tokens += usage.total_tokens || 0;
        }

        const assistantMessage = llmResponse.choices[0]?.message;
        const assistantContent = assistantMessage?.content || '';
        const toolCalls = assistantMessage?.tool_calls || [];

        llmSpan.end({
          output: {
            toolCallsRequested: toolCalls.length,
            responseLength: assistantContent.length,
            usage
          }
        });

        // Always persist the assistant message (even if it has tool calls)
        messages.push({
          role: 'assistant',
          content: assistantContent,
          tool_calls: toolCalls.length ? toolCalls : undefined
        });

        if (!toolCalls.length) {
          const citations = this.extractCitations(assistantContent, toolResults);
          const response = {
            message: assistantContent,
            tool_calls_executed: executedToolCalls,
            evidence_artifacts: evidenceArtifacts,
            model_used: model,
            citations
          };

          const validation = validateResponse(response, Object.values(toolResults));

          trace.update({
            output: {
              message: assistantContent,
              toolCallsExecuted: executedToolCalls.length,
              citations: citations.length,
              model,
              totalTokens: totalUsage.total_tokens || 0,
              totalCost: this.calculateCost(totalUsage, model)
            },
            metadata: {
              validationPassed: validation,
              evidenceArtifacts,
              userId: (request.userContext as any)?.userId,
              timeToFirstOutputMs: timeToFirstOutput
            }
          });

          await langfuse.flushAsync();

          return {
            ...response,
            traceId: trace.id
          };
        }

        // Execute tool calls
        const toolExecutionSpan = trace.span({
          name: 'tool-execution',
          input: {
            iteration,
            toolCallsCount: toolCalls.length,
            toolNames: toolCalls.map((tc: any) => tc.function.name)
          }
        });

        for (const toolCall of toolCalls) {
          const result = await this.executeToolCall(toolCall, trace);
          executedToolCalls.push(toolCall);
          evidenceArtifacts.push(result.provenance.artifactId);
          toolResults[toolCall.id] = result;

          // Add tool result using proper tool role message schema
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify({
              tool: toolCall.function.name,
              artifactId: result.provenance.artifactId,
              data: result.data,
              provenance: result.provenance
            })
          });
        }

        toolExecutionSpan.end({
          output: {
            toolsExecuted: toolCalls.length,
            evidenceArtifacts: evidenceArtifacts.length
          }
        });
      }

      // Max iterations reached
      const fallbackMessage =
        'I was unable to complete the analysis within the tool-calling limit. Please try rephrasing or narrowing the question.';
      trace.update({
        output: {
          message: fallbackMessage,
          toolCallsExecuted: executedToolCalls.length,
          citations: 0,
          model,
          totalTokens: totalUsage.total_tokens || 0,
          totalCost: this.calculateCost(totalUsage, model)
        },
        metadata: {
          validationPassed: false,
          evidenceArtifacts,
          userId: (request.userContext as any)?.userId,
          timeToFirstOutputMs: timeToFirstOutput
        }
      });

      await langfuse.flushAsync();

      return {
        message: fallbackMessage,
        tool_calls_executed: executedToolCalls,
        evidence_artifacts: evidenceArtifacts,
        model_used: model,
        citations: [],
        traceId: trace.id
      };
    } catch (error) {
      trace.update({
        output: {
          error: error instanceof Error ? error.message : 'Unknown error',
          phase: 'react-loop'
        }
      });
      await langfuse.flushAsync();
      throw error;
    }
  }

  private buildSystemPrompt(
    request: ChatRequest,
    routing?: {
      intent: 'cpap_only' | 'journal_only' | 'cpap_plus_journal' | 'unknown';
      requiredTools: string[];
      notes: string;
    } | null
  ): string {
    const dateRangeText = `Current date range: ${request.dateRange.start} to ${request.dateRange.end}`;
    const metricsText = request.selectedMetrics ? 
      `Focus metrics: ${request.selectedMetrics.join(', ')}` : '';
    const contextText = request.userContext ? `User context: ${request.userContext}` : '';

    const routingText = routing
      ? `\nROUTER GUIDANCE (must follow):\n- intent: ${routing.intent}\n- requiredTools: ${routing.requiredTools.join(', ') || 'none'}\n- notes: ${routing.notes}\n`
      : '';

    return `You are a CPAP data analyst assistant. Your role is to help users understand their CPAP therapy data using ONLY the computed results from analytical tools.

IMPORTANT: After receiving tool results, explain the findings in natural language. Integrate data points naturally into your sentences (e.g., 'Your AHI was 2.5 events/hour' instead of listing figures separately). Avoid robotic listing of artifacts or tool outputs.

CRITICAL RULES:
1. NEVER invent statistics or numbers. If you need a numerical value, you MUST use a tool.
2. Integrate specific data points fluidly into your explanation to back up your insights.
3. When explaining results, reference the specific tool outputs that provided the data but do NOT cite them with IDs in the text.
4. If data is limited, analyze the available data points and describe any visible patterns or lack thereof. Do not simply apologize; explain what the data *does* show (e.g., "While the dataset is small, the available nights show...").
5. If the user asks a question that implies analysis of CPAP metrics (e.g. best nights, trends, comparisons, correlations), you MUST call at least one analytics tool before answering.
6. If ROUTER GUIDANCE lists requiredTools, you MUST call them before answering.
7. NEVER include raw tool output, JSON data, or tool call details in your response. Only explain the findings in natural language.

${dateRangeText}
${metricsText}
${contextText}
${routingText}

Available metrics:
${Object.entries(METRIC_DEFINITIONS).map(([key, def]) => 
  `- ${key}: ${def.name} (${def.unit}) - ${def.description}`
).join('\n')}

When users ask questions:
1. First determine which tools you need
2. Call the tools to get computed results
3. Explain the findings using ONLY the returned data
4. Focus on the "why" and "how" - connect the data points to form a cohesive narrative. If no strong correlation is found, state that interesting finding (e.g., "Interestingly, alcohol consumption did not show a clear negative impact...").

Example response format:
"Based on the analysis, your AHI improved significantly, dropping from 4.2 to 3.6 events/hour. This positive trend suggests that..."

DO NOT include:
- Tool: analyzeBestSleep
- Arguments: {}
- Return Value: {...}
- [Artifact: ...] citations in the text
- Any raw JSON or tool call details

Remember: You are an explainer of computed results, not a source of medical advice. Always include a disclaimer that this is informational only.`;
  }

  private async routeRequest(request: ChatRequest): Promise<{
    intent: 'cpap_only' | 'journal_only' | 'cpap_plus_journal' | 'unknown';
    requiredTools: string[];
    notes: string;
  }> {
    const lastUser = [...request.messages].reverse().find(m => m.role === 'user')?.content || '';
    const hasJournalSignals = /journal|diary|wrote|note|caffeine|alcohol|exercise|stress|meal|nap|medication/i.test(lastUser);
    const hasBestSleepSignals = /best|slept best|highest|top|great night|good night/i.test(lastUser);
    const hasCorrelationSignals = /correlat|factor|influenc|driver|cause|why/i.test(lastUser);
    const hasTrendSignals = /trend|over time|improv|worsen|better lately|worse lately/i.test(lastUser);

    let intent: 'cpap_only' | 'journal_only' | 'cpap_plus_journal' | 'unknown' = 'unknown';
    if (hasJournalSignals && (hasBestSleepSignals || hasCorrelationSignals)) intent = 'cpap_plus_journal';
    else if (hasJournalSignals) intent = 'journal_only';
    else if (hasBestSleepSignals || hasCorrelationSignals || hasTrendSignals) intent = 'cpap_only';

    const requiredTools: string[] = [];
    if (intent === 'cpap_only' || intent === 'cpap_plus_journal') {
      if (hasBestSleepSignals) requiredTools.push('analyzeBestSleep');
      if (hasTrendSignals) requiredTools.push('getTrends');
      if (hasCorrelationSignals && !hasBestSleepSignals) requiredTools.push('correlate');
    }
    if (intent === 'cpap_plus_journal' || intent === 'journal_only') {
      requiredTools.push('searchJournal');
    }

    // Ensure uniqueness
    const unique = Array.from(new Set(requiredTools));

    return {
      intent,
      requiredTools: unique,
      notes:
        intent === 'cpap_plus_journal'
          ? 'Combine CPAP metrics with journal context. Prefer calling analyzeBestSleep first. After identifying best nights, call searchJournal using queries like "<date>" or inferred lifestyle factors and constrain dateRange around those nights.'
          : intent === 'cpap_only'
            ? 'Focus on nightly_aggregates and analytics tools. Prefer analyzeBestSleep for best-sleep questions. Use tool outputs and cite artifacts.'
            : intent === 'journal_only'
              ? 'Use journal retrieval tools. Avoid numeric claims unless supported by tool outputs.'
              : 'If uncertain, start with getNightlySummary for the current date range.'
    };
  }

  private async makeAPIRequest(payload: any): Promise<any> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'CPAP Insight Dashboard'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.statusText}`);
    }

    return await response.json();
  }

  private async executeToolCall(toolCall: ToolCall, trace?: any): Promise<ToolResult> {
    const { name, arguments: args } = toolCall.function;
    const params = JSON.parse(args);
    const langfuse = trace || getLangfuseClient();
    
    // Create span for individual tool execution
    const toolSpan = langfuse.span({
      name: `tool-${name}`,
      input: {
        toolName: name,
        parameters: params
      }
    });
    
    try {
      // Import tools dynamically to avoid circular dependencies
      const tools = await import('@/lib/analytics/tools');
      const journalTools = await import('@/lib/analytics/journal-tool');

      let result: ToolResult;
      switch (name) {
        case 'getNightlySummary':
          result = tools.getNightlySummary(params.dateRange);
          break;
        case 'getTrends':
          result = tools.getTrends(params.metric, params.dateRange, params.window);
          break;
        case 'detectAnomalies':
          result = tools.detectAnomalies(params.metric, params.dateRange, params.threshold);
          break;
        case 'correlate':
          result = tools.correlate(params.metricA, params.metricB, params.dateRange);
          break;
        case 'compareRanges':
          result = tools.compareRanges(params.rangeA, params.rangeB, params.metrics);
          break;
        case 'getSessionBreakdown':
          result = tools.getSessionBreakdown(params.date);
          break;
        case 'analyzeBestSleep':
          result = tools.analyzeBestSleep(params.dateRange, params.topN);
          break;
        case 'executeCustomQuery':
          result = await tools.executeCustomQuery(params.naturalLanguageQuery, params.dateRange);
          break;
        case 'searchJournal':
          result = await journalTools.searchJournal(params.query, params.dateRange, params.limit);
          break;
        case 'getJournalDateRange':
          result = await journalTools.getJournalDateRange();
          break;
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
      
      toolSpan.end({
        output: {
          artifactId: result.provenance.artifactId,
          dataPoints: Array.isArray(result.data) ? result.data.length : 1,
          executionTime: result.provenance.computedAt
        }
      });
      
      return result;
    } catch (error) {
      toolSpan.end({
        output: {
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      });
      throw error;
    } finally {
      // Ensure tool span traces are flushed
      if (trace && typeof trace.flushAsync === 'function') {
        await trace.flushAsync();
      }
    }
  }

  private calculateCost(usage: any, model: string): number {
    if (!usage) return 0;
    
    const pricing = this.MODEL_PRICING[model as keyof typeof this.MODEL_PRICING];
    if (!pricing) return 0;
    
    const inputCost = (usage.prompt_tokens || 0) * pricing.input / 1_000_000;
    const outputCost = (usage.completion_tokens || 0) * pricing.output / 1_000_000;
    
    return Number((inputCost + outputCost).toFixed(6));
  }

  private extractCitations(message: string, toolResults: { [key: string]: ToolResult }): Citation[] {
    const citations: Citation[] = [];
    const citationRegex = /\[Artifact:\s*([a-f0-9-]+)\]/g;
    let match;

    while ((match = citationRegex.exec(message)) !== null) {
      const artifactId = match[1];
      const toolResult = Object.values(toolResults).find(r => r.provenance.artifactId === artifactId);
      
      if (toolResult) {
        citations.push({
          artifact_id: artifactId,
          tool_name: toolResult.provenance.toolName,
          snippet: JSON.stringify(toolResult.data).substring(0, 100) + '...'
        });
      }
    }

    return citations;
  }
}

// Validation function to check for fabricated data
export function validateResponse(response: ChatResponse, toolResults: ToolResult[]): boolean {
  // Extract all numbers from the response
  const numberRegex = /\b\d+\.?\d*\b/g;
  const numbersInResponse = response.message.match(numberRegex) || [];
  
  // Get all numbers from tool results
  const allowedNumbers = new Set<string>();
  for (const result of toolResults) {
    const resultString = JSON.stringify(result.data);
    const numbers = resultString.match(numberRegex) || [];
    numbers.forEach(n => allowedNumbers.add(n));
  }
  
  // Check if any numbers in response are not from tool results
  // Allow small numbers (0-10) as they're often counts or indices
  const suspiciousNumbers = numbersInResponse.filter(n => {
    const num = parseFloat(n);
    return num > 10 && !allowedNumbers.has(n);
  });
  
  return suspiciousNumbers.length === 0;
}
