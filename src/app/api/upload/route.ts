import { NextRequest, NextResponse } from 'next/server';
import { ingestCPAPCSV } from '@/lib/data/ingest';
import { getDatabase } from '@/lib/db';
import fs from 'fs';
import path from 'path';

export async function POST(request: NextRequest) {
  try {
    // Get the uploaded file
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!file.name.endsWith('.csv')) {
      return NextResponse.json(
        { error: 'File must be a CSV' },
        { status: 400 }
      );
    }

    // Save file temporarily
    const tempDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const tempFilePath = path.join(tempDir, file.name);
    const buffer = await file.arrayBuffer();
    fs.writeFileSync(tempFilePath, Buffer.from(buffer));

    // Ingest the data
    const result = await ingestCPAPCSV(tempFilePath);
    
    // Clean up temp file
    fs.unlinkSync(tempFilePath);
    
    // Update database metadata
    const db = getDatabase();
    const metadataStmt = db.prepare(`
      INSERT OR REPLACE INTO data_metadata (key, value, updated_at)
      VALUES ('last_upload', ?, ?)
    `);
    
    metadataStmt.run(
      JSON.stringify({
        fileName: file.name,
        fileSize: file.size,
        uploadedAt: new Date().toISOString(),
        ...result
      }),
      new Date().toISOString()
    );

    return NextResponse.json(result);
    
  } catch (error) {
    console.error('Upload error:', error);
    
    return NextResponse.json(
      { error: 'Failed to process file' },
      { status: 500 }
    );
  }
}

// Get upload history
export async function GET(request: NextRequest) {
  try {
    const db = getDatabase();
    
    // Check if metadata table exists
    db.exec(`
      CREATE TABLE IF NOT EXISTS data_metadata (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    const stmt = db.prepare(`
      SELECT value FROM data_metadata WHERE key = 'last_upload'
    `);
    
    const result = stmt.get() as { value: string } | undefined;
    
    if (result) {
      return NextResponse.json({ uploadHistory: JSON.parse(result.value) });
    }
    
    return NextResponse.json({ uploadHistory: null });
    
  } catch (error) {
    console.error('Upload history error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch upload history' },
      { status: 500 }
    );
  }
}
