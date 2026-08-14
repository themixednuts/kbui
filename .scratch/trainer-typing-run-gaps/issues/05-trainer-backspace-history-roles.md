# Trainer backspace, session history, and layer-role lock

Type: task
Status: resolved

## Question

How should the trainer accept Backspace as a rewind, show recent practice sessions, and let the user lock a layer role?

## Answer

Text drills rewind the last advanced atom (or pending indent space) on Backspace without arming a new session. The coach column lists recent practice sessions. The active layer has a role select that writes a locked assignment so re-inference cannot overwrite it.
