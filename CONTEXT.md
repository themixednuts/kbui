# kbui

A browser app for editing split-keyboard layouts, practicing them, and tagging Monkeytype runs with the keyboard and layout that produced them.

## Language

**Typing run tag**:
A captured Monkeytype result plus the kbui keyboard and layout it was typed on. Stored by `TypingRunsAgent`, not by AuthAgent.
_Avoid_: upload, ingest payload, extension post

**Monkeytype result**:
A durable copy of one ApeKey-synced Monkeytype test (`_id`, timestamp, WPM, accuracy, mode). Used only to correlate typing run tags.
_Avoid_: summary, stats, personal best

**Correlation state**:
Whether a typing run tag has been matched to a Monkeytype result: `pending`, `matched`, `ambiguous`, or `unmatched`.
_Avoid_: sync status, link status

**Layer role**:
The semantic job of a keymap layer (`base`, `numpad`, `nav`, `symbols`, `adjust`, `mixed`, `unknown`), inferred from bindings and name, never from array index. A locked role is a user override that re-inference must not overwrite.
_Avoid_: layer index, layer number

**Practice session**:
One local trainer drill (Rust text, symbols, or nav) with strokes, accuracy, and optional WPM. History is the list of recent practice sessions used by adaptive drills and the coach.
_Avoid_: typing run, Monkeytype result
