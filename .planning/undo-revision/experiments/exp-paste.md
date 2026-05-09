---
summary: "G5 paste experiments: BP paste tick semantics, mod-side mid-paste append, undo_index cross-surface grouping"
date: 2026-05-02
tags: [factorio, undo, blueprint-paste, grouping]
---

# G5 paste experiments — findings

Tag-based undo redesign — group G5 (E10, E11, E12). All experiments
verify the paste + multi-entity grouping section of `design.md`.

Driver: `scripts/run-paste-exp.sh` (port 14438; deleted post-run).
Scaffolding: `src/test/experiments/paste.ts`,
`src/prototypes/entity-marker.ts` (added `bp100_undo-anchor-exp`
hidden anchor prototype, reused from G1 scaffold).

Method (all three): build a 50-entity blueprint scripted via
`LuaItemStack.set_blueprint_entities` → `LuaPlayer.cursor_stack.set_stack` →
`LuaPlayer.build_from_cursor`. Observe undo stack from inside
`on_built_entity` (via `Events.registerEarly`). Anchor entity for E11/E12
is a hidden `simple-entity-with-owner` destroyed same tick with
`{player, undo_index}`.

Verdicts summary:

| Exp | Verdict | Implication |
|---|---|---|
| E10 | **CONFIRMED** | Item populated with all 50 actions BEFORE first `on_built_entity`. Position→action-index map can be built once on first paste event. |
| E11 | **CONFIRMED** | `entity.destroy{player, undo_index:1}` from inside paste event appends to same paste item, even on different surface. Tag survives. |
| E12 | **CONFIRMED** | 5 anchors on 5 surfaces with first `undo_index:0`, rest `undo_index:1` collapse into one undo item with 5 actions. |

---

## E10 — blueprint paste tick semantics

### Question

Per design "Blueprint paste" section: are all `on_built_entity` events
on the same tick, and is the undo item populated with every action by
the time the first event fires (so `item.length` cannot serve as the
tagging index, requiring a position→index map)?

### Setup

- Editor mode, blueprint of 50 `small-electric-pole` (10×5 grid, 2-tile
  spacing) constructed via `set_blueprint_entities`.
- `build_from_cursor` at offset `(50, 50)`.
- Per `on_built_entity`: log `event.tick`, `idx`,
  `playerStack.get_undo_item_count()`, `top.length`.
- Pre/post: dump full undo top item.

### Evidence

```
[exp:E10] run begin tick=2601
[exp:E10-pre] stack undo_count=0
[exp:E10] on_built_entity tick=2601 idx=1  ... action_count=50 undo_count=1
[exp:E10] on_built_entity tick=2601 idx=2  ... action_count=50 undo_count=1
... (all 50 events logged)
[exp:E10] on_built_entity tick=2601 idx=50 ... action_count=50 undo_count=1
[exp:E10] run end tick=2601 events=50
[exp:E10-post] stack undo_count=1
[exp:E10-post] top length=50
[exp:E10-post] action[1..50] type=built-entity name=small-electric-pole pos=(...) surface=1 tags={}
```

### Verdict — CONFIRMED

- All 50 `on_built_entity` events fire same tick (2601).
- Undo item is fully populated (length=50) BEFORE the first
  `on_built_entity` handler runs. `action_count` stays constant at 50
  across all events.
- Action target positions match the blueprint entity positions in
  blueprint order (row-major, no apparent reordering).

### Implication for design

- "Position→action-index map built once on first paste event" approach
  in design.md is correct. Map size is known up-front; can be built
  via single pass over `item[i].target.position`.
- Cannot use `item.length` as a tagging index — would always point at
  the last action regardless of which entity is currently being
  processed.
- Trigger to clear the map: `on_tick` after the paste tick, or on next
  `on_pre_build`.

---

## E11 — mod-side append during paste

### Question

If a mod handler reacts to a paste-event `on_built_entity` by destroying
a disposable anchor with `{player, undo_index: 1}`, does the resulting
`removed-entity` action append to the same paste undo item? What about
when the anchor is on a DIFFERENT surface than the paste target?

### Setup

- Same paste flow as E10 (50 poles, scripted blueprint, paste at
  `(100, 50)` on `nauvis` / surface 1).
- Inside `on_built_entity` handler, on the 5th event, create + destroy
  a `bp100_undo-anchor-exp` on surface `exp-surf-2` (surface index 2) with
  `{player, raise_destroy: false, undo_index: 1}`.
- Tag the new action via `set_undo_tag(1, action_idx, "bp100:exp", "E11-anchor")`.
- Dump the full item before and after.

### Evidence

```
[exp:E11] on_built_entity tick=2807 idx=1..5  ... action_count=50
[exp:E11] mid-paste anchor: appending on surface=2 (event surface=1)
[exp:E11] pre-anchor top length=50 undo_count=1
[exp:E11] post-anchor top length=51 undo_count=1
[exp:E11] post-anchor last action: type=removed-entity name=bp100_undo-anchor-exp pos=(0,0) surface=2 tags={}
[exp:E11] tagged action 51
[exp:E11] on_built_entity tick=2807 idx=6..50 ... action_count=51
[exp:E11-post] top length=51
[exp:E11-post] action[1..50]  type=built-entity ... surface=1 tags={}
[exp:E11-post] action[51] type=removed-entity name=bp100_undo-anchor-exp pos=(0,0) surface=2 tags=do local _={["bp100:exp"]="E11-anchor"};return _;end
```

### Verdict — CONFIRMED

- `undo_index: 1` from inside paste event appends to the existing paste
  item: top length grew from 50 → 51, undo_count stayed at 1.
- Cross-surface grouping works: paste actions are on surface 1, anchor
  action on surface 2 — single grouped item.
- Tag set via `set_undo_tag` survives — visible in post-dump as
  `["bp100:exp"]="E11-anchor"`.
- Subsequent `on_built_entity` events see the bumped count
  (`action_count=51`), confirming the appended action is observable
  mid-flow.

### Implication for design

- Design's "mod-side overrides during paste append with `undo_index: 1`"
  is correct without surface caveat. The anchor surface need not match
  the paste surface.
- Position→index map for paste need not include the appended anchor —
  the anchor's index is known immediately as `item.length` after the
  destroy call.
- The position→index map must NOT be invalidated by mid-paste appends
  (entries 1..50 keep their indices; the new entry slots in at 51).

---

## E12 — `undo_index: 1` cross-surface grouping at scale

### Question

Multi-stage send-to-stage tags one anchor per stage's surface for the
same project entity. Does Factorio group N anchors across N surfaces
into a single undo item when the first uses `undo_index: 0` and the
rest use `undo_index: 1`?

### Setup

- 5 surfaces: `nauvis` (1), `exp-surf-2..5` (indices 2..5).
- 5 anchor create+destroy operations, one per surface, all at
  position `(10, 10)`. First with `undo_index: 0`, rest with
  `undo_index: 1`.
- Log undo_count + top length after each step. Dump final item.

### Evidence

```
[exp:E12] step=1 surface=1 (nauvis)      undo_index=0 undo_count=1 top_len=1
[exp:E12] step=2 surface=2 (exp-surf-2)  undo_index=1 undo_count=1 top_len=2
[exp:E12] step=3 surface=3 (exp-surf-3)  undo_index=1 undo_count=1 top_len=3
[exp:E12] step=4 surface=4 (exp-surf-4)  undo_index=1 undo_count=1 top_len=4
[exp:E12] step=5 surface=5 (exp-surf-5)  undo_index=1 undo_count=1 top_len=5
[exp:E12-post] stack undo_count=1
[exp:E12-post] top length=5
[exp:E12-post] action[1] type=removed-entity name=bp100_undo-anchor-exp pos=(10,10) surface=1 tags={}
[exp:E12-post] action[2] ... surface=2 tags={}
[exp:E12-post] action[3] ... surface=3 tags={}
[exp:E12-post] action[4] ... surface=4 tags={}
[exp:E12-post] action[5] ... surface=5 tags={}
```

### Verdict — CONFIRMED

- Single undo item containing 5 actions, one per surface (1..5).
- `undo_count` never grew beyond 1 — proves grouping (vs. opening new
  items per surface).
- Each action retains its `surface_index` distinctly; positions
  identical across actions don't collide.

### Implication for design

- "Multi-entity grouping" section of design.md (first uses
  `undo_index: 0`, rest `undo_index: 1`) works for cross-surface
  multi-stage operations like send-to-stage / bring-to-stage.
- Per-action tags are independent — each can carry its own stage
  payload (`{ oldStage: fromStage }` per design row #3).
- `on_undo_applied` will iterate `e.actions` regardless of grouping;
  each handler runs per action.

---

## Combined implications

1. Design's "Blueprint paste" section is correct as written:
   position→index map built lazily on first paste event of the tick.
2. Mod-side appends during paste join the same item via `undo_index: 1`;
   surface mismatch (mod runs from current stage; paste lands on stage
   surface) does NOT split the item. Stable across this experiment's
   Factorio version (2.0.x).
3. Cross-surface grouping at scale (5+ surfaces) works the same way as
   same-surface grouping. Send-to-stage / bring-to-stage can use this
   directly.
4. Tags persist across `set_undo_tag` calls within the same tick on
   actions just appended — no need to wait for tick end.

## Open / not-tested

- **Mid-flow undo behavior of grouped paste items.** This experiment
  did not Ctrl+Z. Whether the appended anchor's undo handler fires
  before/after the 50 paste reverts is left to G1 (foundations) /
  follow-up tests.
- **Live player-driven shift+lclick paste.** This experiment used
  scripted `build_from_cursor` for reproducibility. Live player paste
  is presumed identical (same `on_built_entity` flow) but not directly
  verified here.
- **Blueprints with `entity-ghost` ghosts (vs. real entities).** Design
  notes paste produces ghosts ("paste creates ghosts without
  construction bots"). Test used real entities (no ghosts) since
  pasting on solid ground in editor produces real entities directly.
  The undo action type remains `built-entity` either way; tick semantics
  expected identical.
