import { NextRequest, NextResponse } from 'next/server';
import { seedDemoData } from '@/lib/demo/seed';
import { setDemoEnabled } from '@/lib/demo/settings';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const daysBack = body.daysBack || 30;
    
    // Seed the demo data
    const result = await seedDemoData(daysBack);
    
    // Enable demo mode automatically after seeding
    setDemoEnabled(true);
    
    return NextResponse.json({
      success: true,
      ...result,
      message: `Seeded ${result.nightsSeeded} nights of demo data`
    });
  } catch (error) {
    console.error('Demo seed error:', error);
    return NextResponse.json(
      { error: 'Failed to seed demo data', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
