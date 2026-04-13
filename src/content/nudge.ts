import { generateStrongPassword } from "../scoring/engine";
import type { ScanResult } from "../scoring/types";
import type { SiteRecord } from "../scoring/tracker";

const NUDGE_CONTAINER_ID = "aps-nudge-container";

export function showNudge(result: ScanResult, record: SiteRecord) {
  removeExistingNudge();

  if (record.fixed || result.color === "green") return;

  switch (record.nudgeLevel) {
    case 0:
      break; // dot only, no nudge UI
    case 1:
      showBanner(result, record, false);
      break;
    case 2:
      showBanner(result, record, true);
      break;
    case 3:
      showInterstitial(result, record);
      break;
  }
}

function removeExistingNudge() {
  document.getElementById(NUDGE_CONTAINER_ID)?.remove();
}

function showBanner(result: ScanResult, record: SiteRecord, prominent: boolean) {
  const container = document.createElement("div");
  container.id = NUDGE_CONTAINER_ID;

  const height = prominent ? "auto" : "auto";
  const padding = prominent ? "16px 20px" : "12px 16px";
  const borderWidth = prominent ? "2px" : "1px";

  container.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 2147483647;
    max-width: 380px;
    background: #181824;
    border: ${borderWidth} solid ${result.hexColor}40;
    border-radius: 14px;
    padding: ${padding};
    box-shadow: 0 12px 40px rgba(0,0,0,0.6), 0 0 20px ${result.hexColor}15;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color: #e0e0e0;
    animation: aps-slide-in 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    ${height}
  `;

  const loginWord = record.loginCount === 2
    ? "2nd time"
    : record.loginCount === 3
      ? "3rd time"
      : `${record.loginCount}th time`;

  const urgencyText = prominent
    ? `You've logged in with this weak password <strong>${loginWord}</strong>. Each login is a risk.`
    : `This password can be cracked by AI in <strong style="color:${result.hexColor}">${result.crackTime}</strong>.`;

  container.innerHTML = `
    <style>
      @keyframes aps-slide-in {
        from { transform: translateY(20px) translateX(20px); opacity: 0; }
        to { transform: translateY(0) translateX(0); opacity: 1; }
      }
      #${NUDGE_CONTAINER_ID} button { cursor: pointer; border: none; outline: none; }
      #${NUDGE_CONTAINER_ID} button:hover { filter: brightness(1.15); }
    </style>

    <div style="display:flex;align-items:flex-start;gap:12px;">
      <div style="
        width:36px;height:36px;border-radius:10px;flex-shrink:0;
        display:flex;align-items:center;justify-content:center;
        background:${result.hexColor}15;border:1.5px solid ${result.hexColor}40;
      ">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${result.hexColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      </div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:600;color:#fff;margin-bottom:4px;">
          Weak password detected
        </div>
        <div style="font-size:12px;color:#999;line-height:1.5;margin-bottom:12px;">
          ${urgencyText}
        </div>
        <div style="display:flex;gap:8px;">
          <button id="aps-fix-btn" style="
            flex:1;padding:8px 14px;border-radius:8px;font-size:12px;font-weight:600;
            background:${result.hexColor};color:#000;transition:filter 0.2s;
          ">
            Fix Now
          </button>
          <button id="aps-later-btn" style="
            padding:8px 14px;border-radius:8px;font-size:12px;font-weight:500;
            background:rgba(255,255,255,0.05);color:#888;transition:filter 0.2s;
          ">
            Later
          </button>
        </div>
      </div>
      <button id="aps-close-btn" style="
        background:none;color:#555;padding:4px;margin:-4px -4px 0 0;
        font-size:16px;line-height:1;
      ">&times;</button>
    </div>
  `;

  document.body.appendChild(container);

  document.getElementById("aps-fix-btn")?.addEventListener("click", () => {
    startGuidedFix(result, record);
  });
  document.getElementById("aps-later-btn")?.addEventListener("click", () => {
    container.style.animation = "none";
    container.style.transition = "transform 0.3s, opacity 0.3s";
    container.style.transform = "translateY(20px)";
    container.style.opacity = "0";
    setTimeout(() => container.remove(), 300);
  });
  document.getElementById("aps-close-btn")?.addEventListener("click", () => {
    container.remove();
  });
}

function showInterstitial(result: ScanResult, record: SiteRecord) {
  const container = document.createElement("div");
  container.id = NUDGE_CONTAINER_ID;

  container.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0,0,0,0.75);
    backdrop-filter: blur(4px);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color: #e0e0e0;
    animation: aps-fade-in 0.3s ease;
  `;

  container.innerHTML = `
    <style>
      @keyframes aps-fade-in {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      #aps-interstitial-card button { cursor: pointer; border: none; outline: none; }
      #aps-interstitial-card button:hover { filter: brightness(1.15); }
    </style>

    <div id="aps-interstitial-card" style="
      background: #181824;
      border: 2px solid ${result.hexColor}40;
      border-radius: 20px;
      padding: 32px;
      max-width: 420px;
      width: 90%;
      text-align: center;
      box-shadow: 0 20px 60px rgba(0,0,0,0.8);
    ">
      <div style="
        width:56px;height:56px;border-radius:16px;margin:0 auto 16px;
        display:flex;align-items:center;justify-content:center;
        background:${result.hexColor}15;border:2px solid ${result.hexColor}40;
      ">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="${result.hexColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          <line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      </div>

      <h2 style="font-size:18px;font-weight:700;color:#fff;margin-bottom:8px;">
        This password is at serious risk
      </h2>
      <p style="font-size:14px;color:#999;line-height:1.6;margin-bottom:6px;">
        You've logged into <strong style="color:#fff;">${record.hostname}</strong> with this
        password <strong style="color:${result.hexColor};">${record.loginCount} times</strong>.
      </p>
      <p style="font-size:24px;font-weight:700;color:${result.hexColor};font-family:monospace;margin:12px 0;">
        AI cracks it in ${result.crackTime}
      </p>
      <p style="font-size:13px;color:#777;margin-bottom:24px;">
        Every login with a weak password is an opportunity for attackers.
        Fix it now — it takes 30 seconds.
      </p>

      <div style="display:flex;gap:10px;justify-content:center;">
        <button id="aps-fix-btn" style="
          padding:12px 28px;border-radius:10px;font-size:14px;font-weight:700;
          background:${result.hexColor};color:#000;transition:filter 0.2s;
        ">
          Fix This Password
        </button>
        <button id="aps-skip-btn" style="
          padding:12px 20px;border-radius:10px;font-size:13px;font-weight:500;
          background:rgba(255,255,255,0.05);color:#666;transition:filter 0.2s;
        ">
          I'll risk it
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(container);

  document.getElementById("aps-fix-btn")?.addEventListener("click", () => {
    startGuidedFix(result, record);
  });
  document.getElementById("aps-skip-btn")?.addEventListener("click", () => {
    container.style.transition = "opacity 0.3s";
    container.style.opacity = "0";
    setTimeout(() => container.remove(), 300);
  });
}

function startGuidedFix(_result: ScanResult, record: SiteRecord) {
  removeExistingNudge();

  const newPassword = generateStrongPassword();
  navigator.clipboard.writeText(newPassword).catch(() => {});

  // Try to find a "change password" link on the page
  const changePasswordUrl = findChangePasswordLink(record.hostname);

  const container = document.createElement("div");
  container.id = NUDGE_CONTAINER_ID;
  container.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 2147483647;
    width: 360px;
    background: #181824;
    border: 1.5px solid #6c63ff40;
    border-radius: 14px;
    padding: 16px 20px;
    box-shadow: 0 12px 40px rgba(0,0,0,0.6);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color: #e0e0e0;
    animation: aps-slide-in 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  `;

  container.innerHTML = `
    <style>
      @keyframes aps-slide-in {
        from { transform: translateY(20px) translateX(20px); opacity: 0; }
        to { transform: translateY(0) translateX(0); opacity: 1; }
      }
      .aps-step { display:flex;gap:10px;align-items:flex-start;margin:10px 0; }
      .aps-step-num {
        width:22px;height:22px;border-radius:50%;background:#6c63ff20;color:#6c63ff;
        font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;
      }
      .aps-step-text { font-size:12px;color:#aaa;line-height:1.5; }
      .aps-step-text strong { color:#fff; }
      .aps-pw-display {
        background:#0f0f17;border:1px solid #ffffff10;border-radius:8px;
        padding:10px 12px;font-family:monospace;font-size:13px;color:#2bff88;
        word-break:break-all;margin:8px 0;user-select:all;
      }
      #${NUDGE_CONTAINER_ID} button { cursor:pointer;border:none;outline:none; }
    </style>

    <div style="font-size:13px;font-weight:600;color:#fff;margin-bottom:4px;">
      Let's fix this password
    </div>
    <div style="font-size:11px;color:#666;margin-bottom:12px;">
      New password generated and copied to clipboard
    </div>

    <div class="aps-pw-display">${newPassword}</div>

    <div class="aps-step">
      <div class="aps-step-num">1</div>
      <div class="aps-step-text">
        ${changePasswordUrl
          ? `<a href="${changePasswordUrl}" target="_blank" style="color:#6c63ff;text-decoration:underline;">Open password settings</a> for <strong>${record.hostname}</strong>`
          : `Go to <strong>${record.hostname}</strong>'s password/security settings`
        }
      </div>
    </div>
    <div class="aps-step">
      <div class="aps-step-num">2</div>
      <div class="aps-step-text">Paste the new password <strong>(already in your clipboard)</strong></div>
    </div>
    <div class="aps-step">
      <div class="aps-step-num">3</div>
      <div class="aps-step-text">Save it in your password manager</div>
    </div>

    <div style="display:flex;gap:8px;margin-top:14px;">
      <button id="aps-copy-again" style="
        flex:1;padding:8px 12px;border-radius:8px;font-size:12px;font-weight:500;
        background:#6c63ff15;color:#6c63ff;border:1px solid #6c63ff30;transition:filter 0.2s;
      ">
        Copy Password Again
      </button>
      <button id="aps-done-btn" style="
        padding:8px 16px;border-radius:8px;font-size:12px;font-weight:600;
        background:#2bff88;color:#000;transition:filter 0.2s;
      ">
        Done
      </button>
    </div>
  `;

  document.body.appendChild(container);

  document.getElementById("aps-copy-again")?.addEventListener("click", () => {
    navigator.clipboard.writeText(newPassword).catch(() => {});
    const btn = document.getElementById("aps-copy-again");
    if (btn) {
      btn.textContent = "Copied!";
      setTimeout(() => { btn.textContent = "Copy Password Again"; }, 1500);
    }
  });

  document.getElementById("aps-done-btn")?.addEventListener("click", () => {
    chrome.storage.local.get("aps_site_records", (data) => {
      const records = data.aps_site_records ?? {};
      if (records[record.hostname]) {
        records[record.hostname].fixed = true;
        records[record.hostname].nudgeLevel = 0;
        chrome.storage.local.set({ aps_site_records: records });
      }
    });
    container.style.transition = "transform 0.3s, opacity 0.3s";
    container.style.transform = "translateY(20px)";
    container.style.opacity = "0";
    setTimeout(() => container.remove(), 300);
  });
}

/**
 * Attempt to find a "change password" link on the current page.
 * Checks common URL patterns used by major sites.
 */
function findChangePasswordLink(hostname: string): string | null {
  const knownPaths: Record<string, string> = {
    "accounts.google.com": "https://myaccount.google.com/signinoptions/password",
    "github.com": "https://github.com/settings/security",
    "twitter.com": "https://twitter.com/settings/password",
    "x.com": "https://x.com/settings/password",
    "facebook.com": "https://www.facebook.com/settings?tab=security",
    "amazon.com": "https://www.amazon.com/gp/css/account/info/view.html",
    "netflix.com": "https://www.netflix.com/password",
    "linkedin.com": "https://www.linkedin.com/psettings/change-password",
    "apple.com": "https://appleid.apple.com/account/manage",
    "reddit.com": "https://www.reddit.com/settings",
  };

  for (const [domain, url] of Object.entries(knownPaths)) {
    if (hostname.includes(domain)) return url;
  }

  // Try to find a settings/security link on the page
  const links = document.querySelectorAll("a");
  for (const link of links) {
    const text = link.textContent?.toLowerCase() ?? "";
    const href = link.href?.toLowerCase() ?? "";
    if (
      text.includes("change password") ||
      text.includes("security") ||
      href.includes("password") ||
      href.includes("security/settings")
    ) {
      return link.href;
    }
  }

  return null;
}
