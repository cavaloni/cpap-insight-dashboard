import { chunkContent } from './parser';
import { OpenRouterClient } from '@/lib/llm/openrouter';

export interface EmbeddingChunk {
  text: string;
  embedding: Buffer;
  index: number;
}

// Simple embedding generation using OpenRouter's API
// In production, you might want to use a local model or different provider
export async function generateEmbeddings(journalEntryId: number, content: string): Promise<EmbeddingChunk[]> {
  const chunks = chunkContent(content);
  const embeddings: EmbeddingChunk[] = [];
  
  // Check if OpenRouter API key is available
  if (!process.env.OPENROUTER_API_KEY) {
    console.warn('OpenRouter API key not found, skipping embeddings generation');
    return embeddings;
  }
  
  const openRouterClient = new OpenRouterClient();

  for (let i = 0; i < chunks.length; i++) {
    try {
      const embedding = await generateSingleEmbedding(chunks[i], openRouterClient);
      embeddings.push({
        text: chunks[i],
        embedding: embedding,
        index: i
      });
    } catch (error) {
      console.error(`Failed to generate embedding for chunk ${i}:`, error);
      // Continue with other chunks
    }
  }

  return embeddings;
}

async function generateSingleEmbedding(text: string, openRouterClient: OpenRouterClient): Promise<Buffer> {
  const embedding = await openRouterClient.generateEmbedding(text);

  // Convert float array to buffer for storage
  const buffer = Buffer.alloc(embedding.length * 4);
  for (let i = 0; i < embedding.length; i++) {
    buffer.writeFloatLE(embedding[i], i * 4);
  }

  return buffer;
}

// Search for relevant journal entries using cosine similarity
export async function searchJournalEntries(
  queryEmbedding: number[], 
  dateRange?: { start: string; end: string },
  limit: number = 5
): Promise<Array<{ text: string; date: string; score: number }>> {
  const { getDatabase } = await import('@/lib/db');
  const db = getDatabase();

  // Build query with date filter if provided
  let whereClause = '';
  const params: any[] = [];

  if (dateRange) {
    whereClause = `
      AND j.entry_date >= ? 
      AND j.entry_date <= ?
    `;
    params.push(dateRange.start, dateRange.end);
  }

  // SQLite doesn't have built-in cosine similarity, so we'll use a simple approach
  // In production, consider using sqlite-vss extension for better performance
  const stmt = db.prepare(`
    SELECT 
      j.entry_date,
      j.content,
      j.id as entry_id,
      je.chunk_text,
      je.embedding
    FROM journal_embeddings je
    JOIN journal_entries j ON j.id = je.journal_entry_id
    WHERE 1=1 ${whereClause}
    ORDER BY je.created_at DESC
    LIMIT 100
  `);

  const results = stmt.all(...params);
  
  // Calculate cosine similarity in JavaScript
  const scoredResults = results
    .map((row: any) => {
      const embeddingBuffer: Buffer | undefined = row.embedding;
      if (!embeddingBuffer || !Buffer.isBuffer(embeddingBuffer)) {
        return null;
      }

      // Embeddings are stored as Float32LE in a BLOB.
      // Decode into a float array for cosine similarity.
      if (embeddingBuffer.length % 4 !== 0) {
        return null;
      }

      const embeddingDim = embeddingBuffer.length / 4;
      if (embeddingDim !== queryEmbedding.length) {
        return null;
      }

      const embeddingArray = new Array<number>(embeddingDim);
      for (let i = 0; i < embeddingDim; i++) {
        embeddingArray[i] = embeddingBuffer.readFloatLE(i * 4);
      }

      const similarity = cosineSimilarity(queryEmbedding, embeddingArray);

      return {
        text: row.chunk_text,
        date: row.entry_date,
        score: similarity,
        entryId: row.entry_id,
        fullContent: row.content
      };
    })
    .filter((row): row is { text: string; date: string; score: number; entryId: number; fullContent: string } => row !== null);

  // Sort by similarity score and return top results
  return scoredResults
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ text, date, score }) => ({ text, date, score }));
}

// Cosine similarity calculation
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vector dimensions must match');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Generate embedding for user query
export async function generateQueryEmbedding(query: string): Promise<number[]> {
  // Check if OpenRouter API key is available
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error('OpenRouter API key is required for query embeddings');
  }
  
  const openRouterClient = new OpenRouterClient();
  return await openRouterClient.generateEmbedding(query);
}
