# Capture monkeytypeResultId from Monkeytype save responses

Type: task
Status: resolved

## Question

How should the extension fill `monkeytypeResultId` / `monkeytypeTimestamp` so correlation can match directly instead of only the DOM tuple?

## Answer

A MAIN-world content script patches `fetch` and XHR on monkeytype.com, reads result ids from `/results` request and response JSON (and `?id=` URLs), and posts them to the isolated tagger. The DOM capture merges that identity into the ingest payload so idempotency can use `monkeytype-result:<id>`.
