---
name: verify
description: Runtime verification recipe for the kbgui browser app and Wrangler APIs
---

# kbgui runtime verification

1. Stop any existing kbgui Vite/Wrangler Node processes before rebuilding; Windows locks `.svelte-kit/wrangler-dev` and `.svelte-kit/cloudflare`.
2. Start the real Worker surface with `vp run dev:worker`. Wait for `http://127.0.0.1:8787/` to return a response.
3. Drive the browser with Playwright (`playwright` is installed):
   - `/editor`: click a `.board-keycap`; confirm `aside[aria-label="Key inspector"]`, 61 keycaps, and `crossOriginIsolated === true`.
   - `/connect`: follow the **Continue without a device** link and confirm navigation to `/editor`.
   - `/settings?section=keyboard`: save QMK keyboard/layout values, inspect `navigator.storage.getDirectory()/kbui.sqlite3`, reload, and confirm values persist.
   - `/versions`: confirm the appbar heading and `Change delivery summary`; capture a full-page screenshot.
   - Record browser `console` warnings/errors and `pageerror`; fail on Effect/Fiber/local-store/unhandled failures.
4. Probe Worker APIs with real HTTP requests:
   - anonymous `GET /api/extension/session` → 200
   - anonymous `GET /api/extension/keyboards` → 401
   - malformed JSON-shape `POST /api/extension/pair` → 400
   - `OPTIONS /api/extension/pair` → 204
   - `GET /api/auth/get-session` must complete promptly (local anonymous response is 200 `null`).
5. Stop the Wrangler server, then run `vp build` so Cloudflare adapter output is verified without Windows file locks.
