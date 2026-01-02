import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { parseJournalContent } from '@/lib/journal/parser';
import { generateEmbeddings } from '@/lib/journal/embeddings';
import { getLangfuseClient } from '@/lib/observability/langfuse';

export async function POST(request: NextRequest) {
  const langfuse = getLangfuseClient();
  const trace = langfuse.trace({
    name: 'journal-upload',
    input: {
      timestamp: new Date().toISOString()
    }
  });
  
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      trace.update({
        output: { error: 'No file provided' }
      });
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Read file content
    const content = await file.text();
    
    // Parse journal entries
    const parsingSpan = trace.span({
      name: 'journal-parsing',
      input: { 
        fileName: file.name,
        fileSize: file.size,
        contentLength: content.length
      }
    });
    
    const entries = parseJournalContent(content);
    
    parsingSpan.end({
      output: { 
        entriesFound: entries.length
      }
    });
    
    if (entries.length === 0) {
      trace.update({
        output: { error: 'No valid journal entries found' }
      });
      return NextResponse.json(
        { error: 'No valid journal entries found. Please ensure your entries include dates.' },
        { status: 400 }
      );
    }

    // Store in database
    const db = getDatabase();
    const insertedIds: number[] = [];
    let embeddingSuccessCount = 0;
    let embeddingErrorCount = 0;

    const storageSpan = trace.span({
      name: 'journal-storage',
      input: { 
        entriesToStore: entries.length
      }
    });

    for (const entry of entries) {
      // Insert journal entry
      const insertStmt = db.prepare(`
        INSERT INTO journal_entries (entry_date, content, metadata)
        VALUES (?, ?, ?)
      `);
      
      const result = insertStmt.run(
        entry.date,
        entry.content,
        JSON.stringify(entry.metadata || {})
      );
      
      const entryId = result.lastInsertRowid as number;
      insertedIds.push(entryId);

      // Generate and store embeddings for RAG
      try {
        const chunks = await generateEmbeddings(entryId, entry.content);
        
        const embedStmt = db.prepare(`
          INSERT INTO journal_embeddings (journal_entry_id, chunk_text, embedding, chunk_index)
          VALUES (?, ?, ?, ?)
        `);
        
        for (const chunk of chunks) {
          embedStmt.run(
            entryId,
            chunk.text,
            chunk.embedding,
            chunk.index
          );
        }
        embeddingSuccessCount++;
      } catch (embeddingError) {
        console.error('Failed to generate embeddings for entry:', entryId, embeddingError);
        embeddingErrorCount++;
        // Continue without embeddings - chat will still work but without RAG for this entry
      }
    }

    storageSpan.end({
      output: { 
        entriesStored: insertedIds.length,
        embeddingSuccesses: embeddingSuccessCount,
        embeddingErrors: embeddingErrorCount
      }
    });

    const response = {
      message: `Successfully processed ${entries.length} journal entries`,
      entriesProcessed: entries.length,
      entryIds: insertedIds,
      embeddingStats: {
        successful: embeddingSuccessCount,
        failed: embeddingErrorCount
      }
    };

    trace.update({
      output: response,
      metadata: {
        fileName: file.name,
        fileSize: file.size,
        processingTimeMs: Date.now() - Date.now()
      }
    });

    await langfuse.flushAsync();

    return NextResponse.json(response);

  } catch (error) {
    console.error('Journal upload error:', error);
    trace.update({
      output: { 
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    });
    await langfuse.flushAsync();
    
    return NextResponse.json(
      { error: 'Failed to process journal file' },
      { status: 500 }
    );
  }
}
