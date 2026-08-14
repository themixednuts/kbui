# Persist Monkeytype results and correlate typing run tags

Type: task
Status: resolved

## Question

How should ingest and ApeKey refresh match a typing run tag to a Monkeytype result, including a durable `monkeytype_result` table?

The design already answers this (`docs/redesign/37-extension-design.md`): direct `_id` match when `monkeytypeResultId` is present; otherwise timestamp/metric tuple within ±30s; multiple hits → `ambiguous`; no rows yet → `pending`; refreshed results with no hit → `unmatched`. AuthAgent must not expose the ApeKey. This ticket is the AFK build of that answer.

## Answer

`TypingRunsAgent` now stores `monkeytype_result` rows and correlates on ingest. Direct `monkeytypeResultId` wins; otherwise WPM/accuracy/mode within ±30s (or ±5s when a real Monkeytype timestamp is present). Multiple hits stay `ambiguous`. ApeKey connect/refresh copies recent results into the agent without sharing the key. Pending and unmatched tags retry after that sync.
