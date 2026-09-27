# TabiT v1.0

A local-only Chromium extension that measures **focused tab time** per website and prints a weekly audit. The UI is a late-80s / early-90s DOS / Windows 3.1 warning dialog on IBM blue.

No accounts. No cloud. No telemetry. Everything lives in `chrome.storage.local`.

## Load unpacked (Chrome / Edge / Brave)

1. Open `chrome://extensions` (or `edge://extensions` / `brave://extensions`).
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder (`TabiT`).
5. Pin **TabiT** on the toolbar. Click it to open the 360×480 popup.

The weekly report is a full tab (`report.html`). Options is a full page (right-click the icon → Options, or the OPTIONS link in the popup).

## How tracking works

The service worker does **not** wake every second.

- When a normal browser window is focused and the active tab’s domain is allowed, it stores `startedAt`.
- Time is credited as `now - startedAt` on tab switches, window focus changes, idle/lock, or a **1-minute alarm**.
- Only the **focused tab in a focused, non-minimized window** counts. Switching to another app, minimizing, locking the machine, or sitting idle (default **60s**, configurable, Chrome minimum 15s) pauses the clock.
- URLs are reduced to **hostname** (query string and fragment ignored; leading `www.` stripped). `chrome://`, extension pages, and similar internals are skipped.
- Opening the extension popup does not pause tracking.

Daily buckets use your **local calendar date**. The week is Monday–Sunday by default; change the start day on the options page.

## Permissions

| Permission | Why |
|---|---|
| `storage` | Local counters + settings |
| `tabs` | Active tab URL → hostname |
| `alarms` | One-minute flush / re-check |
| `idle` | Pause on idle and lock |

No host permissions.

## Files

```
manifest.json
background.js          service worker
popup.html / .css / .js
options.html / .css / .js
report.html / .css / .js
shared/common.js       dates, storage, formatters
shared/sound.js        optional PC-speaker beeps (off by default)
styles/crt.css
icons/                 16 / 32 / 48 / 128 PNG
fonts/VT323-Regular.ttf
```

## Data

- **Reset today** — popup confirm dialog, today’s bucket only.
- **Reset all data** — options page, wipes all day counters.
- **Export / import** — JSON (`tab-timekeeper-v1`) on the options page.
- **Weekly CSV / plain text** — buttons on the audit page.

Beeps are off until you set **PC SPEAKER BEEPS** to ON.

## Font

UI text uses [VT323](https://github.com/google/fonts/tree/main/ofl/vt323) (SIL Open Font License). See `fonts/OFL.txt`.
