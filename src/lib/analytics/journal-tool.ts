import { getDatabase } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import { generateQueryEmbedding, searchJournalEntries } from '@/lib/journal/embeddings';
import { ToolResult } from './tools';

export interface JournalSearchResult {
  query: string;
  entries: Array<{
    date: string;
    text: string;
    score: number;
  }>;
  total_found: number;
  search_date_range?: { start: string; end: string };
}

// Tool: Search Journal Entries
export async function searchJournal(
  query: string,
  dateRange?: { start: string; end: string },
  limit: number = 5
): Promise<ToolResult<JournalSearchResult>> {
  const artifactId = uuidv4();
  
  try {
    // Generate embedding for the query
    const queryEmbedding = await generateQueryEmbedding(query);
    
    // Search for relevant entries
    const entries = await searchJournalEntries(queryEmbedding, dateRange, limit);
    
    const result: ToolResult<JournalSearchResult> = {
      data: {
        query,
        entries,
        total_found: entries.length,
        search_date_range: dateRange
      },
      provenance: {
        toolName: 'searchJournal',
        parameters: { query, dateRange, limit },
        computedAt: new Date().toISOString(),
        definitions: [
          'Journal entries are searched using semantic similarity',
          'Results are ranked by relevance score (0-1)',
          'Entries are filtered by date range if provided',
          `Showing top ${entries.length} matching entries`
        ],
        artifactId
      }
    };
    
    // Store evidence artifact
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO evidence_artifacts (id, tool_name, parameters, result, provenance)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      artifactId,
      result.provenance.toolName,
      JSON.stringify(result.provenance.parameters),
      JSON.stringify(result.data),
      JSON.stringify(result.provenance)
    );
    
    return result;
    
  } catch (error) {
    // Return empty result if search fails
    return {
      data: {
        query,
        entries: [],
        total_found: 0,
        search_date_range: dateRange
      },
      provenance: {
        toolName: 'searchJournal',
        parameters: { query, dateRange, limit },
        computedAt: new Date().toISOString(),
        definitions: [
          'Journal search failed: ' + (error instanceof Error ? error.message : 'Unknown error'),
          'No journal entries available or search service unavailable'
        ],
        artifactId
      }
    };
  }
}

// Tool: List Available Journal Dates
export async function getJournalDateRange(): Promise<ToolResult<{ min_date: string; max_date: string; entry_count: number }>> {
  const artifactId = uuidv4();
  const db = getDatabase();
  
  try {
    const stmt = db.prepare(`
      SELECT 
        MIN(entry_date) as min_date,
        MAX(entry_date) as max_date,
        COUNT(*) as entry_count
      FROM journal_entries
    `);
    
    const result = stmt.get() as { min_date: string; max_date: string; entry_count: number };
    
    return {
      data: result || { min_date: '', max_date: '', entry_count: 0 },
      provenance: {
        toolName: 'getJournalDateRange',
        parameters: {},
        computedAt: new Date().toISOString(),
        definitions: [
          'Available journal entry dates in the database',
          `Total entries: ${result?.entry_count || 0}`,
          'Use searchJournal to find specific content'
        ],
        artifactId
      }
    };
    
  } catch (error) {
    return {
      data: { min_date: '', max_date: '', entry_count: 0 },
      provenance: {
        toolName: 'getJournalDateRange',
        parameters: {},
        computedAt: new Date().toISOString(),
        definitions: [
          'Journal database not available',
          'Upload journal entries to enable search functionality'
        ],
        artifactId
      }
    };
  }
}
