import { parseDate as chronoParseDate } from 'chrono-node';

export interface JournalEntry {
  date: string; // ISO format YYYY-MM-DD
  content: string;
  metadata?: {
    originalDate?: string;
    confidence?: number;
    lineCount?: number;
  };
}

export function parseJournalContent(content: string, referenceDate?: Date): JournalEntry[] {
  const lines = content.split('\n');
  const entries: JournalEntry[] = [];
  let currentEntry: { date?: string; content: string[]; originalDate?: string } = {
    content: []
  };
  
  const refDate = referenceDate || new Date();

  // Date patterns in order of specificity
  const datePatterns = [
    // ISO format: 2024-01-15 or 2024/01/15
    /^(\d{4}[-/]\d{1,2}[-/]\d{1,2})/,
    // US format: 01/15/2024 or 1/15/2024
    /^(\d{1,2}\/\d{1,2}\/\d{4})/,
    // European format: 15-01-2024 or 15/01/2024
    /^(\d{1,2}[-/]\d{1,2}[-/]\d{4})/,
    // Month Day, Year: January 15, 2024
    /^([A-Za-z]+ \d{1,2},? \d{4})/i,
    // Day Month Year: 15 January 2024
    /^(\d{1,2} [A-Za-z]+ \d{4})/i
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (!line) {
      // Empty line - might indicate end of entry
      if (currentEntry.content.length > 0) {
        currentEntry.content.push('');
      }
      continue;
    }

    let foundDate = false;
    let parsedDate: Date | null = null;
    let originalDate = '';

    // Try structured patterns first
    for (const pattern of datePatterns) {
      const match = line.match(pattern);
      if (match) {
        originalDate = match[1];
        
        // Parse the matched date
        parsedDate = parseStructuredDate(originalDate);
        if (parsedDate) {
          foundDate = true;
          break;
        }
      }
    }

    // If no structured date found, try natural language
    if (!foundDate) {
      // Check if line starts with a natural language date
      const naturalDateMatch = line.match(/^(yesterday|today|tomorrow|last\s+(?:week|month|year|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|next\s+(?:week|month|year|monday|tuesday|wednesday|thursday|friday|saturday|sunday))/i);
      
      if (naturalDateMatch) {
        originalDate = naturalDateMatch[1];
        const date = chronoParseDate(originalDate, refDate);
        if (date) {
          parsedDate = date;
          foundDate = true;
        }
      }
    }

    if (foundDate && parsedDate) {
      // Save previous entry if exists
      if (currentEntry.date && currentEntry.content.length > 0) {
        entries.push({
          date: currentEntry.date,
          content: currentEntry.content.join('\n').trim(),
          metadata: {
            originalDate: currentEntry.originalDate,
            confidence: 0.9,
            lineCount: currentEntry.content.length
          }
        });
      }

      // Start new entry
      currentEntry = {
        date: parsedDate!.toISOString().split('T')[0], // YYYY-MM-DD
        content: [line.replace(/^[^A-Za-z0-9]*/, '')], // Remove date prefix
        originalDate
      };
    } else if (currentEntry.date) {
      // Add to current entry
      currentEntry.content.push(line);
    } else {
      // No date found yet, collect as potential content
      currentEntry.content.push(line);
    }
  }

  // Don't forget the last entry
  if (currentEntry.date && currentEntry.content.length > 0) {
    entries.push({
      date: currentEntry.date,
      content: currentEntry.content.join('\n').trim(),
      metadata: {
        originalDate: currentEntry.originalDate,
        confidence: 0.9,
        lineCount: currentEntry.content.length
      }
    });
  }

  return entries;
}

function parseStructuredDate(dateStr: string): Date | null {
  try {
    // Handle different separators
    const normalized = dateStr.replace(/[\/]/g, '-');
    
    // Try ISO format first
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(normalized)) {
      const date = new Date(normalized + 'T00:00:00');
      if (!isNaN(date.getTime())) return date;
    }
    
    // Try US format (MM-DD-YYYY)
    if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(normalized)) {
      const parts = normalized.split('-');
      if (parts.length === 3) {
        const month = parseInt(parts[0]) - 1; // JS months are 0-indexed
        const day = parseInt(parts[1]);
        const year = parseInt(parts[2]);
        const date = new Date(year, month, day);
        if (!isNaN(date.getTime())) return date;
      }
    }
    
    // Try natural language with chrono as fallback
    const date = chronoParseDate(dateStr);
    if (date && !isNaN(date.getTime())) {
      return date;
    }
  } catch (error) {
    console.error('Date parsing error:', error);
  }
  
  return null;
}

// Chunk content for embeddings - splits into manageable pieces with overlap
export function chunkContent(content: string, maxChunkSize: number = 500, overlap: number = 50): string[] {
  const sentences = content.match(/[^.!?]+[.!?]+/g) || [content];
  const chunks: string[] = [];
  let currentChunk = '';
  
  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length > maxChunkSize && currentChunk) {
      chunks.push(currentChunk.trim());
      
      // Start next chunk with overlap
      const words = currentChunk.split(' ');
      const overlapWords = words.slice(-Math.floor(overlap / 5));
      currentChunk = overlapWords.join(' ') + ' ' + sentence;
    } else {
      currentChunk += sentence;
    }
  }
  
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks.filter(chunk => chunk.length > 10); // Filter out very short chunks
}
