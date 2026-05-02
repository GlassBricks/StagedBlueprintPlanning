---
summary: "Replace ghost-entity undo hack with Factorio 2.0 native tag-based undo/redo"
---

# Undo System Revision

## Overview

The mod's current undo system uses invisible ghost entities
(`bp100_undo-reference`) mined into the player's inventory; pressing
Ctrl+Z "builds" the ghost, the mod intercepts `on_built_entity`,
decodes an index from the entity position, and runs a handler from a
per-player circular buffer.

Limitations:

- Pollutes Factorio's native undo stack (built-ghost entries leak
  after consumption).
- No redo support.
- Only 5 actions covered (force delete, manual stage move, send/bring
  to stage, last stage change). Settings changes, wire edits,
  blueprint pastes, stage diff changes are not undoable.
- Circular buffer (100 entries) silently drops old entries.
- Requires `DelayedEvent` hack to defer registration past event
  handlers that block ghost creation.
- "Settings remnants" exist as a workaround for undo's inability to
  restore stage diffs / cross-stage wires on delete — user-visible
  complexity that should not be needed.

Goal: tag-based undo built on Factorio 2.0 `LuaPlayer.undo_redo_stack`.
Native redo, broader action coverage, elimination of settings
remnants.

Key files today: `src/project/actions/undo.ts`,
`src/project/actions/undo-records.ts`,
`src/project/actions/ProjectActions.ts`. Settings remnants touch ~13
files across `entity/`, `project/`, `ui/`, and tests.

## Design

Store all undo/redo payloads in Factorio's native action tags. No
separate per-player buffer. Mod actions piggyback on real entity ops
(or a disposable anchor when none happens), Factorio reverts the
world op, then `on_undo_applied` runs a mod handler keyed by tag.
Redo via `set_redo_tag` written from inside the undo handler.

Settings remnants go away: deletions store full `EntityExport` in
the tag, undo deserializes and re-adds.

See [[design.md]] for the tag protocol, anchor mapping, multi-entity
grouping, blueprint-paste handling, removal of settings remnants,
coverage expansion, decisions, and open questions.

## References

- `src/project/actions/undo.ts`,
  `src/project/actions/undo-records.ts`,
  `src/project/actions/ProjectActions.ts` — current ghost-based
  system.
- `src/import-export/entity.ts` — `EntityExport` format reused as
  tag payload.
- `node_modules/typed-factorio/**/*.d.ts` — `LuaPlayer.undo_redo_stack`,
  `on_undo_applied`, `on_redo_applied`, `UndoRedoAction`.
