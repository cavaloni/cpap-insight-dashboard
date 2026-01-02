import { METRIC_DEFINITIONS, MetricName } from '@/lib/db/schema';
import { ToolResult } from '@/lib/analytics/tools';
import { getLangfuseClient } from '@/lib/observability/langfuse';
import { 
  StreamEvent, 
  getThinkingMessage, 
  getToolInfo,
  encodeSSEEvent 
} from '@/lib/streaming';
import { ChatMessage, ToolMessage, ToolCall, ChatRequest, ChatResponse, Citation, TOOL_DEFINITIONS } from './openrouter';

export type StreamCallback = (event: StreamEvent) => void;

export class OpenRouterStreamingClient {
  private apiKey: string;
  private baseUrl = 'https://openrouter.ai/api/v1';
  private defaultModel = 'anthropic/claude-3.5-sonnet';
  private routingModel = 'anthropic/claude-3-haiku';
  
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

  private emit(callback: StreamCallback, type: StreamEvent['type'], data: StreamEvent['data']) {
    callback({
      type,
      data,
      timestamp: Date.now()
    });
  }

  async chatStream(request: ChatRequest, onEvent: StreamCallback): Promise<ChatResponse & { traceId?: string }> {
    const model = request.model || this.defaultModel;
    const langfuse = getLangfuseClient();
    const startTime = Date.now();
    
    const trace = langfuse.trace({
      name: 'cpap-analysis-streaming',
      input: {
        messages: request.messages,
        dateRange: request.dateRange,
        selectedMetrics: request.selectedMetrics,
        model
      },
      metadata: {
        userContext: request.userContext,
        toolCount: TOOL_DEFINITIONS.length,
        streaming: true
      }
    });

    // Route the request to determine intent
    const routingSpan = trace.span({
      name: 'router',
      input: { model, messageCount: request.messages.length }
    });

    const routing = await this.routeRequest(request).catch((error) => {
      routingSpan.end({ output: { error: error instanceof Error ? error.message : 'Unknown error' } });
      return null;
    });

    if (routing) {
      routingSpan.end({ output: routing });
    }

    // Send initial thinking message
    const thinkingMessage = getThinkingMessage(routing?.intent || 'unknown');
    this.emit(onEvent, 'thinking', { message: thinkingMessage });

    // Build system message
    const systemMessage: ChatMessage = {
      role: 'system',
      content: this.buildSystemPrompt(request, routing)
    };

    const messages: (ChatMessage | ToolMessage)[] = [systemMessage, ...request.messages];
    const executedToolCalls: ToolCall[] = [];
    const evidenceArtifacts: string[] = [];
    const toolResults: { [key: string]: ToolResult } = {};

    const maxIterations = 5;
    let totalUsage: any = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    let timeToFirstOutput: number | null = null;
    let finalMessage = '';

    try {
      for (let iteration = 0; iteration < maxIterations; iteration++) {
        const llmSpan = trace.span({
          name: iteration === 0 ? 'initial-llm-call' : 'react-llm-call',
          input: { model, iteration, messageCount: messages.length }
        });

        // Make streaming API request
        const response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'http://localhost:3000',
            'X-Title': 'CPAP Insight Dashboard'
          },
          body: JSON.stringify({
            model,
            messages,
            tools: TOOL_DEFINITIONS.map(t => ({ type: 'function', function: t })),
            tool_choice: 'auto',
            stream: true
          })
        });

        if (!response.ok) {
          throw new Error(`OpenRouter API error: ${response.statusText}`);
        }

        if (!timeToFirstOutput) {
          timeToFirstOutput = Date.now() - startTime;
        }

        // Process streaming response
        const { content, toolCalls, usage } = await this.processStreamingResponse(
          response,
          onEvent,
          iteration === maxIterations - 1 || executedToolCalls.length > 0
        );

        if (usage) {
          totalUsage.prompt_tokens += usage.prompt_tokens || 0;
          totalUsage.completion_tokens += usage.completion_tokens || 0;
          totalUsage.total_tokens += usage.total_tokens || 0;
        }

        llmSpan.end({
          output: {
            toolCallsRequested: toolCalls.length,
            responseLength: content.length,
            usage
          }
        });

        // Add assistant message to history
        messages.push({
          role: 'assistant',
          content,
          tool_calls: toolCalls.length ? toolCalls : undefined
        });

        // If no tool calls, we're done
        if (!toolCalls.length) {
          finalMessage = content;
          const citations = this.extractCitations(content, toolResults);
          
          this.emit(onEvent, 'complete', {
            fullMessage: content,
            toolsExecuted: executedToolCalls.length,
            citations: citations.length
          });

          trace.update({
            output: {
              message: content,
              toolCallsExecuted: executedToolCalls.length,
              citations: citations.length,
              model,
              totalTokens: totalUsage.total_tokens || 0,
              totalCost: this.calculateCost(totalUsage, model)
            },
            metadata: {
              evidenceArtifacts,
              timeToFirstOutputMs: timeToFirstOutput,
              streaming: true
            }
          });

          await langfuse.flushAsync();

          return {
            message: content,
            tool_calls_executed: executedToolCalls,
            evidence_artifacts: evidenceArtifacts,
            model_used: model,
            citations,
            traceId: trace.id
          };
        }

        // Execute tool calls
        const toolExecutionSpan = trace.span({
          name: 'tool-execution',
          input: {
            iteration,
            toolCallsCount: toolCalls.length,
            toolNames: toolCalls.map(tc => tc.function.name)
          }
        });

        for (const toolCall of toolCalls) {
          const toolInfo = getToolInfo(toolCall.function.name);
          
          // Emit tool start
          this.emit(onEvent, 'tool_start', {
            toolName: toolCall.function.name,
            toolDisplayName: toolInfo.displayName,
            message: toolInfo.statusMessage
          });

          // Execute the tool
          const result = await this.executeToolCall(toolCall, trace);
          executedToolCalls.push(toolCall);
          evidenceArtifacts.push(result.provenance.artifactId);
          toolResults[toolCall.id] = result;

          // Emit tool end
          this.emit(onEvent, 'tool_end', {
            toolName: toolCall.function.name,
            toolDisplayName: toolInfo.displayName
          });

          // Add tool result to messages
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

        // Send status update before next LLM call
        this.emit(onEvent, 'status', {
          message: 'Processing results and preparing response...'
        });
      }

      // Max iterations reached
      const fallbackMessage = 'I was unable to complete the analysis within the tool-calling limit. Please try rephrasing or narrowing the question.';
      
      this.emit(onEvent, 'complete', {
        fullMessage: fallbackMessage,
        toolsExecuted: executedToolCalls.length,
        citations: 0
      });

      trace.update({
        output: {
          message: fallbackMessage,
          toolCallsExecuted: executedToolCalls.length,
          model,
          totalTokens: totalUsage.total_tokens || 0
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
      this.emit(onEvent, 'error', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      trace.update({
        output: {
          error: error instanceof Error ? error.message : 'Unknown error',
          phase: 'streaming-react-loop'
        }
      });
      
      await langfuse.flushAsync();
      throw error;
    }
  }

  private async processStreamingResponse(
    response: Response,
    onEvent: StreamCallback,
    shouldStreamText: boolean
  ): Promise<{ content: string; toolCalls: ToolCall[]; usage: any }> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let content = '';
    let toolCalls: ToolCall[] = [];
    let usage: any = null;
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta;
            
            if (delta?.content) {
              content += delta.content;
              // Only stream text if we're in the final response phase
              if (shouldStreamText) {
                this.emit(onEvent, 'text', { chunk: delta.content });
              }
            }

            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                const index = tc.index;
                if (!toolCalls[index]) {
                  toolCalls[index] = {
                    id: tc.id || '',
                    type: 'function',
                    function: { name: '', arguments: '' }
                  };
                }
                if (tc.id) toolCalls[index].id = tc.id;
                if (tc.function?.name) toolCalls[index].function.name += tc.function.name;
                if (tc.function?.arguments) toolCalls[index].function.arguments += tc.function.arguments;
              }
            }

            if (parsed.usage) {
              usage = parsed.usage;
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return { content, toolCalls: toolCalls.filter(Boolean), usage };
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
    const lastUserTrimmed = lastUser.trim();
    if (!lastUserTrimmed) {
      return {
        intent: 'unknown',
        requiredTools: [],
        notes: 'No user message found to route.'
      };
    }

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:3000',
          'X-Title': 'CPAP Insight Dashboard'
        },
        body: JSON.stringify({
          model: this.routingModel,
          messages: [
            {
              role: 'system',
              content:
                'You are a strict intent router for a CPAP + journal assistant. Return ONLY valid JSON. No markdown. No explanation.'
            },
            {
              role: 'user',
              content: `Classify the user's request and pick required tools.\n\nUser message: ${JSON.stringify(lastUserTrimmed)}\n\nOutput JSON with this exact schema:\n{\n  "intent": "cpap_only" | "journal_only" | "cpap_plus_journal" | "unknown",\n  "requiredTools": string[],\n  "notes": string\n}\n\nAvailable tools (choose from these only):\n- getNightlySummary\n- getTrends\n- detectAnomalies\n- correlate\n- compareRanges\n- getSessionBreakdown\n- analyzeBestSleep\n- executeCustomQuery\n- searchJournal\n- getJournalDateRange\n\nGuidance:\n- If the user asks about habits, routines, behaviors, lifestyle factors, or why sleep was good/bad, prefer cpap_plus_journal and include searchJournal.\n- If the user asks about best nights or what produced best nights, include analyzeBestSleep.\n- If the user asks about trends over time, include getTrends (but only if they mention a metric or time trend).\n- If uncertain, set intent to unknown and require getNightlySummary.\n`
            }
          ],
          temperature: 0,
          max_tokens: 250
        })
      });

      if (!response.ok) {
        throw new Error(`OpenRouter routing error: ${response.statusText}`);
      }

      const data = await response.json();
      const content: string = data.choices?.[0]?.message?.content || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Router did not return JSON');
      }

      const parsed = JSON.parse(jsonMatch[0]) as {
        intent?: 'cpap_only' | 'journal_only' | 'cpap_plus_journal' | 'unknown';
        requiredTools?: string[];
        notes?: string;
      };

      const allowedIntents = new Set(['cpap_only', 'journal_only', 'cpap_plus_journal', 'unknown']);
      if (!parsed.intent || !allowedIntents.has(parsed.intent)) {
        throw new Error('Router returned invalid intent');
      }

      const allowedTools = new Set([
        'getNightlySummary',
        'getTrends',
        'detectAnomalies',
        'correlate',
        'compareRanges',
        'getSessionBreakdown',
        'analyzeBestSleep',
        'executeCustomQuery',
        'searchJournal',
        'getJournalDateRange'
      ]);

      const tools = Array.isArray(parsed.requiredTools) ? parsed.requiredTools : [];
      const filteredTools = tools.filter((t) => allowedTools.has(t));

      const unique = Array.from(new Set(filteredTools));

      return {
        intent: parsed.intent,
        requiredTools: unique,
        notes: typeof parsed.notes === 'string' ? parsed.notes : ''
      };
    } catch {
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

      const unique = Array.from(new Set(requiredTools));

      return {
        intent,
        requiredTools: unique,
        notes:
          intent === 'cpap_plus_journal'
            ? 'Combine CPAP metrics with journal context. Prefer calling analyzeBestSleep first.'
            : intent === 'cpap_only'
              ? 'Focus on nightly_aggregates and analytics tools.'
              : intent === 'journal_only'
                ? 'Use journal retrieval tools.'
                : 'If uncertain, start with getNightlySummary for the current date range.'
      };
    }
  }

  private async executeToolCall(toolCall: ToolCall, trace?: any): Promise<ToolResult> {
    const { name, arguments: args } = toolCall.function;
    const params = JSON.parse(args);
    const langfuse = trace || getLangfuseClient();
    
    const toolSpan = langfuse.span({
      name: `tool-${name}`,
      input: { toolName: name, parameters: params }
    });
    
    try {
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
          dataPoints: Array.isArray(result.data) ? result.data.length : 1
        }
      });
      
      return result;
    } catch (error) {
      toolSpan.end({
        output: { error: error instanceof Error ? error.message : 'Unknown error' }
      });
      throw error;
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
