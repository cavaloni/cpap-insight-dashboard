import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const start = searchParams.get('start');
    const end = searchParams.get('end');
    
    if (!start || !end) {
      return NextResponse.json(
        { error: 'Start and end dates are required' },
        { status: 400 }
      );
    }

    const db = getDatabase();
    
    // Get KPI metrics
    const kpiStmt = db.prepare(`
      SELECT 
        AVG(ahi) as avg_ahi,
        AVG(total_usage_minutes) as avg_usage,
        AVG(mask_on_minutes) as avg_mask_on,
        AVG(median_pressure) as avg_pressure,
        AVG(median_leak_rate) as avg_leak,
        AVG(large_leak_percent) as avg_large_leak_percent,
        AVG(sleep_quality_score) as avg_quality_score,
        COUNT(*) as total_nights
      FROM nightly_aggregates
      WHERE date >= ? AND date <= ?
    `);
    
    const kpis = kpiStmt.get(start, end) as {
      avg_ahi: number,
      avg_usage: number,
      avg_mask_on: number,
      avg_pressure: number,
      avg_leak: number,
      avg_large_leak_percent: number,
      avg_quality_score: number,
      total_nights: number
    };
    
    // Get trend data for charts
    const trendStmt = db.prepare(`
      SELECT 
        date,
        session_id,
        ahi,
        total_usage_minutes,
        median_pressure,
        median_leak_rate,
        sleep_quality_score
      FROM nightly_aggregates
      WHERE date >= ? AND date <= ?
      ORDER BY date ASC
    `);
    
    const trends = trendStmt.all(start, end);
    
    // Get anomalies (top 5 worst nights by AHI)
    const anomalyStmt = db.prepare(`
      SELECT 
        date,
        session_id,
        ahi,
        large_leak_percent,
        sleep_quality_score
      FROM nightly_aggregates
      WHERE date >= ? AND date <= ? AND ahi IS NOT NULL
      ORDER BY ahi DESC
      LIMIT 5
    `);
    
    const anomalies = anomalyStmt.all(start, end);
    
    // Get weekly averages
    const weeklyStmt = db.prepare(`
      SELECT 
        strftime('%Y-%W', date) as week,
        AVG(ahi) as avg_ahi,
        AVG(total_usage_minutes) as avg_usage,
        AVG(sleep_quality_score) as avg_quality
      FROM nightly_aggregates
      WHERE date >= ? AND date <= ?
      GROUP BY week
      ORDER BY week ASC
    `);
    
    const weekly = weeklyStmt.all(start, end);
    
    return NextResponse.json({
      kpis: {
        avgAhi: kpis.avg_ahi?.toFixed(1) || '0',
        avgUsageHours: ((kpis.avg_usage || 0) / 60).toFixed(1),
        avgPressure: kpis.avg_pressure?.toFixed(1) || '0',
        avgLeak: kpis.avg_leak?.toFixed(1) || '0',
        avgQualityScore: Math.round(kpis.avg_quality_score || 0),
        totalNights: kpis.total_nights || 0
      },
      trends,
      anomalies,
      weekly
    });
    
  } catch (error) {
    console.error('Dashboard API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dashboard data' },
      { status: 500 }
    );
  }
}
