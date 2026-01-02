import { getDatabase } from '@/lib/db';
import { setSeedInfo } from './settings';
import { generateEmbeddings } from '@/lib/journal/embeddings';

// Seeded random number generator for deterministic demo data
function seededRandom(seed: number): () => number {
  return function() {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

function randomInRange(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min);
}

function randomInt(rng: () => number, min: number, max: number): number {
  return Math.floor(randomInRange(rng, min, max + 1));
}

function pickRandom<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

// Generate realistic CPAP metrics for a night
function generateNightMetrics(rng: () => number, dayOfMonth: number) {
  // Base patterns - some variation through the month
  const isWeekend = dayOfMonth % 7 === 0 || dayOfMonth % 7 === 6;
  const isBadNight = rng() < 0.15; // 15% chance of a "bad" night
  
  // Usage: 5-8.5 hours typically, less on bad nights
  const baseUsage = isWeekend ? randomInRange(rng, 360, 510) : randomInRange(rng, 300, 480);
  const totalUsageMinutes = isBadNight ? baseUsage * 0.7 : baseUsage;
  const maskOnMinutes = totalUsageMinutes * randomInRange(rng, 0.92, 0.99);
  
  // Pressure: 8-14 cm H2O typical range
  const medianPressure = randomInRange(rng, 9, 12);
  const minPressure = medianPressure - randomInRange(rng, 1, 2);
  const maxPressure = medianPressure + randomInRange(rng, 2, 4);
  const pressure95th = medianPressure + randomInRange(rng, 1.5, 3);
  
  // Leaks: usually low, occasionally high
  const hasLeakIssue = rng() < 0.1;
  const medianLeakRate = hasLeakIssue ? randomInRange(rng, 15, 30) : randomInRange(rng, 2, 10);
  const maxLeakRate = medianLeakRate + randomInRange(rng, 10, 40);
  const leak95th = medianLeakRate + randomInRange(rng, 5, 15);
  const largeLeakMinutes = hasLeakIssue ? randomInRange(rng, 10, 45) : randomInRange(rng, 0, 8);
  const largeLeakPercent = (largeLeakMinutes / totalUsageMinutes) * 100;
  
  // AHI: mostly good (< 5), occasionally elevated
  let ahi: number;
  if (isBadNight) {
    ahi = randomInRange(rng, 8, 25);
  } else if (rng() < 0.2) {
    ahi = randomInRange(rng, 5, 10);
  } else {
    ahi = randomInRange(rng, 0.5, 4.5);
  }
  
  // Events based on AHI
  const usageHours = maskOnMinutes / 60;
  const totalEvents = Math.round(ahi * usageHours);
  const apneaCount = Math.round(totalEvents * randomInRange(rng, 0.3, 0.5));
  const hypopneaCount = totalEvents - apneaCount;
  
  // Flow limitation
  const medianFlowLimitation = randomInRange(rng, 0.1, 0.4);
  const maxFlowLimitation = medianFlowLimitation + randomInRange(rng, 0.2, 0.6);
  
  // Quality score (derived)
  let sleepQualityScore = 100;
  if (ahi > 5) sleepQualityScore -= Math.min(30, (ahi - 5) * 2);
  if (ahi > 15) sleepQualityScore -= Math.min(20, (ahi - 15));
  if (largeLeakPercent > 10) sleepQualityScore -= Math.min(20, largeLeakPercent);
  const usagePercent = totalUsageMinutes > 0 ? (maskOnMinutes / totalUsageMinutes) * 100 : 0;
  if (usagePercent < 80) sleepQualityScore -= Math.min(30, (80 - usagePercent));
  sleepQualityScore = Math.max(0, Math.min(100, Math.round(sleepQualityScore)));
  
  return {
    totalUsageMinutes: Math.round(totalUsageMinutes * 10) / 10,
    maskOnMinutes: Math.round(maskOnMinutes * 10) / 10,
    medianPressure: Math.round(medianPressure * 10) / 10,
    minPressure: Math.round(minPressure * 10) / 10,
    maxPressure: Math.round(maxPressure * 10) / 10,
    pressure95th: Math.round(pressure95th * 10) / 10,
    medianLeakRate: Math.round(medianLeakRate * 10) / 10,
    maxLeakRate: Math.round(maxLeakRate * 10) / 10,
    leak95th: Math.round(leak95th * 10) / 10,
    largeLeakMinutes: Math.round(largeLeakMinutes * 10) / 10,
    largeLeakPercent: Math.round(largeLeakPercent * 10) / 10,
    ahi: Math.round(ahi * 10) / 10,
    apneaCount,
    hypopneaCount,
    totalEvents,
    medianFlowLimitation: Math.round(medianFlowLimitation * 100) / 100,
    maxFlowLimitation: Math.round(maxFlowLimitation * 100) / 100,
    sleepQualityScore,
    isBadNight,
    hasLeakIssue
  };
}

// Sample journal content templates
const JOURNAL_TEMPLATES = [
  {
    factors: ['alcohol'],
    content: `Had a couple glasses of wine with dinner tonight. Feeling relaxed but hoping it doesn't affect my sleep too much. Been trying to cut back but it was a social occasion.`
  },
  {
    factors: ['congestion'],
    content: `Woke up with a stuffy nose this morning. Allergies are acting up again. Used some nasal spray before bed but still feeling congested. Might need to adjust my mask tonight.`
  },
  {
    factors: ['stress'],
    content: `Work has been incredibly stressful lately. Big deadline coming up and I can feel the tension in my shoulders. Tried some deep breathing before bed but my mind keeps racing.`
  },
  {
    factors: ['exercise'],
    content: `Great workout today! Did 45 minutes of cardio and some weight training. Feeling tired in a good way. Hoping the physical exhaustion helps me sleep deeper tonight.`
  },
  {
    factors: ['late_meal'],
    content: `Ate dinner way too late tonight - almost 9pm. Stomach feels heavy and uncomfortable. Note to self: try to eat earlier tomorrow.`
  },
  {
    factors: ['travel'],
    content: `Just got back from a trip. Jet lag is hitting hard. Trying to get back on my normal sleep schedule but my body clock is all messed up.`
  },
  {
    factors: ['new_mask'],
    content: `Trying out the new mask cushion I ordered. It feels different but hopefully more comfortable. The old one was starting to show wear and I was getting more leaks.`
  },
  {
    factors: ['caffeine'],
    content: `Made the mistake of having coffee too late in the afternoon. It's 11pm and I'm still wide awake. Really need to stick to my no-caffeine-after-2pm rule.`
  },
  {
    factors: [],
    content: `Pretty normal day today. Went for a walk, did some reading. Feeling calm and ready for bed. Looking forward to a good night's rest.`
  },
  {
    factors: [],
    content: `Noticed my sleep has been improving lately. The CPAP therapy seems to be working well. Waking up feeling more refreshed than I used to.`
  },
  {
    factors: ['congestion', 'stress'],
    content: `Dealing with both a cold and work stress this week. Not a great combination. My nose is stuffed up and my mind won't stop thinking about tomorrow's presentation.`
  },
  {
    factors: ['exercise', 'alcohol'],
    content: `Had a good run this morning, then went out with friends in the evening. Probably shouldn't have had that last beer but it was fun. Hoping the exercise balances things out.`
  }
];

const SLEEP_ANNOTATION_NOTES = [
  'Felt well-rested this morning',
  'Woke up once during the night',
  'Had vivid dreams',
  'Slept through the night',
  'Mask felt uncomfortable',
  'Great sleep quality',
  'Took a while to fall asleep',
  'Woke up before alarm feeling refreshed',
  'Felt groggy in the morning',
  'Best sleep in weeks',
  'Restless night',
  'Slept deeply',
  null // No note
];

export interface SeedResult {
  nightsSeeded: number;
  journalEntriesSeeded: number;
  journalEntriesVectorized: number;
  annotationsSeeded: number;
  dateRange: { start: string; end: string };
}

export async function seedDemoData(daysBack: number = 30): Promise<SeedResult> {
  const db = getDatabase();
  const rng = seededRandom(42); // Fixed seed for reproducibility
  
  const endDate = new Date();
  endDate.setHours(0, 0, 0, 0);
  
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - daysBack + 1);
  
  const result: SeedResult = {
    nightsSeeded: 0,
    journalEntriesSeeded: 0,
    journalEntriesVectorized: 0,
    annotationsSeeded: 0,
    dateRange: {
      start: startDate.toISOString().split('T')[0],
      end: endDate.toISOString().split('T')[0]
    }
  };
  
  // Prepare statements
  const insertAggregate = db.prepare(`
    INSERT OR REPLACE INTO nightly_aggregates (
      date, session_id, total_usage_minutes, mask_on_minutes,
      median_pressure, min_pressure, max_pressure, pressure_95th_percentile,
      median_leak_rate, max_leak_rate, leak_95th_percentile,
      large_leak_minutes, large_leak_percent,
      ahi, apnea_count, hypopnea_count, total_events,
      median_flow_limitation, max_flow_limitation,
      sleep_quality_score, parquet_path
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  const insertJournal = db.prepare(`
    INSERT INTO journal_entries (entry_date, content, metadata)
    VALUES (?, ?, ?)
  `);
  
  const insertAnnotation = db.prepare(`
    INSERT INTO sleep_annotations (date, note, factors)
    VALUES (?, ?, ?)
  `);
  
  const insertEmbedding = db.prepare(`
    INSERT INTO journal_embeddings (journal_entry_id, chunk_text, embedding, chunk_index)
    VALUES (?, ?, ?, ?)
  `);
  
  // Generate data for each day
  const transaction = db.transaction(() => {
    for (let i = 0; i < daysBack; i++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(currentDate.getDate() + i);
      const dateStr = currentDate.toISOString().split('T')[0];
      const sessionId = `demo-${dateStr}`;
      
      // Generate nightly aggregate
      const metrics = generateNightMetrics(rng, i + 1);
      
      insertAggregate.run(
        dateStr,
        sessionId,
        metrics.totalUsageMinutes,
        metrics.maskOnMinutes,
        metrics.medianPressure,
        metrics.minPressure,
        metrics.maxPressure,
        metrics.pressure95th,
        metrics.medianLeakRate,
        metrics.maxLeakRate,
        metrics.leak95th,
        metrics.largeLeakMinutes,
        metrics.largeLeakPercent,
        metrics.ahi,
        metrics.apneaCount,
        metrics.hypopneaCount,
        metrics.totalEvents,
        metrics.medianFlowLimitation,
        metrics.maxFlowLimitation,
        metrics.sleepQualityScore,
        `demo://${sessionId}` // Sentinel path for demo sessions
      );
      result.nightsSeeded++;
      
      // Add journal entry for every day
      const template = pickRandom(rng, JOURNAL_TEMPLATES);
      const journalResult = insertJournal.run(
        dateStr,
        template.content,
        JSON.stringify({ factors: template.factors, isDemo: true })
      );
      result.journalEntriesSeeded++;
      
      // Store the journal entry data for later embedding generation
      if (process.env.OPENROUTER_API_KEY) {
        // Store in a temporary array for processing after transaction
        (result as any)._pendingEmbeddings = (result as any)._pendingEmbeddings || [];
        (result as any)._pendingEmbeddings.push({
          id: journalResult.lastInsertRowid as number,
          content: template.content,
          date: dateStr
        });
      }
      
      // Add sleep annotation (70% chance per day)
      if (rng() < 0.7) {
        const note = pickRandom(rng, SLEEP_ANNOTATION_NOTES);
        const factors: string[] = [];
        
        // Add factors based on metrics
        if (metrics.isBadNight) {
          if (rng() < 0.5) factors.push('stress');
          if (rng() < 0.3) factors.push('alcohol');
        }
        if (metrics.hasLeakIssue && rng() < 0.6) {
          factors.push('congestion');
        }
        
        insertAnnotation.run(
          dateStr,
          note,
          JSON.stringify(factors)
        );
        result.annotationsSeeded++;
      }
    }
  });
  
  // Execute the synchronous transaction
  transaction();
  
  // Generate embeddings after transaction completes
  if (process.env.OPENROUTER_API_KEY && (result as any)._pendingEmbeddings) {
    for (const entry of (result as any)._pendingEmbeddings) {
      try {
        const embeddings = await generateEmbeddings(entry.id, entry.content);
        
        for (const embedding of embeddings) {
          insertEmbedding.run(
            entry.id,
            embedding.text,
            embedding.embedding,
            embedding.index
          );
        }
        
        if (embeddings.length > 0) {
          result.journalEntriesVectorized++;
        }
      } catch (error) {
        console.error(`Failed to generate embeddings for journal entry on ${entry.date}:`, error);
        // Continue without embeddings
      }
    }
    // Clean up temporary data
    delete (result as any)._pendingEmbeddings;
  }
  
  // Save seed info
  setSeedInfo({
    startDate: result.dateRange.start,
    endDate: result.dateRange.end,
    nightsCount: result.nightsSeeded,
    journalEntriesCount: result.journalEntriesSeeded,
    seededAt: new Date().toISOString()
  });
  
  return result;
}

export async function clearDemoData(): Promise<{ cleared: boolean }> {
  const db = getDatabase();
  
  const transaction = db.transaction(() => {
    // Delete demo nightly aggregates
    db.prepare(`DELETE FROM nightly_aggregates WHERE session_id LIKE 'demo-%'`).run();
    
    // Delete demo journal entries (those with isDemo metadata)
    db.prepare(`DELETE FROM journal_entries WHERE json_extract(metadata, '$.isDemo') = true`).run();
    
    // Delete demo sleep annotations for demo dates
    db.prepare(`
      DELETE FROM sleep_annotations 
      WHERE date IN (SELECT date FROM nightly_aggregates WHERE session_id LIKE 'demo-%')
         OR date NOT IN (SELECT date FROM nightly_aggregates)
    `).run();
    
    // Also clean up any orphaned demo annotations
    db.prepare(`
      DELETE FROM sleep_annotations 
      WHERE date >= (SELECT MIN(date) FROM nightly_aggregates WHERE session_id LIKE 'demo-%')
        AND date <= (SELECT MAX(date) FROM nightly_aggregates WHERE session_id LIKE 'demo-%')
    `).run();
  });
  
  transaction();
  
  // Clear seed info
  setSeedInfo(null);
  
  return { cleared: true };
}
