# CrackTime

**See how fast AI can crack your passwords — right in your browser.**

CrackTime is a Chrome extension that passively monitors every password field you use and shows you exactly how long an AI-powered attacker would take to crack it. Green means safe. Red means change it now.

No servers. No accounts. Your passwords never leave your browser.

## How it works

1. **Install the extension** and forget about it
2. **Type any password** — a colored dot appears inside the field
   - Green = AI-resistant
   - Yellow = moderate risk
   - Red = change it immediately
3. **Hover the dot** to see the full breakdown: crack time, threats, and a suggestion
4. **Click "Generate Strong Password"** to replace a weak one instantly (copied to clipboard)
5. **After login**, if your password is weak, CrackTime nudges you to fix it — gently at first, more urgently over time

## Scoring

Crack times are based on **real 2026 Hashcat benchmarks**, not made-up numbers:

| Attacker | Hardware | Speed (MD5) |
|----------|----------|-------------|
| Hobbyist | 1x RTX 5090 | 220 GH/s |
| Serious | 8x RTX 5090 cluster | 1.76 TH/s |
| State-tier | 100x GPU equivalent | 22 TH/s |

The default display uses the 8-GPU cluster scenario. Passwords are analyzed using:

- **[zxcvbn-ts](https://github.com/zxcvbn-ts/zxcvbn)** — smart pattern detection (dictionary words, keyboard walks, dates, l33t speak, repeats)
- **Shannon entropy** — raw randomness measurement
- **Threat classification** — each weakness is identified and scored independently

## The nudge system

CrackTime doesn't just tell you a password is weak — it pushes you to fix it, with escalating urgency:

| Login # | What happens |
|---------|-------------|
| 1st | Colored dot only (passive awareness) |
| 2nd | Slide-in banner: "AI cracks this in 4s. Fix it?" |
| 3rd-4th | Prominent banner with login count |
| 5th+ | Full-page interstitial you have to dismiss |

When you click "Fix Now", CrackTime:
- Generates a strong 20-character password
- Copies it to your clipboard
- Links you to the site's change-password page (knows direct URLs for Google, GitHub, Netflix, LinkedIn, Amazon, and more)
- Walks you through a 3-step replacement flow

## Features

- **Passive scanning** — scores every password field on every page, in real-time
- **Manual check** — open the popup, go to the Check tab, paste any password
- **Account tracker** — tracks which sites you've logged into with weak passwords
- **AI Readiness score** — see what percentage of your accounts are AI-resistant
- **Password generator** — cryptographically unique 20-character passwords, always available
- **Smart login detection** — only records successful logins (failed attempts are discarded)
- **Known change-password URLs** — direct links to security settings for major sites

## Privacy

CrackTime is 100% client-side. Here's exactly what happens with your data:

| Data | Where it goes |
|------|---------------|
| Your passwords | Scored locally in JavaScript. Never stored. Never transmitted. |
| Site records | Stored in `chrome.storage.local` on your machine. Never synced. |
| Breach check | Not included in v0.1. No network calls to HIBP or any other service. |
| Extension permissions | `activeTab`, `storage`, `scripting`, `tabs` — no `<all_urls>` host permission |

## Install (development)

```bash
# Clone
git clone https://github.com/freezingfunky/cracktime.git
cd cracktime/projects/ai-password-scanner

# Install dependencies
npm install

# Build
npm run build

# Load in Chrome
# 1. Go to chrome://extensions
# 2. Enable "Developer mode"
# 3. Click "Load unpacked"
# 4. Select the dist/ folder
```

To rebuild after changes:

```bash
npm run build
```

Then click the reload button on the extension card at `chrome://extensions`.

## Project structure

```
src/
├── scoring/
│   ├── engine.ts        # Core scoring: zxcvbn + entropy + AI crack time + password generator
│   ├── tracker.ts       # Persistent site record storage + escalation logic
│   ├── format.ts        # Duration formatting
│   └── types.ts         # Shared type definitions
├── content/
│   ├── index.ts         # Content script: field detection, badge, tooltip, login monitoring
│   └── nudge.ts         # Nudge UI: banners, interstitial, guided fix flow
├── popup/
│   ├── Popup.tsx        # Extension popup: Page / Check / Accounts tabs
│   ├── main.tsx         # React entry
│   ├── index.html       # Popup HTML shell
│   └── index.css        # Tailwind entry
├── background/
│   └── index.ts         # Service worker: badge updates, tab change handling
└── assets/              # (empty, icons in public/)
```

## Tech stack

- **TypeScript** + **React 19** for the popup UI
- **Tailwind CSS** for styling
- **Vite** for builds (three-target: popup, content script IIFE, background ES module)
- **zxcvbn-ts** for password pattern analysis
- **Chrome Extension Manifest V3**

## License

MIT
