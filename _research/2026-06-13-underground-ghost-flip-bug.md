---
summary: "Two bugs flipping an underground belt paired with an entity-ghost underground belt; root cause + fix"
date: 2026-06-13
tags: [underground-belt, ghost, rotate, bugfix]
---

# Flipping undergrounds paired with ghosts

## Scenario

A real (mod-tracked) underground belt and an `entity-ghost` underground belt can pair with each
other in the world (e.g. real output + ghost input one tile apart). The mod tracks the real one;
ghosts are excluded from tracking (`excludedTypes` in `ProjectEntity.ts:658`, used by
`isWorldEntityProjectEntity`). Rotating either member of a pair flips both in the world, but the
engine raises the rotate event only for the entity the player directly acted on.

Both bugs are on the rotate (R-key / `LuaEntity.rotate`) path; preexisting, surfaced while auditing
2.1 underground flipping.

## Bug 1: flipping the ghost does not update the real pair

- Player rotates the ghost. Engine flips both ghost and the real pair in the world; `on_player_rotated_entity`
  fires for the ghost only.
- `entity-events.ts:62` -> `shared-state.ts luaEntityRotated`: ghost is neither a world-project entity
  nor a preview, so the handler bailed. The real pair was flipped in the world but its `ProjectEntity`
  was never re-synced -> stale data (world says input/west, data says output/east).

Normally rotating a *real* underground re-syncs its pair via `handleRotate`/`doUndergroundBeltUpdate`;
that path is never reached when the directly-rotated entity is the (ignored) ghost.

### Fix
`shared-state.ts luaEntityRotated`: when the rotated entity is an underground-belt ghost, look up its
world `underground_belt_neighbour`; if that neighbour is mod-tracked, route it through
`onEntityRotated` (re-syncs the real pair from its now-flipped world state). Underground
`findCompatibleWithLuaEntity` matches by position + preserved underground-direction, so the passed
`previousDirection` is irrelevant.

## Bug 2: flipping the real underground revives the ghost

- Player rotates the real underground. `onEntityRotated` -> `handleRotate` correctly updates the real
  entity, then for undergrounds resolves the world pair via
  `getCompatibleAtCurrentStageOrAdd(worldPair, ...)` to refresh its highlight.
- `worldPair` is the ghost. `getCompatibleAtCurrentStageOrAdd` finds no match (ghost type is
  `entity-ghost`) and falls through to `tryAddNewEntity` -> `addNewEntity`. `saveEntity(ghost)` reads
  the ghost's inner blueprint entity, so a new `underground-belt` `ProjectEntity` is created at the
  ghost's position and built as a real entity in other stages -> the player's ghost is adopted/revived.

`handleRotate` is the only place a ghost LuaEntity reaches `getCompatibleAtCurrentStageOrAdd` (it comes
from `underground_belt_neighbour`, not from an event already filtered by `isWorldEntityProjectEntity`).

### Fix
`ProjectActions.ts handleRotate`: skip the pair-refresh when `worldPair.type == "entity-ghost"`. This
also makes the Bug 1 fix safe (re-syncing the real pair re-enters `handleRotate`, whose own pair
lookup would otherwise re-trigger the adoption).

## Tests

`src/test/integration/underground-belt.test.ts` -> `describe("flipping an underground paired with a
ghost")`: builds a real output ug + a ghost input ug, asserts both-way world pairing, then one test
per bug. Both failed before the fix, pass after. Full suite green (1344 passed / 3 skipped).
