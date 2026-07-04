# Visual Capture

Run the rebuilt route capture with:

```powershell
vp run capture
```

The `capture` Vite+ task installs Chromium if needed, runs `vp build`, then runs the visual
Playwright suite with `playwright.visual.config.ts`.

## Server Approach

The visual suite uses Playwright `webServer` to start `vp preview --host 127.0.0.1 --port 4173`
against the fresh production build. Playwright owns the preview process for the test run and stops
it when the suite exits. The final verification found no listeners on ports `5173`, `5174`, `4173`,
or `8787`.

## Captured Files

All files were written to `docs/redesign/screenshots/rebuild/`.

| File | Size |
| --- | ---: |
| `browse.png` | 91.2 KB |
| `connect.png` | 89.2 KB |
| `editor-keys.png` | 237.8 KB |
| `editor-lighting.png` | 226.2 KB |
| `editor-split.png` | 225.3 KB |
| `library.png` | 88.7 KB |
| `settings.png` | 90.0 KB |
| `versions.png` | 90.0 KB |

## Route Failures

None in the final capture run. All eight capture tests passed.
