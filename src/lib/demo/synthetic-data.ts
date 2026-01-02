// Synthetic time-series generator for demo sessions
// Generates realistic CPAP waveforms on-the-fly without storing parquet files

// Seeded PRNG for deterministic generation based on session ID
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

function seededRandom(seed: number): () => number {
  return function() {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

interface MesoDataPoint {
  bucket_start: number;
  flow_min: number;
  flow_max: number;
  flow_avg: number;
  pressure_avg: number;
  leak_max: number;
  mask_on_pct: number;
}

interface MicroDataPoint {
  timestamp: number;
  flow_rate: number;
  pressure: number;
  leak_rate: number;
  mask_on: number;
}

// Generate synthetic meso (bucketed) data for a demo session
export function generateSyntheticMeso(
  sessionId: string,
  bucketSeconds: number,
  durationMinutes: number = 480 // 8 hours default
): MesoDataPoint[] {
  const seed = hashString(sessionId);
  const rng = seededRandom(seed);
  
  const totalBuckets = Math.ceil((durationMinutes * 60) / bucketSeconds);
  const data: MesoDataPoint[] = [];
  
  // Session start time (use date from session ID if available)
  const dateMatch = sessionId.match(/demo-(\d{4}-\d{2}-\d{2})/);
  const baseDate = dateMatch ? new Date(dateMatch[1]) : new Date();
  baseDate.setHours(22, 0, 0, 0); // Assume 10 PM start
  const startTimestamp = baseDate.getTime();
  
  // Generate base patterns for the night
  const basePressure = 9 + rng() * 3; // 9-12 cm H2O
  const baseLeakRate = 3 + rng() * 5; // 3-8 L/min base
  
  // Simulate sleep stages (roughly)
  // Light sleep -> Deep sleep -> REM -> repeat
  const cycleLength = Math.floor(totalBuckets / 5); // ~5 sleep cycles per night
  
  for (let i = 0; i < totalBuckets; i++) {
    const bucketStart = startTimestamp + (i * bucketSeconds * 1000);
    const cyclePosition = (i % cycleLength) / cycleLength;
    
    // Simulate breathing patterns
    // Flow varies with sleep stage
    const sleepDepth = Math.sin(cyclePosition * Math.PI); // 0 at start/end, 1 in middle
    const baseFlow = 15 + sleepDepth * 5; // Deeper sleep = more regular breathing
    
    // Add some randomness
    const flowVariation = rng() * 8;
    const flowAvg = baseFlow + flowVariation - 4;
    const flowMin = flowAvg - 5 - rng() * 5;
    const flowMax = flowAvg + 5 + rng() * 5;
    
    // Pressure adjusts slightly through the night
    const pressureVariation = Math.sin(i / totalBuckets * Math.PI * 2) * 0.5;
    const pressureAvg = basePressure + pressureVariation + (rng() - 0.5) * 0.3;
    
    // Leaks - occasional spikes
    let leakMax = baseLeakRate + rng() * 5;
    if (rng() < 0.05) {
      // 5% chance of a leak spike in this bucket
      leakMax += 15 + rng() * 25;
    }
    
    // Mask on - almost always 100% except rare brief removals
    let maskOnPct = 100;
    if (rng() < 0.02) {
      maskOnPct = 80 + rng() * 15; // Brief mask adjustment
    }
    
    data.push({
      bucket_start: bucketStart,
      flow_min: Math.round(Math.max(0, flowMin) * 10) / 10,
      flow_max: Math.round(flowMax * 10) / 10,
      flow_avg: Math.round(flowAvg * 10) / 10,
      pressure_avg: Math.round(pressureAvg * 10) / 10,
      leak_max: Math.round(leakMax * 10) / 10,
      mask_on_pct: Math.round(maskOnPct * 10) / 10
    });
  }
  
  return data;
}

// Generate synthetic micro (raw) data for a demo session
export function generateSyntheticMicro(
  sessionId: string,
  startTime: number,
  endTime: number,
  sampleRateHz: number = 25
): MicroDataPoint[] {
  const seed = hashString(sessionId);
  const rng = seededRandom(seed);
  
  // Fast-forward RNG to approximate position in session
  // This ensures consistency if user requests different time ranges
  const dateMatch = sessionId.match(/demo-(\d{4}-\d{2}-\d{2})/);
  const baseDate = dateMatch ? new Date(dateMatch[1]) : new Date();
  baseDate.setHours(22, 0, 0, 0);
  const sessionStart = baseDate.getTime();
  
  const offsetFromStart = Math.max(0, startTime - sessionStart);
  const skipSamples = Math.floor(offsetFromStart / (1000 / sampleRateHz));
  
  // Fast-forward RNG (simplified - just advance it)
  for (let i = 0; i < skipSamples % 10000; i++) {
    rng();
  }
  
  const data: MicroDataPoint[] = [];
  const intervalMs = 1000 / sampleRateHz;
  
  // Base parameters for this session
  const basePressure = 9 + (hashString(sessionId + 'pressure') % 30) / 10;
  const baseLeakRate = 3 + (hashString(sessionId + 'leak') % 50) / 10;
  
  // Breathing cycle parameters
  const breathCycleMs = 4000 + rng() * 2000; // 4-6 second breath cycle
  
  let currentTime = startTime;
  let breathPhase = (startTime % breathCycleMs) / breathCycleMs;
  
  // Limit to reasonable number of points
  const maxPoints = 50000;
  let pointCount = 0;
  
  while (currentTime <= endTime && pointCount < maxPoints) {
    // Breathing waveform (sinusoidal with some variation)
    breathPhase = ((currentTime - sessionStart) % breathCycleMs) / breathCycleMs;
    const breathWave = Math.sin(breathPhase * Math.PI * 2);
    
    // Flow rate follows breathing pattern
    const flowBase = 15 + breathWave * 12; // Inhale positive, exhale negative-ish
    const flowNoise = (rng() - 0.5) * 3;
    const flowRate = Math.max(-5, flowBase + flowNoise);
    
    // Pressure is relatively stable with small variations
    const pressureNoise = (rng() - 0.5) * 0.5;
    const pressure = basePressure + pressureNoise;
    
    // Leak rate - mostly stable with occasional spikes
    let leakRate = baseLeakRate + (rng() - 0.5) * 2;
    if (rng() < 0.001) {
      leakRate += 20 + rng() * 30; // Rare spike
    }
    leakRate = Math.max(0, leakRate);
    
    // Mask on - almost always 1
    const maskOn = rng() < 0.001 ? 0 : 1;
    
    data.push({
      timestamp: currentTime,
      flow_rate: Math.round(flowRate * 100) / 100,
      pressure: Math.round(pressure * 100) / 100,
      leak_rate: Math.round(leakRate * 100) / 100,
      mask_on: maskOn
    });
    
    currentTime += intervalMs;
    pointCount++;
  }
  
  return data;
}

// Get session duration from session ID (for demo sessions)
export function getDemoSessionDuration(sessionId: string): number {
  // Use hash to generate consistent duration for each session
  const seed = hashString(sessionId + 'duration');
  const rng = seededRandom(seed);
  
  // 5-8.5 hours in minutes
  return Math.round(300 + rng() * 210);
}

// Get session start timestamp from session ID
export function getDemoSessionStartTime(sessionId: string): number {
  const dateMatch = sessionId.match(/demo-(\d{4}-\d{2}-\d{2})/);
  const baseDate = dateMatch ? new Date(dateMatch[1]) : new Date();
  
  // Vary start time slightly (9:30 PM - 11:30 PM)
  const seed = hashString(sessionId + 'starttime');
  const rng = seededRandom(seed);
  const startHour = 21 + rng() * 2.5;
  const startMinute = Math.floor((startHour % 1) * 60);
  
  baseDate.setHours(Math.floor(startHour), startMinute, 0, 0);
  return baseDate.getTime();
}
