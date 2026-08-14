# Remaining trainer and typing-run gaps

## Destination

Ship the remaining Wave 5 / trainer gaps already named in the redesign docs: Monkeytype correlation with a `monkeytype_result` table, rate limits on `/api/extension/pair` and `/runs`, Settings tagged-run list and stats, extension `monkeytypeResultId` capture, and trainer backspace / session history / layer-role lock.

## Notes

- Domain: kbui typing run tags, Monkeytype results, practice sessions, layer roles. Read `CONTEXT.md` and `docs/redesign/37-extension-design.md`.
- Execution is in this map (override of wayfinder's plan-only default). Tickets are AFK tasks, not open decisions — the user already specified the remaining work.
- Tracker is local markdown because this Cloud Agent cannot create GitHub issues.
- Skills: `/implement`, `/tdd` at public seams (`correlation`, rate-limit buckets, practice backspace, result-id capture).

## Decisions so far

- [Persist Monkeytype results and correlate typing run tags](./issues/01-monkeytype-correlation.md) — ingest and ApeKey refresh correlate tags against a `monkeytype_result` table
- [Rate-limit extension pair and run ingest](./issues/02-extension-rate-limits.md) — `TypingRunsAgent` sliding-window buckets, 429 + Retry-After
- [Surface tagged-run list and stats in Settings](./issues/03-settings-tagged-runs.md) — tagger card lists runs, keyboard/layout stats, retry matching
- [Capture monkeytypeResultId from Monkeytype save responses](./issues/04-extension-result-id.md) — MAIN-world fetch/XHR bridge fills result id
- [Trainer backspace, session history, and layer-role lock](./issues/05-trainer-backspace-history-roles.md) — rewind, session list, locked layer role

## Not yet specified

Nothing further toward this destination. Manual correction of ambiguous matches, a full analytics page, and session-cookie auto-link for the extension stay out of this effort.

## Out of scope

- Full typing-run analytics page (design §6 "later")
- Manual correction of an ambiguous Monkeytype match
- Extension session-cookie auto-link as the primary auth path
- Cloudflare Rate Limiting product binding (shared limiter lives on `TypingRunsAgent`)
