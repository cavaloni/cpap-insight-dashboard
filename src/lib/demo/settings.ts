import { getDatabase } from '@/lib/db';

export interface DemoSettings {
  enabled: boolean;
  seedInfo: {
    startDate: string;
    endDate: string;
    nightsCount: number;
    journalEntriesCount: number;
    seededAt: string;
  } | null;
}

const DEMO_MODE_KEY = 'demo_mode_enabled';
const DEMO_SEED_INFO_KEY = 'demo_seed_info';

export function getDemoSettings(): DemoSettings {
  const db = getDatabase();
  
  const enabledRow = db.prepare(
    `SELECT value FROM data_metadata WHERE key = ?`
  ).get(DEMO_MODE_KEY) as { value: string } | undefined;
  
  const seedInfoRow = db.prepare(
    `SELECT value FROM data_metadata WHERE key = ?`
  ).get(DEMO_SEED_INFO_KEY) as { value: string } | undefined;
  
  return {
    enabled: enabledRow?.value === 'true',
    seedInfo: seedInfoRow ? JSON.parse(seedInfoRow.value) : null
  };
}

export function setDemoEnabled(enabled: boolean): void {
  const db = getDatabase();
  
  db.prepare(`
    INSERT OR REPLACE INTO data_metadata (key, value, updated_at)
    VALUES (?, ?, ?)
  `).run(DEMO_MODE_KEY, enabled ? 'true' : 'false', new Date().toISOString());
}

export function setSeedInfo(info: DemoSettings['seedInfo']): void {
  const db = getDatabase();
  
  if (info) {
    db.prepare(`
      INSERT OR REPLACE INTO data_metadata (key, value, updated_at)
      VALUES (?, ?, ?)
    `).run(DEMO_SEED_INFO_KEY, JSON.stringify(info), new Date().toISOString());
  } else {
    db.prepare(`DELETE FROM data_metadata WHERE key = ?`).run(DEMO_SEED_INFO_KEY);
  }
}

export function isDemoSession(sessionId: string): boolean {
  return sessionId.startsWith('demo-');
}

export function isDemoModeActive(): boolean {
  return getDemoSettings().enabled;
}
