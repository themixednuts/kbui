# Rate-limit extension pair and run ingest

Type: task
Status: resolved
Blocked by: 01

## Question

What shared limiter should throttle `POST /api/extension/pair` (pairing-code hash + install id) and `POST /api/extension/runs` (user/device + parser version)?

## Answer

The shared limiter is a sliding-window bucket table on `TypingRunsAgent` (`extension_rate_bucket`). Pairing is keyed by install id (8 / 10 min) and pairing-code hash (5 / 10 min). Run ingest is keyed by user+device (40 / min) and user+parser version (80 / min). Rejected calls return HTTP 429 with `Retry-After`.
