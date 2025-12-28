import { METRIC_DEFINITIONS, MetricName } from '@/lib/db/schema';
import { ToolResult } from '@/lib/analytics/tools';
import { getLangfuseClient } from '@/lib/observability/langfuse';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
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
  }
];

export class OpenRouterClient {
  private apiKey: string;
  private baseUrl = 'https://openrouter.ai/api/v1';
  private defaultModel = 'anthropic/claude-3.5-sonnet';
  
  // OpenRouter pricing per 1M tokens (approximate, check current rates)
  private MODEL_PRICING = {
    'anthropic/claude-3.5-sonnet': { input: 3, output: 15 },
    'anthropic/claude-3-haiku': { input: 0.25, output: 1.25 },
    'openai/gpt-4o': { input: 2.5, output: 10 },
    'openai/gpt-4o-mini': { input: 0.15, output: 0.6 },
  };

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.OPENROUTER_API_KEY || '';
    if (!this.apiKey) {
      throw new Error('OpenRouter API key is required');
    }
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
    
    // Build system message with strict instructions
    const systemMessage: ChatMessage = {
      role: 'system',
      content: this.buildSystemPrompt(request)
    };

    // Prepare messages with context
    const messages: ChatMessage[] = [
      systemMessage,
      ...request.messages
    ];

    // Initial API call span
    const initialSpan = trace.span({
      name: 'initial-llm-call',
      input: {
        model,
        messageCount: messages.length,
        hasToolChoice: true
      }
    });
    
    try {
      const initialResponse = await this.makeAPIRequest({
        model,
        messages,
        tools: TOOL_DEFINITIONS,
        tool_choice: 'auto'
      });
      
      initialSpan.end({
        output: {
          toolCallsRequested: initialResponse.choices[0]?.message?.tool_calls?.length || 0,
          usage: initialResponse.usage
        }
      });
      
      // Track time to first output (after initial API response)
      const timeToFirstOutput = Date.now() - startTime;

    const toolCalls = initialResponse.choices[0]?.message?.tool_calls || [];
    const executedToolCalls: ToolCall[] = [];
    const evidenceArtifacts: string[] = [];
    const toolResults: { [key: string]: any } = {};

    // Execute tool calls if any
    if (toolCalls.length > 0) {
      const toolExecutionSpan = trace.span({
        name: 'tool-execution',
        input: {
          toolCallsCount: toolCalls.length,
          toolNames: toolCalls.map((tc: any) => tc.function.name)
        }
      });
      
      for (const toolCall of toolCalls) {
        const result = await this.executeToolCall(toolCall, trace);
        executedToolCalls.push(toolCall);
        evidenceArtifacts.push(result.provenance.artifactId);
        toolResults[toolCall.id] = result;

        // Add tool result to messages (OpenRouter format)
        messages.push({
          role: 'user',
          content: `Tool result for ${toolCall.function.name}: ${JSON.stringify(result.data)}`
        });
      }
      
      toolExecutionSpan.end({
        output: {
          toolsExecuted: executedToolCalls.length,
          evidenceArtifacts: evidenceArtifacts.length
        }
      });

      // Final API call span
      const finalSpan = trace.span({
        name: 'final-llm-call',
        input: {
          model,
          messageCount: messages.length,
          hasToolResults: true
        }
      });
      
      try {
        const finalResponse = await this.makeAPIRequest({
          model,
          messages,
          tools: TOOL_DEFINITIONS
        });
        
        const finalMessage = finalResponse.choices[0]?.message?.content || '';
        const citations = this.extractCitations(finalMessage, toolResults);
        
        finalSpan.end({
          output: {
            responseLength: finalMessage.length,
            citationsCount: citations.length,
            usage: finalResponse.usage
          }
        });

      const response = {
        message: finalMessage,
        tool_calls_executed: executedToolCalls,
        evidence_artifacts: evidenceArtifacts,
        model_used: model,
        citations
      };
      
      // Validate and update trace
      const validation = validateResponse(response, Object.values(toolResults));
      
      trace.update({
        output: {
          message: finalMessage,
          toolCallsExecuted: executedToolCalls.length,
          citations: citations.length,
          model,
          totalTokens: (initialResponse.usage?.total_tokens || 0) + (finalResponse.usage?.total_tokens || 0),
          totalCost: this.calculateCost(initialResponse.usage, model) + this.calculateCost(finalResponse.usage, model)
        },
        metadata: {
          validationPassed: validation,
          evidenceArtifacts: evidenceArtifacts,
          userId: (request.userContext as any)?.userId,
          timeToFirstOutputMs: timeToFirstOutput
        }
      });
      
      // Ensure traces are flushed
      await langfuse.flushAsync();
      
      return {
        ...response,
        traceId: trace.id
      };
    } catch (error) {
      trace.update({
        output: {
          error: error instanceof Error ? error.message : 'Unknown error',
          phase: 'tool-execution-or-final-call'
        }
      });
      await langfuse.flushAsync();
      throw error;
    }
    }

    // No tool calls needed
    const message = initialResponse.choices[0]?.message?.content || '';
    
    trace.update({
      output: {
        message,
        toolCallsExecuted: 0,
        citations: 0,
        model,
        totalTokens: initialResponse.usage?.total_tokens || 0,
        totalCost: this.calculateCost(initialResponse.usage, model)
      },
      metadata: {
        validationPassed: true,
        userId: (request.userContext as any)?.userId,
        timeToFirstOutputMs: Date.now() - startTime
      }
    });
    
    // Ensure traces are flushed
    await langfuse.flushAsync();
    
    return {
      message,
      tool_calls_executed: [],
      evidence_artifacts: [],
      model_used: model,
      citations: [],
      traceId: trace.id
    };
  } catch (error) {
    // Error handling for the entire chat method
    const langfuse = getLangfuseClient();
    const errorTrace = langfuse.trace({
      name: 'cpap-analysis-error',
      input: request,
      output: {
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    });
    await langfuse.flushAsync();
    throw error;
  }

  private buildSystemPrompt(request: ChatRequest): string {
    const dateRangeText = `Current date range: ${request.dateRange.start} to ${request.dateRange.end}`;
    const metricsText = request.selectedMetrics ? 
      `Focus metrics: ${request.selectedMetrics.join(', ')}` : '';
    const contextText = request.userContext ? `User context: ${request.userContext}` : '';

    return `You are a CPAP data analyst assistant. Your role is to help users understand their CPAP therapy data using ONLY the computed results from analytical tools.

CRITICAL RULES:
1. NEVER invent statistics or numbers. If you need a numerical value, you MUST use a tool.
2. ALWAYS cite your sources using artifact IDs in format [Artifact: ID].
3. When explaining results, reference the specific tool outputs that provided the data.
4. If data is missing or insufficient, clearly state that you cannot determine the answer.

${dateRangeText}
${metricsText}
${contextText}

Available metrics:
${Object.entries(METRIC_DEFINITIONS).map(([key, def]) => 
  `- ${key}: ${def.name} (${def.unit}) - ${def.description}`
).join('\n')}

When users ask questions:
1. First determine which tools you need
2. Call the tools to get computed results
3. Explain the findings using ONLY the returned data
4. Always include artifact IDs for evidence

Example response format:
"Based on the analysis [Artifact: abc123], your AHI improved by 15% from 4.2 to 3.6 events/hour [Artifact: def456]. This trend indicates..."

Remember: You are an explainer of computed results, not a source of medical advice. Always include a disclaimer that this is informational only.`;
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
        case 'executeCustomQuery':
          result = await tools.executeCustomQuery(params.naturalLanguageQuery, params.dateRange);
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
