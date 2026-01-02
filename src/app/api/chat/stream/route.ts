import { NextRequest } from 'next/server';
import { OpenRouterStreamingClient } from '@/lib/llm/openrouter-streaming';
import { ChatRequest } from '@/lib/llm/openrouter';
import { StreamEvent, encodeSSEEvent } from '@/lib/streaming';
import { getDatabase } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body: ChatRequest = await request.json();

    if (!body.messages || !Array.isArray(body.messages)) {
      return new Response(JSON.stringify({ error: 'Messages array is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    if (!body.dateRange || !body.dateRange.start || !body.dateRange.end) {
      return new Response(JSON.stringify({ error: 'Date range is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const encoder = new TextEncoder();
    
    const stream = new ReadableStream({
      async start(controller) {
        const client = new OpenRouterStreamingClient();
        
        const sendEvent = (event: StreamEvent) => {
          const encoded = encoder.encode(encodeSSEEvent(event));
          controller.enqueue(encoded);
        };

        try {
          const response = await client.chatStream(body, sendEvent);
          
          // Log the interaction
          try {
            const db = getDatabase();
            const logStmt = db.prepare(`
              INSERT INTO chat_logs (request, response, model_used, created_at)
              VALUES (?, ?, ?, ?)
            `);
            
            logStmt.run(
              JSON.stringify(body),
              JSON.stringify(response),
              response.model_used,
              new Date().toISOString()
            );
          } catch (logError) {
            console.error('Failed to log chat:', logError);
          }
          
          controller.close();
        } catch (error) {
          console.error('Streaming error:', error);
          
          const errorEvent: StreamEvent = {
            type: 'error',
            data: { error: error instanceof Error ? error.message : 'Unknown error' },
            timestamp: Date.now()
          };
          
          controller.enqueue(encoder.encode(encodeSSEEvent(errorEvent)));
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
      }
    });

  } catch (error) {
    console.error('Chat stream API error:', error);
    
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
