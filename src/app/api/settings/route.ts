import { NextRequest, NextResponse } from 'next/server';
import { getDemoSettings, setDemoEnabled } from '@/lib/demo/settings';

export async function GET() {
  try {
    const settings = getDemoSettings();
    return NextResponse.json(settings);
  } catch (error) {
    console.error('Settings API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    if (typeof body.demoEnabled === 'boolean') {
      setDemoEnabled(body.demoEnabled);
    }
    
    const settings = getDemoSettings();
    return NextResponse.json(settings);
  } catch (error) {
    console.error('Settings API error:', error);
    return NextResponse.json(
      { error: 'Failed to update settings' },
      { status: 500 }
    );
  }
}
