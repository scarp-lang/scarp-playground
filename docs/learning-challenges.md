# Learning challenges

Open **Learning challenges** below the editor. The catalogue includes 25 exercises
and 85 public input/output cases covering seven topics. Select a topic, difficulty
or search term; load a starter workspace, edit the code, and run its cases.
Each case runs independently through the real pinned Scarp interpreter.

Loading or resetting a challenge asks before replacing the live workspace and
preserves the opted-in saved browser copy. The new workspace is session-only
until explicitly saved. Case inputs do not replace the ordinary input buffer.
Reports are invalidated on source edits, and stopping a suite terminates its worker.

Hints and reference solutions are public, optional, and never inserted automatically.
These are practice exercises, not a secure grading system: passing public cases
does not establish correctness on unseen inputs. Neither scores nor input are
sent to a server or persisted. The catalogue and panel are loaded on demand.

## Adding exercises

Register a unique ID, topic, difficulty, goal, hints, entrypoint, file list and
public cases in `src/challenges/catalogue.json`. Provide the exact same virtual
file paths under `fixtures/<id>/starter/` and `fixtures/<id>/solution/`.
Use valid Scarp source in both; the starter should compile but fail at least one
case. Use exact stdout and stderr strings including final newlines.

The catalogue validator checks limits, duplicates, paths and fixture coverage.
Rust bridge tests execute every solution and verify the starters with the pinned
compiler. Browser tests exercise selecting, running and editing challenges.
