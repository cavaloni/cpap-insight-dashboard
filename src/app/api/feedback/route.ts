import { NextRequest, NextResponse } from 'next/server';
import { getLangfuseClient } from '@/lib/observability/langfuse';

export async function POST(request: NextRequest) {
  try {
    const { traceId, feedback, comment } = await request.json();

    if (!traceId || typeof feedback !== 'boolean') {
      return NextResponse.json(
        { error: 'traceId and feedback (boolean) are required' },
        { status: 400 }
      );
    }

    const langfuse = getLangfuseClient();
    
    // Use Langfuse's score method for feedback
    await langfuse.score({
      traceId,
      name: 'user_feedback',
      value: feedback ? 1 : 0,
      dataType: 'BOOLEAN',
      comment: comment || undefined
    });

    // Ensure the score is sent
    await langfuse.flushAsync();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to submit feedback:', error);
    return NextResponse.json(
      { error: 'Failed to submit feedback' },
      { status: 500 }
    );
  }
}
