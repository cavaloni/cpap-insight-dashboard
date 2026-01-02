import { NextRequest, NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import { join } from 'path';

export async function GET() {
  try {
    const dbPath = join(process.cwd(), 'data', 'cpap.db');
    const db = new Database(dbPath, { readonly: true });
    
    // Get min and max dates from nightly_aggregates
    const bounds = db.prepare(`
      SELECT 
        MIN(date) as minDate,
        MAX(date) as maxDate,
        COUNT(*) as totalNights
      FROM nightly_aggregates
      WHERE date IS NOT NULL
    `).get() as { minDate: string; maxDate: string; totalNights: number };
    
    db.close();
    
    if (!bounds.minDate || !bounds.maxDate) {
      return NextResponse.json(
        { error: 'No data found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      minDate: bounds.minDate,
      maxDate: bounds.maxDate,
      totalNights: bounds.totalNights
    });
  } catch (error) {
    console.error('Error fetching data bounds:', error);
    return NextResponse.json(
      { error: 'Failed to fetch data bounds' },
      { status: 500 }
    );
  }
}
