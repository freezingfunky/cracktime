import { scan, generateStrongPassword } from "../scoring/engine";
import { recordLogin } from "../scoring/tracker";
import { showNudge } from "./nudge";
import type { ScanResult } from "../scoring/types";

const BADGE_CLASS = "aps-badge";
const TOOLTIP_CLASS = "aps-tooltip";
const PROCESSED_ATTR = "data-aps-processed";
const DEBOUNCE_MS = 150;
const TOOLTIP_HIDE_DELAY_MS = 250;

interface FieldState {
  badge: HTMLDivElement;
  tooltip: HTMLDivElement;
  result: ScanResult;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  tooltipHideTimer: ReturnType<typeof setTimeout> | null;
  tooltipPinned: boolean;
}

const fieldMap = new WeakMap<HTMLInputElement, FieldState>();

function init() {
  checkPendingLoginFromPreviousPage();
  processExistingFields();
  watchForNewFields();
  watchForFormSubmissions();
  listenForPopupMessages();
}

/**
 * On every page load, check if there's a pending login from the previous page.
 * If we navigated to a different URL → login succeeded → record it.
 * If we're on the same URL and a password field exists → login failed → discard.
 */
function checkPendingLoginFromPreviousPage() {
  chrome.storage.session.get("aps_pending_login", (data) => {
    const pending = data.aps_pending_login;
    if (!pending) return;

    // Clear it immediately so it doesn't fire again
    chrome.storage.session.remove("aps_pending_login");

    const currentUrl = window.location.href;
    const currentHostname = window.location.hostname;
    const sameUrl = pending.url === currentUrl;
    const sameHost = pending.hostname === currentHostname;

    // Wait a moment for the page to settle, then check
    setTimeout(() => {
      const hasPasswordField = document.querySelector('input[type="password"]') !== null;
      const hasError = detectLoginError();

      if (hasError) {
        // Error visible on page → login failed → discard
        return;
      }

      if (!sameHost) {
        // Navigated to a completely different site → likely a redirect after success
        confirmLogin(pending);
        return;
      }

      if (!sameUrl) {
        // Same host but different URL (e.g. /login → /dashboard) → success
        confirmLogin(pending);
        return;
      }

      // Same URL — check if password field is still present
      if (sameUrl && hasPasswordField) {
        // Still on the login page → failed login → discard
        return;
      }

      if (sameUrl && !hasPasswordField) {
        // Same URL but password field is gone → success (SPA swap)
        confirmLogin(pending);
      }
    }, 1500);
  });
}

function processExistingFields() {
  const fields = findPasswordFields(document);
  fields.forEach(attachToField);

  // Immediately notify popup that password fields exist on this page
  if (fields.length > 0) {
    broadcastPageStatus();
  }
}

/**
 * Listen for messages from the popup asking for current page status.
 */
function listenForPopupMessages() {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === "GET_PAGE_STATUS") {
      sendResponse(getPageStatus());
      return true;
    }
    if (msg.type === "PING") {
      sendResponse({ alive: true });
      return true;
    }
  });
}

function getPageStatus() {
  const allFields = document.querySelectorAll<HTMLInputElement>(
    `input[type="password"]`,
  );

  if (allFields.length === 0) {
    return { hasPasswordField: false, fields: [] };
  }

  const fieldResults = Array.from(allFields).map((field) => {
    const state = fieldMap.get(field);
    const hasValue = field.value.length > 0;
    const result = hasValue && state ? state.result : null;

    return {
      hasValue,
      grade: result?.grade ?? null,
      color: result?.color ?? null,
      crackTime: result?.crackTime ?? null,
      score: result?.overallScore ?? null,
      suggestion: result?.suggestion ?? null,
      threats: result?.threats ?? [],
    };
  });

  return {
    hasPasswordField: true,
    url: window.location.hostname,
    fields: fieldResults,
  };
}

function broadcastPageStatus() {
  const status = getPageStatus();
  chrome.storage.session.set({ pageStatus: status });
}

function watchForNewFields() {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLElement) {
          findPasswordFields(node).forEach(attachToField);
        }
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

/**
 * Detect form submissions containing a password field.
 *
 * We don't record the password immediately — we wait to verify the
 * login succeeded. A successful login is detected by:
 *   1. Page navigation (URL changes within ~5s of submit)
 *   2. The password field disappearing from the DOM
 *   3. Common success indicators (e.g., the form is gone)
 *
 * If the URL stays the same and the password field is still there
 * after 5 seconds, we assume the login failed and don't record.
 */
interface PendingLogin {
  hostname: string;
  result: ScanResult;
  url: string;
  field: HTMLInputElement;
  timestamp: number;
}

interface SerializedPendingLogin {
  hostname: string;
  result: ScanResult;
  url: string;
  timestamp: number;
}

let pendingLogin: PendingLogin | null = null;

function watchForFormSubmissions() {
  document.addEventListener("submit", (e) => captureLoginAttempt(e.target as HTMLFormElement), true);

  document.addEventListener(
    "click",
    (e) => {
      const target = e.target as HTMLElement;
      if (!isLoginButton(target)) return;
      const form = target.closest("form");
      if (form) captureLoginAttempt(form);
      else captureFromNearestField(target);
    },
    true,
  );

  // Watch for navigation — if the page URL changes after a login attempt,
  // that's a successful login
  observeLoginSuccess();
}

function captureLoginAttempt(form: HTMLFormElement) {
  const pwField = form.querySelector<HTMLInputElement>('input[type="password"]');
  if (!pwField || !pwField.value) return;

  const state = fieldMap.get(pwField);
  if (!state) return;

  pendingLogin = {
    hostname: window.location.hostname,
    result: state.result,
    url: window.location.href,
    field: pwField,
    timestamp: Date.now(),
  };
}

function captureFromNearestField(target: HTMLElement) {
  const pwField = findNearestPasswordField(target);
  if (!pwField || !pwField.value) return;

  const state = fieldMap.get(pwField);
  if (!state) return;

  pendingLogin = {
    hostname: window.location.hostname,
    result: state.result,
    url: window.location.href,
    field: pwField,
    timestamp: Date.now(),
  };
}

function observeLoginSuccess() {
  // On page unload: persist the pending login to session storage
  // so the NEXT page load can verify if the login succeeded
  window.addEventListener("beforeunload", () => {
    if (!pendingLogin) return;
    // Save without the field reference (can't serialize DOM elements)
    chrome.storage.session.set({
      aps_pending_login: {
        hostname: pendingLogin.hostname,
        result: pendingLogin.result,
        url: pendingLogin.url,
        timestamp: pendingLogin.timestamp,
      },
    });
  });

  // SPA navigation: URL changes without full page reload
  let lastUrl = window.location.href;
  setInterval(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      if (pendingLogin && Date.now() - pendingLogin.timestamp < 10000) {
        // URL changed within the same page → SPA success
        confirmLogin(pendingLogin);
        pendingLogin = null;
      }
    }
  }, 500);

  // SPA field removal: password field disappears from DOM
  const fieldObserver = new MutationObserver(() => {
    if (!pendingLogin) return;
    if (Date.now() - pendingLogin.timestamp > 10000) {
      pendingLogin = null;
      return;
    }
    if (!document.contains(pendingLogin.field)) {
      // Field gone → either navigated or SPA swapped views → check for errors
      setTimeout(() => {
        if (detectLoginError()) {
          pendingLogin = null;
        } else {
          if (pendingLogin) confirmLogin(pendingLogin);
          pendingLogin = null;
        }
      }, 500);
    }
  });
  fieldObserver.observe(document.body, { childList: true, subtree: true });
}

function confirmLogin(login: PendingLogin | SerializedPendingLogin) {
  const { hostname, result } = login;
  recordLogin(hostname, result.grade, result.color, result.crackTime).then(
    (record) => {
      if (result.color !== "green") {
        setTimeout(() => showNudge(result, record), 2000);
      }
    },
  );
}

/**
 * Check for common login error indicators on the page.
 */
function detectLoginError(): boolean {
  const errorSelectors = [
    '[role="alert"]',
    ".error",
    ".alert-danger",
    ".alert-error",
    ".login-error",
    ".error-message",
    ".form-error",
    '[data-testid="error"]',
    '[aria-invalid="true"]',
  ];

  for (const selector of errorSelectors) {
    const el = document.querySelector(selector);
    if (el && isVisible(el as HTMLElement)) return true;
  }

  // Check for error-like text that appeared after submit
  const body = document.body.innerText.toLowerCase();
  const errorPhrases = [
    "incorrect password",
    "wrong password",
    "invalid password",
    "invalid credentials",
    "login failed",
    "authentication failed",
    "try again",
    "doesn't match",
    "does not match",
  ];
  return errorPhrases.some((phrase) => body.includes(phrase));
}

function isVisible(el: HTMLElement): boolean {
  const style = window.getComputedStyle(el);
  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    style.opacity !== "0" &&
    el.offsetHeight > 0
  );
}

function isLoginButton(el: HTMLElement): boolean {
  const tag = el.tagName.toLowerCase();
  const text = (el.textContent || "").toLowerCase().trim();
  const type = el.getAttribute("type")?.toLowerCase();
  const role = el.getAttribute("role")?.toLowerCase();

  if (tag === "button" || role === "button" || type === "submit") {
    return (
      text.includes("log in") ||
      text.includes("login") ||
      text.includes("sign in") ||
      text.includes("signin") ||
      text.includes("submit") ||
      text.includes("continue")
    );
  }
  return false;
}

function findNearestPasswordField(el: HTMLElement): HTMLInputElement | null {
  const allFields = document.querySelectorAll<HTMLInputElement>(
    `input[type="password"][${PROCESSED_ATTR}]`,
  );
  return allFields.length > 0 ? allFields[allFields.length - 1]! : null;
}

// ─── Field attachment & badge/tooltip logic ───

function findPasswordFields(root: HTMLElement | Document): HTMLInputElement[] {
  const inputs = root.querySelectorAll<HTMLInputElement>(
    'input[type="password"]',
  );
  return Array.from(inputs).filter((el) => !el.hasAttribute(PROCESSED_ATTR));
}

function attachToField(field: HTMLInputElement) {
  field.setAttribute(PROCESSED_ATTR, "1");

  const badge = createBadge();
  const tooltip = createTooltip();

  positionBadge(field, badge);
  document.body.appendChild(badge);
  document.body.appendChild(tooltip);

  const state: FieldState = {
    badge,
    tooltip,
    result: scan(""),
    debounceTimer: null,
    tooltipHideTimer: null,
    tooltipPinned: false,
  };
  fieldMap.set(field, state);

  field.addEventListener("input", () => handleInput(field));
  field.addEventListener("focus", () => handleFocus(field));
  field.addEventListener("blur", () => handleBlur(field));

  const reposition = () => positionBadge(field, badge);
  window.addEventListener("scroll", reposition, { passive: true });
  window.addEventListener("resize", reposition, { passive: true });

  if (field.value) handleInput(field);

  broadcastPageStatus();
}

function handleInput(field: HTMLInputElement) {
  const state = fieldMap.get(field);
  if (!state) return;

  if (state.debounceTimer) clearTimeout(state.debounceTimer);

  state.debounceTimer = setTimeout(() => {
    const password = field.value;
    state.result = scan(password);
    updateBadge(state, password.length > 0);
    updateTooltip(state, field);

    chrome.storage.session.set({
      currentField: {
        url: window.location.hostname,
        grade: state.result.grade,
        color: state.result.color,
        crackTime: state.result.crackTime,
        score: state.result.overallScore,
        suggestion: state.result.suggestion,
        threats: state.result.threats,
        timestamp: Date.now(),
      },
    });
  }, DEBOUNCE_MS);
}

function handleFocus(field: HTMLInputElement) {
  const state = fieldMap.get(field);
  if (!state) return;
  positionBadge(field, state.badge);
  state.badge.style.opacity = "1";
}

function handleBlur(field: HTMLInputElement) {
  const state = fieldMap.get(field);
  if (!state) return;
  if (!state.tooltipPinned) {
    scheduleTooltipHide(field);
  }
}

function createBadge(): HTMLDivElement {
  const badge = document.createElement("div");
  badge.className = BADGE_CLASS;
  badge.style.cssText = `
    position: absolute;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #333;
    border: 2px solid rgba(255,255,255,0.1);
    z-index: 2147483647;
    cursor: pointer;
    transition: background 0.3s, box-shadow 0.3s, opacity 0.2s;
    opacity: 0;
    pointer-events: auto;
  `;

  badge.addEventListener("mouseenter", () => {
    const field = findFieldForBadge(badge);
    if (field) {
      const state = fieldMap.get(field);
      if (state?.tooltipHideTimer) {
        clearTimeout(state.tooltipHideTimer);
        state.tooltipHideTimer = null;
      }
      showTooltip(field);
    }
  });
  badge.addEventListener("mouseleave", () => {
    const field = findFieldForBadge(badge);
    if (field) scheduleTooltipHide(field);
  });

  return badge;
}

function createTooltip(): HTMLDivElement {
  const tooltip = document.createElement("div");
  tooltip.className = TOOLTIP_CLASS;
  tooltip.style.cssText = `
    position: absolute;
    z-index: 2147483647;
    background: #181824;
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 10px;
    padding: 14px 16px;
    min-width: 260px;
    max-width: 320px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 13px;
    color: #e0e0e0;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s;
  `;
  return tooltip;
}

function scheduleTooltipHide(field: HTMLInputElement) {
  const state = fieldMap.get(field);
  if (!state) return;
  if (state.tooltipHideTimer) clearTimeout(state.tooltipHideTimer);
  state.tooltipHideTimer = setTimeout(() => {
    if (!state.tooltipPinned) {
      state.tooltip.style.opacity = "0";
      state.tooltip.style.pointerEvents = "none";
    }
    state.tooltipHideTimer = null;
  }, TOOLTIP_HIDE_DELAY_MS);
}

function cancelTooltipHide(field: HTMLInputElement) {
  const state = fieldMap.get(field);
  if (!state) return;
  if (state.tooltipHideTimer) {
    clearTimeout(state.tooltipHideTimer);
    state.tooltipHideTimer = null;
  }
}

function positionBadge(field: HTMLInputElement, badge: HTMLDivElement) {
  const rect = field.getBoundingClientRect();
  badge.style.top = `${rect.top + window.scrollY + (rect.height - 12) / 2}px`;
  badge.style.left = `${rect.right + window.scrollX - 24}px`;
}

function updateBadge(state: FieldState, hasPassword: boolean) {
  if (!hasPassword) {
    state.badge.style.background = "#333";
    state.badge.style.boxShadow = "none";
    state.badge.style.opacity = "0";
    return;
  }
  state.badge.style.opacity = "1";
  state.badge.style.background = state.result.hexColor;
  state.badge.style.boxShadow = `0 0 8px ${state.result.hexColor}60`;
}

function showTooltip(field: HTMLInputElement) {
  const state = fieldMap.get(field);
  if (!state || !field.value) return;

  cancelTooltipHide(field);
  updateTooltip(state, field);
  state.tooltip.style.opacity = "1";
  state.tooltip.style.pointerEvents = "auto";

  // Keep tooltip alive while mouse is over it
  state.tooltip.onmouseenter = () => {
    cancelTooltipHide(field);
    state.tooltipPinned = true;
  };
  state.tooltip.onmouseleave = () => {
    state.tooltipPinned = false;
    scheduleTooltipHide(field);
  };
}

function updateTooltip(state: FieldState, field: HTMLInputElement) {
  const { result } = state;
  if (!field.value) return;

  const threatHtml = result.threats
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(
      (t) => `
      <div style="display:flex;align-items:center;gap:6px;margin:4px 0;">
        <span style="width:6px;height:6px;border-radius:50%;background:${severityHex(t.severity)};flex-shrink:0;"></span>
        <span style="color:#aaa;font-size:12px;">${t.label}</span>
      </div>`,
    )
    .join("");

  state.tooltip.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
      <div>
        <div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:1px;">AI Crack Time</div>
        <div style="font-size:20px;font-weight:700;color:${result.hexColor};font-family:monospace;">${result.crackTime}</div>
      </div>
      <div style="width:36px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center;
        font-weight:700;font-size:14px;border:2px solid ${result.hexColor};color:${result.hexColor};
        background:${result.hexColor}15;">
        ${result.grade}
      </div>
    </div>
    ${threatHtml ? `<div style="margin-bottom:10px;">${threatHtml}</div>` : ""}
    <div style="font-size:12px;color:#888;line-height:1.4;margin-bottom:10px;">${result.suggestion}</div>
    <button id="aps-generate-btn" style="
      width:100%;padding:8px;border:1px solid #6c63ff40;border-radius:6px;
      background:#6c63ff15;color:#6c63ff;font-size:12px;font-weight:600;
      cursor:pointer;transition:background 0.2s;
    ">Generate Strong Password</button>
  `;

  const btn = state.tooltip.querySelector("#aps-generate-btn");
  if (btn) {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const strong = generateStrongPassword();
      field.value = strong;
      field.dispatchEvent(new Event("input", { bubbles: true }));
      handleInput(field);
      (btn as HTMLButtonElement).textContent = "Copied to clipboard!";
      navigator.clipboard.writeText(strong).catch(() => {});
      setTimeout(() => {
        (btn as HTMLButtonElement).textContent = "Generate Strong Password";
      }, 2000);
    });
  }

  const rect = field.getBoundingClientRect();
  state.tooltip.style.top = `${rect.bottom + window.scrollY + 8}px`;
  state.tooltip.style.left = `${rect.left + window.scrollX}px`;
}

function severityHex(severity: string): string {
  switch (severity) {
    case "critical": return "#ff3b3b";
    case "high": return "#ff6b2b";
    case "medium": return "#ffaa2b";
    case "low": return "#88ff2b";
    case "safe": return "#2bff88";
    default: return "#666";
  }
}

function findFieldForBadge(badge: HTMLDivElement): HTMLInputElement | null {
  const allFields = document.querySelectorAll<HTMLInputElement>(
    `input[${PROCESSED_ATTR}]`,
  );
  for (const field of allFields) {
    const state = fieldMap.get(field);
    if (state?.badge === badge) return field;
  }
  return null;
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
