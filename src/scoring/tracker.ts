import type { Grade, StatusColor } from "./types";

export interface SiteRecord {
  hostname: string;
  grade: Grade;
  color: StatusColor;
  crackTime: string;
  loginCount: number;
  nudgeLevel: number; // 0=dot, 1=banner, 2=prominent, 3=interstitial
  lastSeen: number;
  fixed: boolean;
}

export interface TrackerStats {
  vulnerableCount: number;
  fixedCount: number;
  totalTracked: number;
  sites: SiteRecord[];
}

const STORAGE_KEY = "aps_site_records";

export async function recordLogin(
  hostname: string,
  grade: Grade,
  color: StatusColor,
  crackTime: string,
): Promise<SiteRecord> {
  const records = await getAllRecords();
  const existing = records[hostname];

  const isWeak = color === "red" || color === "yellow";

  const record: SiteRecord = {
    hostname,
    grade,
    color,
    crackTime,
    loginCount: (existing?.loginCount ?? 0) + 1,
    nudgeLevel: isWeak ? computeNudgeLevel(existing) : 0,
    lastSeen: Date.now(),
    fixed: !isWeak && (existing?.fixed ?? false),
  };

  // If they previously had a weak password and now it's strong, mark fixed
  if (existing && !isWeak && (existing.color === "red" || existing.color === "yellow")) {
    record.fixed = true;
  }

  records[hostname] = record;
  await chrome.storage.local.set({ [STORAGE_KEY]: records });
  return record;
}

export async function markFixed(hostname: string): Promise<void> {
  const records = await getAllRecords();
  if (records[hostname]) {
    records[hostname]!.fixed = true;
    records[hostname]!.nudgeLevel = 0;
    await chrome.storage.local.set({ [STORAGE_KEY]: records });
  }
}

export async function getStats(): Promise<TrackerStats> {
  const records = await getAllRecords();
  const sites = Object.values(records).sort((a, b) => b.lastSeen - a.lastSeen);

  return {
    vulnerableCount: sites.filter(
      (s) => (s.color === "red" || s.color === "yellow") && !s.fixed,
    ).length,
    fixedCount: sites.filter((s) => s.fixed).length,
    totalTracked: sites.length,
    sites,
  };
}

export async function getSiteRecord(
  hostname: string,
): Promise<SiteRecord | null> {
  const records = await getAllRecords();
  return records[hostname] ?? null;
}

async function getAllRecords(): Promise<Record<string, SiteRecord>> {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return (data[STORAGE_KEY] as Record<string, SiteRecord>) ?? {};
}

/**
 * Escalation schedule:
 * Login 1:   level 0 — just the colored dot
 * Login 2:   level 1 — slide-in banner
 * Login 3-4: level 2 — prominent banner (larger, harder to dismiss)
 * Login 5+:  level 3 — interstitial overlay
 */
function computeNudgeLevel(existing?: SiteRecord): number {
  if (!existing) return 0;
  const count = existing.loginCount + 1;
  if (count <= 1) return 0;
  if (count === 2) return 1;
  if (count <= 4) return 2;
  return 3;
}
