import { MetricName } from '@/lib/db/schema';
import { OpenRouterClient, ChatMessage, ChatRequest, ChatResponse } from '@/lib/llm/openrouter';

export interface CPAPAgentRequest {
  messages: ChatMessage[];
  dateRange: { start: string; end: string };
  selectedMetrics?: MetricName[];
  userContext?: string;
  model?: string;
}

export class CPAPAgent {
  private llm: OpenRouterClient;

  constructor(llm?: OpenRouterClient) {
    this.llm = llm || new OpenRouterClient();
  }

  async processRequest(req: CPAPAgentRequest): Promise<ChatResponse & { traceId?: string }> {
    const chatReq: ChatRequest = {
      messages: req.messages,
      dateRange: req.dateRange,
      selectedMetrics: req.selectedMetrics,
      userContext: req.userContext,
      model: req.model
    };

    return this.llm.chat(chatReq);
  }
}