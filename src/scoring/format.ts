export function formatDuration(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "—";
  if (seconds < 0.001) return "instant";
  if (seconds < 1) return `${(seconds * 1000).toFixed(0)}ms`;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)} min`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)} hrs`;
  if (seconds < 86400 * 30) return `${(seconds / 86400).toFixed(0)} days`;
  if (seconds < 86400 * 365) return `${(seconds / (86400 * 30)).toFixed(1)} mo`;
  if (seconds < 86400 * 365 * 100) return `${(seconds / (86400 * 365)).toFixed(1)} yrs`;
  if (seconds < 86400 * 365 * 1e6) return `${(seconds / (86400 * 365 * 1000)).toFixed(0)}k yrs`;
  if (seconds < 86400 * 365 * 1e9) return `${(seconds / (86400 * 365 * 1e6)).toFixed(0)}M yrs`;
  return `${(seconds / (86400 * 365 * 1e9)).toFixed(0)}B+ yrs`;
}
