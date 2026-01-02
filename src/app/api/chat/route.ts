import { NextRequest, NextResponse } from 'next/server';
import { OpenRouterClient, ChatRequest, validateResponse } from '@/lib/llm/openrouter';
import { getDatabase } from '@/lib/db';

// Clean up tool output that might appear in LLM responses
function cleanToolOutput(message: string): string {
  // Remove tool call blocks
  const toolCallPatterns = [
    /Tool:\s*\w+[\s\S]*?Arguments:[\s\S]*?\{[^}]*\}[\s\S]*?Return Value:[\s\S]*?\{[^}]*\}/gi,
    /Tool:\s*\w+\s*\nArguments:\s*\{[^}]*\}\s*\nReturn Value:\s*\{[^}]*\}/gi,
    /I'll help.*?Tool:\s*\w+[\s\S]*?Return Value:[\s\S]*?\{[^}]*\}[\s\S]*?Based on the analysis/gi
  ];
  
  let cleaned = message;
  for (const pattern of toolCallPatterns) {
    cleaned = cleaned.replace(pattern, '');
  }
  
  // Clean up extra newlines and whitespace
  cleaned = cleaned.replace(/\n\s*\n\s*\n/g, '\n\n');
  cleaned = cleaned.replace(/^\s+|\s+$/g, '');
  
  return cleaned;
}

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body: ChatRequest = await request.json();

    // Validate required fields
    if (!body.messages || !Array.isArray(body.messages)) {
      return NextResponse.json(
        { error: 'Messages array is required' },
        { status: 400 }
      );
    }
    
    if (!body.dateRange || !body.dateRange.start || !body.dateRange.end) {
      return NextResponse.json(
        { error: 'Date range is required' },
        { status: 400 }
      );
    }

    // Initialize OpenRouter client
    const openRouter = new OpenRouterClient();
    
    // Execute chat request
    const response = await openRouter.chat(body);
    
    // Clean up any tool output that might appear in the response
    response.message = cleanToolOutput(response.message);
    
    // Log the interaction for debugging
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
    
    return NextResponse.json(response);
    
  } catch (error) {
    console.error('Chat API error:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('OpenRouter API key')) {
        return NextResponse.json(
          { error: 'Invalid or missing OpenRouter API key' },
          { status: 401 }
        );
      }
    }
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Get chat history (optional for UI)
export async function GET(request: NextRequest) {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT * FROM chat_logs
      ORDER BY created_at DESC
      LIMIT 50
    `);
    
    const logs = stmt.all();
    
    return NextResponse.json({ logs });
    
  } catch (error) {
    console.error('Chat logs error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch chat logs' },
      { status: 500 }
    );
  }
}
