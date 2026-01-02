import { NextRequest, NextResponse } from 'next/server';
import { getMesoView } from '@/lib/data/duckdb-service';
import { getDatabase } from '@/lib/db';
import { isDemoSession } from '@/lib/demo/settings';
import { generateSyntheticMeso } from '@/lib/demo/synthetic-data';

/**
 * Tier 2 (Meso) API: On-the-fly downsampled view
 * Returns 1-minute buckets aggregated from Parquet (no storage)
 * For demo sessions, returns synthetic data without touching DuckDB
 * 
 * GET /api/session/[id]/meso?bucket=60
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;
    const { searchParams } = new URL(request.url);
    const bucketSeconds = parseInt(searchParams.get('bucket') || '60', 10);

    // Validate bucket size (min 1 second, max 5 minutes)
    if (bucketSeconds < 1 || bucketSeconds > 300) {
      return NextResponse.json(
        { error: 'Bucket size must be between 1 and 300 seconds' },
        { status: 400 }
      );
    }

    // Get session info from SQLite to verify it exists
    const db = getDatabase();
    const session = db.prepare(`
      SELECT date, session_id, parquet_path, total_usage_minutes
      FROM nightly_aggregates
      WHERE session_id = ?
    `).get(sessionId) as { date: string; session_id: string; parquet_path: string; total_usage_minutes: number } | undefined;

    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    // For demo sessions, generate synthetic data instead of querying Parquet
    if (isDemoSession(sessionId)) {
      const mesoData = generateSyntheticMeso(sessionId, bucketSeconds, session.total_usage_minutes);
      
      return NextResponse.json({
        sessionId,
        date: session.date,
        bucketSeconds,
        totalBuckets: mesoData.length,
        durationMinutes: session.total_usage_minutes,
        data: mesoData,
        isDemo: true
      });
    }

    // Query Parquet file on-the-fly via DuckDB
    const mesoData = await getMesoView(sessionId, bucketSeconds);

    return NextResponse.json({
      sessionId,
      date: session.date,
      bucketSeconds,
      totalBuckets: mesoData.length,
      durationMinutes: session.total_usage_minutes,
      data: mesoData
    });

  } catch (error) {
    console.error('Meso API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch meso view' },
      { status: 500 }
    );
  }
}
