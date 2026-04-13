import { useEffect, useState, useCallback } from "react";
import { scan, generateStrongPassword } from "../scoring/engine";
import type { ThreatVector, ScanResult } from "../scoring/types";
import type { TrackerStats, SiteRecord } from "../scoring/tracker";

interface FieldData {
  url: string;
  grade: string;
  color: string;
  crackTime: string;
  score: number;
  suggestion: string;
  threats: ThreatVector[];
  timestamp: number;
}

interface PageStatus {
  hasPasswordField: boolean;
  url?: string;
  fields?: Array<{
    hasValue: boolean;
    grade: string | null;
    color: string | null;
    crackTime: string | null;
    score: number | null;
    suggestion: string | null;
    threats: ThreatVector[];
  }>;
}

export default function Popup() {
  const [field, setField] = useState<FieldData | null>(null);
  const [pageStatus, setPageStatus] = useState<PageStatus | null>(null);
  const [stats, setStats] = useState<TrackerStats | null>(null);
  const [tab, setTab] = useState<"current" | "tracker" | "check">("current");

  useEffect(() => {
    // Read all session storage data (currentField from typing, pageStatus from field detection)
    chrome.storage.session.get(["currentField", "pageStatus"], (data) => {
      if (data.currentField) setField(data.currentField);
      if (data.pageStatus) applyPageStatus(data.pageStatus);
    });

    // Also try direct messaging to the content script
    queryActiveTab();

    // If messaging fails and session storage is empty, try injecting
    // a lightweight script to check for password fields
    setTimeout(() => fallbackDetect(), 500);

    const listener = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (changes.currentField?.newValue) {
        setField(changes.currentField.newValue);
      }
      if (changes.pageStatus?.newValue) {
        applyPageStatus(changes.pageStatus.newValue);
      }
    };
    chrome.storage.session.onChanged.addListener(listener);

    loadStats();

    return () => chrome.storage.session.onChanged.removeListener(listener);
  }, []);

  function applyPageStatus(status: PageStatus) {
    setPageStatus(status);
    if (status.fields) {
      const scored = status.fields.find((f) => f.hasValue && f.grade);
      if (scored?.grade && scored.color && status.url) {
        setField({
          url: status.url,
          grade: scored.grade,
          color: scored.color,
          crackTime: scored.crackTime ?? "—",
          score: scored.score ?? 0,
          suggestion: scored.suggestion ?? "",
          threats: scored.threats ?? [],
          timestamp: Date.now(),
        });
      }
    }
  }

  function queryActiveTab() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (!activeTab?.id) return;

      chrome.tabs.sendMessage(
        activeTab.id,
        { type: "GET_PAGE_STATUS" },
        (response: PageStatus | undefined) => {
          if (chrome.runtime.lastError) return;
          if (response) applyPageStatus(response);
        },
      );
    });
  }

  /**
   * Last-resort fallback: if the content script isn't responding (e.g. page
   * was open before extension was installed/reloaded), use chrome.scripting
   * to inject a tiny check directly.
   */
  function fallbackDetect() {
    if (field || pageStatus) return; // already have data

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (!activeTab?.id) return;

      chrome.scripting
        .executeScript({
          target: { tabId: activeTab.id },
          func: () => {
            const fields = document.querySelectorAll('input[type="password"]');
            return {
              hasPasswordField: fields.length > 0,
              url: window.location.hostname,
              count: fields.length,
            };
          },
        })
        .then((results) => {
          const result = results[0]?.result;
          if (result?.hasPasswordField) {
            setPageStatus({
              hasPasswordField: true,
              url: result.url,
              fields: [],
            });
          }
        })
        .catch(() => {});
    });
  }

  function loadStats() {
    chrome.storage.local.get("aps_site_records", (data) => {
      const records = (data.aps_site_records ?? {}) as Record<string, SiteRecord>;
      const sites = Object.values(records).sort((a, b) => b.lastSeen - a.lastSeen);
      setStats({
        vulnerableCount: sites.filter(
          (s) => (s.color === "red" || s.color === "yellow") && !s.fixed,
        ).length,
        fixedCount: sites.filter((s) => s.fixed).length,
        totalTracked: sites.length,
        sites,
      });
    });
  }

  return (
    <div className="p-4 w-[340px]" style={{ fontFamily: '"Inter", system-ui, sans-serif' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-accent/20 flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6c63ff"
              strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <h1 className="text-sm font-semibold text-white/90">AI Password Scanner</h1>
        </div>
        {stats && stats.vulnerableCount > 0 && (
          <div className="px-2 py-0.5 rounded-full bg-danger/15 text-danger text-[10px] font-bold">
            {stats.vulnerableCount} at risk
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white/5 rounded-lg p-0.5 mb-4">
        <button
          onClick={() => setTab("current")}
          className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
            tab === "current"
              ? "bg-white/10 text-white"
              : "text-white/40 hover:text-white/60"
          }`}
        >
          Page
        </button>
        <button
          onClick={() => setTab("check")}
          className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
            tab === "check"
              ? "bg-white/10 text-white"
              : "text-white/40 hover:text-white/60"
          }`}
        >
          Check
        </button>
        <button
          onClick={() => { setTab("tracker"); loadStats(); }}
          className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
            tab === "tracker"
              ? "bg-white/10 text-white"
              : "text-white/40 hover:text-white/60"
          }`}
        >
          Accounts
          {stats && stats.vulnerableCount > 0 && (
            <span className="ml-1 text-danger">({stats.vulnerableCount})</span>
          )}
        </button>
      </div>

      {/* Content */}
      {tab === "current" ? (
        field ? (
          <ActiveState field={field} />
        ) : pageStatus?.hasPasswordField ? (
          <WaitingState url={pageStatus.url ?? ""} />
        ) : (
          <IdleState />
        )
      ) : tab === "check" ? (
        <ManualCheck />
      ) : (
        stats ? <TrackerView stats={stats} /> : <p className="text-white/30 text-xs text-center py-6">Loading...</p>
      )}

      {/* Footer */}
      <div className="mt-4 pt-3 border-t border-white/5 text-center">
        <p className="text-[10px] text-white/20 leading-relaxed">
          100% local. Passwords never leave your device.
        </p>
      </div>
    </div>
  );
}

function GeneratePasswordButton() {
  const [password, setPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleGenerate = useCallback(() => {
    const pw = generateStrongPassword();
    setPassword(pw);
    navigator.clipboard.writeText(pw).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }, []);

  const handleCopyAgain = useCallback(() => {
    if (!password) return;
    navigator.clipboard.writeText(password).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }, [password]);

  if (!password) {
    return (
      <button
        onClick={handleGenerate}
        className="w-full mt-3 py-2.5 px-4 rounded-lg text-xs font-semibold
                   bg-accent/10 border border-accent/20 text-accent
                   hover:bg-accent/20 transition-colors flex items-center justify-center gap-2"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0110 0v4" />
        </svg>
        Generate Strong Password
      </button>
    );
  }

  return (
    <div className="mt-3">
      <div className="bg-surface rounded-lg border border-white/5 p-3 mb-2">
        <p className="text-[10px] text-white/30 uppercase tracking-widest mb-1.5">
          {copied ? "Copied to clipboard!" : "Generated password"}
        </p>
        <p className="text-xs font-mono text-safe break-all select-all leading-relaxed">
          {password}
        </p>
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleCopyAgain}
          className="flex-1 py-2 px-3 rounded-lg text-[11px] font-medium
                     bg-accent/10 border border-accent/20 text-accent
                     hover:bg-accent/20 transition-colors"
        >
          {copied ? "Copied!" : "Copy Again"}
        </button>
        <button
          onClick={handleGenerate}
          className="flex-1 py-2 px-3 rounded-lg text-[11px] font-medium
                     bg-white/5 border border-white/10 text-white/60
                     hover:bg-white/10 transition-colors"
        >
          Regenerate
        </button>
      </div>
    </div>
  );
}

function IdleState() {
  return (
    <div className="text-center py-4">
      <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-3">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#555"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0110 0v4" />
        </svg>
      </div>
      <p className="text-white/40 text-sm mb-1">No password field detected</p>
      <p className="text-white/25 text-xs">Navigate to a login page to start scanning.</p>
      <GeneratePasswordButton />
    </div>
  );
}

function WaitingState({ url }: { url: string }) {
  return (
    <div className="text-center py-4">
      <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-3">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6c63ff"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </div>
      <p className="text-white/60 text-sm mb-1">Password field found</p>
      <p className="text-white/30 text-xs font-mono mb-2">{url}</p>
      <p className="text-white/25 text-xs">Type a password to see its AI crack time.</p>
      <GeneratePasswordButton />
    </div>
  );
}

function ActiveState({ field }: { field: FieldData }) {
  const hex = colorToHex(field.color);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-white/50 text-xs font-mono truncate max-w-[180px]">{field.url}</span>
        <div className="px-2 py-0.5 rounded text-xs font-bold font-mono border"
          style={{ color: hex, borderColor: `${hex}40`, backgroundColor: `${hex}10` }}>
          {field.grade}
        </div>
      </div>

      <div className="text-center mb-3">
        <p className="text-[10px] text-white/40 uppercase tracking-widest mb-1">AI Crack Time</p>
        <p className="text-3xl font-mono font-bold" style={{ color: hex }}>{field.crackTime}</p>
      </div>

      <div className="mb-3">
        <div className="flex justify-between text-[10px] text-white/30 mb-1">
          <span>Vulnerable</span><span>AI-Resistant</span>
        </div>
        <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500"
            style={{ width: `${field.score}%`, background: `linear-gradient(90deg, #ff3b3b, ${hex})` }} />
        </div>
      </div>

      {field.threats.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] text-white/30 uppercase tracking-widest mb-2">Threats</p>
          <div className="space-y-1.5">
            {field.threats.sort((a, b) => b.score - a.score).slice(0, 3).map((t) => (
              <div key={t.name} className="flex items-center gap-2 text-xs">
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: sevHex(t.severity) }} />
                <span className="text-white/60">{t.label}</span>
                <span className="text-white/25 ml-auto">{t.severity}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {field.suggestion && (
        <div className="bg-accent/5 border border-accent/10 rounded-lg p-3">
          <p className="text-xs text-white/60 leading-relaxed">{field.suggestion}</p>
        </div>
      )}

      <GeneratePasswordButton />
    </div>
  );
}

function ManualCheck() {
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);

  const handleChange = useCallback((value: string) => {
    setPassword(value);
    setResult(value.length > 0 ? scan(value) : null);
  }, []);

  const hex = result?.hexColor ?? "#666";

  return (
    <div>
      {/* Input */}
      <div className="relative mb-3">
        <input
          type={visible ? "text" : "password"}
          value={password}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Type or paste a password..."
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className="w-full bg-surface rounded-lg border border-white/10 px-3 py-2.5 pr-16
                     font-mono text-sm text-white placeholder:text-white/25
                     focus:outline-none focus:border-accent/40 transition-colors"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          <button
            onClick={() => setVisible(!visible)}
            className="p-1.5 rounded text-white/30 hover:text-white/60 transition-colors"
          >
            {visible ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
          {password && (
            <button
              onClick={() => handleChange("")}
              className="p-1.5 rounded text-white/30 hover:text-white/60 transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Results */}
      {result ? (
        <div>
          {/* Grade + Crack Time */}
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-12 h-12 rounded-lg flex items-center justify-center text-lg font-bold border-2 shrink-0"
              style={{ color: hex, borderColor: hex, backgroundColor: `${hex}15` }}
            >
              {result.grade}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-white/40 uppercase tracking-widest">AI Crack Time</p>
              <p className="text-xl font-mono font-bold" style={{ color: hex }}>
                {result.crackTime}
              </p>
            </div>
          </div>

          {/* Score bar */}
          <div className="mb-3">
            <div className="flex justify-between text-[10px] text-white/30 mb-1">
              <span>Vulnerable</span><span>AI-Resistant</span>
            </div>
            <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500"
                style={{ width: `${result.overallScore}%`, background: `linear-gradient(90deg, #ff3b3b, ${hex})` }} />
            </div>
          </div>

          {/* Threats */}
          {result.threats.length > 0 && (
            <div className="mb-3">
              <p className="text-[10px] text-white/30 uppercase tracking-widest mb-2">Threats</p>
              <div className="space-y-1.5">
                {result.threats.sort((a, b) => b.score - a.score).slice(0, 4).map((t) => (
                  <div key={t.name} className="flex items-center gap-2 text-xs">
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: sevHex(t.severity) }} />
                    <span className="text-white/60">{t.label}</span>
                    <span className="text-white/20 text-[10px] ml-auto">{t.detail}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Suggestion */}
          {result.suggestion && (
            <div className="bg-accent/5 border border-accent/10 rounded-lg p-3 mb-1">
              <p className="text-xs text-white/60 leading-relaxed">{result.suggestion}</p>
            </div>
          )}

          <GeneratePasswordButton />
        </div>
      ) : (
        <div className="text-center py-4">
          <p className="text-white/25 text-xs">Enter a password to check its AI resistance.</p>
          <p className="text-white/15 text-[10px] mt-1">100% local — nothing leaves your browser.</p>
        </div>
      )}
    </div>
  );
}

function TrackerView({ stats: initialStats }: { stats: TrackerStats }) {
  const [stats, setStats] = useState(initialStats);

  // Keep in sync with props
  useEffect(() => { setStats(initialStats); }, [initialStats]);

  function removeSite(hostname: string) {
    chrome.storage.local.get("aps_site_records", (data) => {
      const records = (data.aps_site_records ?? {}) as Record<string, SiteRecord>;
      delete records[hostname];
      chrome.storage.local.set({ aps_site_records: records }, () => {
        const sites = Object.values(records).sort((a, b) => b.lastSeen - a.lastSeen);
        setStats({
          vulnerableCount: sites.filter(
            (s) => (s.color === "red" || s.color === "yellow") && !s.fixed,
          ).length,
          fixedCount: sites.filter((s) => s.fixed).length,
          totalTracked: sites.length,
          sites,
        });
      });
    });
  }

  if (stats.totalTracked === 0) {
    return (
      <div className="text-center py-6">
        <p className="text-white/40 text-sm mb-1">No accounts tracked yet</p>
        <p className="text-white/25 text-xs">Log in to websites and your password strength will be tracked here.</p>
      </div>
    );
  }

  const vulnerable = stats.sites.filter(
    (s) => (s.color === "red" || s.color === "yellow") && !s.fixed,
  );
  const safe = stats.sites.filter(
    (s) => s.color === "green" || s.fixed,
  );

  const progressPct = stats.totalTracked > 0
    ? Math.round(((stats.fixedCount + safe.length) / stats.totalTracked) * 100)
    : 0;

  return (
    <div>
      {/* Progress */}
      <div className="bg-surface-raised rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-white/50">AI Readiness</span>
          <span className="text-xs font-mono font-bold"
            style={{ color: progressPct >= 80 ? "#2bff88" : progressPct >= 50 ? "#ffaa2b" : "#ff3b3b" }}>
            {progressPct}%
          </span>
        </div>
        <div className="w-full h-2.5 bg-white/5 rounded-full overflow-hidden mb-2">
          <div className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${progressPct}%`,
              background: progressPct >= 80 ? "#2bff88" : progressPct >= 50 ? "#ffaa2b" : "#ff3b3b",
            }} />
        </div>
        <div className="flex justify-between text-[10px] text-white/30">
          <span>{stats.vulnerableCount} vulnerable</span>
          <span>{stats.fixedCount} fixed</span>
          <span>{stats.totalTracked} tracked</span>
        </div>
      </div>

      {/* Vulnerable sites */}
      {vulnerable.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] text-white/30 uppercase tracking-widest mb-2">Vulnerable</p>
          <div className="space-y-1">
            {vulnerable.map((site) => (
              <SiteRow key={site.hostname} site={site} onRemove={removeSite} />
            ))}
          </div>
        </div>
      )}

      {/* Safe sites */}
      {safe.length > 0 && (
        <div>
          <p className="text-[10px] text-white/30 uppercase tracking-widest mb-2">Secured</p>
          <div className="space-y-1">
            {safe.map((site) => (
              <SiteRow key={site.hostname} site={site} onRemove={removeSite} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SiteRow({ site, onRemove }: { site: SiteRecord; onRemove: (hostname: string) => void }) {
  const hex = colorToHex(site.fixed ? "green" : site.color);
  const url = `https://${site.hostname}`;

  function openSite(e: React.MouseEvent) {
    e.preventDefault();
    chrome.tabs.create({ url });
  }

  return (
    <div className="flex items-center gap-2 bg-white/[0.02] rounded-lg px-3 py-2 group">
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: hex }} />
      <a
        href={url}
        onClick={openSite}
        title={`Open ${site.hostname}`}
        className="text-xs truncate flex-1 transition-colors cursor-pointer"
        style={{ color: site.fixed ? "rgba(255,255,255,0.5)" : "#6c63ff" }}
        onMouseEnter={(e) => { (e.target as HTMLElement).style.textDecoration = "underline"; }}
        onMouseLeave={(e) => { (e.target as HTMLElement).style.textDecoration = "none"; }}
      >
        {site.hostname}
      </a>
      <span className="text-[10px] font-mono" style={{ color: hex }}>
        {site.fixed ? "Fixed" : site.crackTime}
      </span>
      {!site.fixed && site.loginCount > 1 && (
        <span className="text-[9px] text-white/20">{site.loginCount}x</span>
      )}
      <button
        onClick={() => onRemove(site.hostname)}
        title="Remove"
        className="p-1 rounded opacity-0 group-hover:opacity-100 text-white/20 hover:text-danger
                   hover:bg-danger/10 transition-all"
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

function colorToHex(color: string): string {
  switch (color) {
    case "green": return "#2bff88";
    case "yellow": return "#ffaa2b";
    case "red": return "#ff3b3b";
    default: return "#666";
  }
}

function sevHex(severity: string): string {
  switch (severity) {
    case "critical": return "#ff3b3b";
    case "high": return "#ff6b2b";
    case "medium": return "#ffaa2b";
    case "low": return "#88ff2b";
    case "safe": return "#2bff88";
    default: return "#666";
  }
}
