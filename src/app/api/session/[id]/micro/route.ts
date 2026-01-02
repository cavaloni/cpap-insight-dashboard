import { NextRequest, NextResponse } from 'next/server';
import { getMicroView, lttbDownsample } from '@/lib/data/duckdb-service';
import { getDatabase } from '@/lib/db';
import { isDemoSession } from '@/lib/demo/settings';
import { generateSyntheticMicro } from '@/lib/demo/synthetic-data';

/**
 * Tier 3 (Micro) API: Raw high-resolution data for a time range
 * Uses predicate pushdown to only read needed chunks from Parquet
 * For demo sessions, returns synthetic data without touching DuckDB
 * 
 * GET /api/session/[id]/micro?start=1234567890000&end=1234567899000&points=2000
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;
    const { searchParams } = new URL(request.url);
    
    const startTime = parseInt(searchParams.get('start') || '0', 10);
    const endTime = parseInt(searchParams.get('end') || '0', 10);
    const targetPoints = parseInt(searchParams.get('points') || '2000', 10);

    if (!startTime || !endTime) {
      return NextResponse.json(
        { error: 'Start and end timestamps are required' },
        { status: 400 }
      );
    }

    if (endTime <= startTime) {
      return NextResponse.json(
        { error: 'End time must be after start time' },
        { status: 400 }
      );
    }

    // Limit target points to prevent browser crashes
    const maxPoints = Math.min(targetPoints, 10000);

    // Verify session exists
    const db = getDatabase();
    const session = db.prepare(`
      SELECT date, session_id, parquet_path
      FROM nightly_aggregates
      WHERE session_id = ?
    `).get(sessionId) as { date: string; session_id: string; parquet_path: string } | undefined;

    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    // For demo sessions, generate synthetic data instead of querying Parquet
    if (isDemoSession(sessionId)) {
      // Generate at a lower rate if range is large, then downsample
      const durationMs = endTime - startTime;
      const estimatedPoints = (durationMs / 1000) * 25; // 25Hz
      const sampleRate = estimatedPoints > maxPoints * 2 ? 5 : 25; // Use 5Hz for large ranges
      
      const rawData = generateSyntheticMicro(sessionId, startTime, endTime, sampleRate);
      
      // Apply LTTB downsampling if needed
      let responseData = rawData;
      if (rawData.length > maxPoints) {
        const flowData = rawData.map(r => ({ timestamp: r.timestamp, value: r.flow_rate }));
        const downsampledFlow = lttbDownsample(flowData, maxPoints);
        const downsampledTimestamps = new Set(downsampledFlow.map(d => d.timestamp));
        responseData = rawData.filter(r => downsampledTimestamps.has(r.timestamp));
      }
      
      return NextResponse.json({
        sessionId,
        date: session.date,
        timeRange: {
          start: startTime,
          end: endTime,
          durationMs
        },
        sampling: {
          originalPoints: rawData.length,
          returnedPoints: responseData.length,
          downsampled: rawData.length > maxPoints
        },
        data: responseData,
        isDemo: true
      });
    }

    // Query raw data from Parquet with predicate pushdown
    const rawData = await getMicroView(sessionId, startTime, endTime);

    // Apply LTTB downsampling if needed to preserve visual shape
    let responseData = rawData;
    if (rawData.length > maxPoints) {
      // Convert to format expected by LTTB
      const flowData = rawData.map(r => ({ timestamp: r.timestamp, value: r.flow_rate }));
      const downsampledFlow = lttbDownsample(flowData, maxPoints);
      
      // Map back to full records using downsampled timestamps
      const downsampledTimestamps = new Set(downsampledFlow.map(d => d.timestamp));
      responseData = rawData.filter(r => downsampledTimestamps.has(r.timestamp));
    }

    return NextResponse.json({
      sessionId,
      date: session.date,
      timeRange: {
        start: startTime,
        end: endTime,
        durationMs: endTime - startTime
      },
      sampling: {
        originalPoints: rawData.length,
        returnedPoints: responseData.length,
        downsampled: rawData.length > maxPoints
      },
      data: responseData
    });

  } catch (error) {
    console.error('Micro API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch micro view' },
      { status: 500 }
    );
  }
}
