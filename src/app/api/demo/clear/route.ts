import { NextResponse } from 'next/server';
import { clearDemoData } from '@/lib/demo/seed';
import { setDemoEnabled } from '@/lib/demo/settings';

export async function POST() {
  try {
    // Clear all demo data
    const result = await clearDemoData();
    
    // Disable demo mode
    setDemoEnabled(false);
    
    return NextResponse.json({
      success: true,
      ...result,
      message: 'Demo data cleared successfully'
    });
  } catch (error) {
    console.error('Demo clear error:', error);
    return NextResponse.json(
      { error: 'Failed to clear demo data', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
