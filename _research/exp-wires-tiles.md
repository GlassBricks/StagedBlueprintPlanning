---
summary: "Wire add/remove and tile build/mine undo behavior (E7, E9)"
date: 2026-05-02
tags: [factorio, undo, experiments, wires, tiles]
---

# Wires & tiles — undo behavior (E7, E9)

| Exp | Question                                                                                                                  | Verdict                                                                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E7  | Player-driven wire drag produces a tagged `wire-added` undo entry; tag round-trips through Ctrl+Z / Ctrl+Y                | PASS — `LuaPlayer.drag_wire` is the scriptable equivalent. Scripted `LuaWireConnector.connect_to/disconnect_from` (even with `wire_origin.player`) does NOT push to the stack.            |
| E9  | Tile build via player + via `set_tiles` produces a tagged `built-tile` undo entry; tag round-trips                        | PASS — both paths register `built-tile`. `set_tiles` does NOT raise `on_player_built_tile`. Player `build_from_cursor` with a tile in cursor DOES raise `on_player_built_tile`.            |
| —   | Mid-flow event ordering during Ctrl+Z (and Ctrl+Y) for tiles                                                              | NEW INSIGHT — see [Mid-flow detection caveat](#mid-flow-detection-caveat). Action moves to a **detached/in-flight** state during mid-flow events; both `undo[1]` and `redo[1]` show empty. |

Findings path: `_research/exp-wires-tiles.md`. No NEEDS-USER. All
probes scriptable end-to-end via `kwin-mcp-cli` + UDP.

Test setup lives in `src/test/experiments/wires-tiles.ts` (deleted
post-run); driver was `scripts/run-wires-tiles-exp.sh` (also deleted).
Raw evidence in commit-time `factorio-test-data-dir/factorio-current.log`;
key excerpts inlined below.

---

## E7 — wire add/remove

### Question

For the design's row #9 (wire add/remove): does the natural anchor
strategy on `wire-added` / `wire-removed` actions work? Specifically:

1. Does player-driven wire drag produce a `wire-added` action that
   accepts tags?
2. Does the tag survive Ctrl+Z and surface in `on_undo_applied`?
3. What mid-flow events fire during Ctrl+Z and in what order?

### Setup

Two `arithmetic-combinator` entities at `(0,0)` and `(4,0)`. Two
wire-creation paths exercised:

- **Path A — scripted API:** `LuaWireConnector.connect_to(target,
false, defines.wire_origin.player)` and `disconnect_from(...,
wire_origin.player)`.
- **Path B — player-driven via `LuaPlayer.drag_wire`:** put `red-wire`
  in the cursor, set selected entity to combA via
  `update_selected_entity`, call `drag_wire{position=combA.position}`
  to start, switch selected to combB, call `drag_wire{position=
combB.position}` to end. This is the scriptable equivalent of the
  player's two-click wire drag (cursor item determines color; selected
  entity at each call determines endpoint).

`Ctrl+Z` and `Ctrl+Y` driven via `kwin-mcp-cli keyboard_key key=ctrl+z`
/ `ctrl+y` after focusing the world.

### Verdict — Path A (scripted `connect_to` / `disconnect_from`)

**Does NOT push an undo entry**, even with `wire_origin.player`.
Returns `true`, world wire is created, but `undo_redo_stack` stays
empty. Symmetric for `disconnect_from`.

```
[exp:wt] E7 connect_to result=true
[exp:wt] post connect undo_count=0 redo_count=0
[exp:wt] post tag undo_count=0 redo_count=0   # nothing to tag
```

Implication: the mod cannot rely on script-driven wire APIs to
trigger natural-anchor tagging. Real player wire drags use a different
internal codepath (see Path B).

### Verdict — Path B (`LuaPlayer.drag_wire`)

**PASS**. Two `drag_wire` calls (start at endpoint A, end at endpoint
B) produce one undo item with one `wire-added` action. Tag set via
`set_undo_tag` survives the action through Ctrl+Z and re-appears on
the redo side.

Forward op:

```
[exp:wt] E7 drag_wire: cursor=red-wire
[exp:wt] E7 selected before start=arithmetic-combinator
[exp:wt] E7 drag_wire start ok=table   # ok is truthy table value
[exp:wt] post drag_wire start undo_count=0 redo_count=0   # not committed yet

[exp:wt] E7 selected before end=arithmetic-combinator
[exp:wt] E7 drag_wire end ok=table
[exp:wt] post drag_wire end undo_count=1 redo_count=0
[exp:wt] post drag_wire end undo[1].length=1 types=[wire-added]
[exp:wt] post drag_wire end undo[1][1] = {
  a = {connector=1, entity={name="arithmetic-combinator", position={0.5,0}}, surface_index=1},
  b = {connector=1, entity={name="arithmetic-combinator", position={4.5,0}}, surface_index=1},
  type = "wire-added"
}

[exp:wt] E7 drag set_undo_tag on wire-added action[1]
[exp:wt] post drag tag undo[1][1].tags = {
  ["bp100:data"]={kind="red"}, ["bp100:handler"]="e7-drag-wire-add"
}
```

Ctrl+Z:

```
[exp:wt] EVENT on_undo_applied tick=2899
[exp:wt]   data.actions = {{type="wire-added", a=..., b=..., tags={
    ["bp100:data"]={kind="red"}, ["bp100:handler"]="e7-drag-wire-add"}}}
[exp:wt]   in on_undo_applied undo_count=0 redo_count=1
[exp:wt]   in on_undo_applied redo[1].length=1 types=[wire-removed]
[exp:wt]   in on_undo_applied redo[1][1] = {a=..., b=..., type="wire-removed"}  # tags absent
```

No mid-flow events fire for wire undo. `on_undo_applied` is the only
hook needed.

Ctrl+Y:

```
[exp:wt] EVENT on_redo_applied tick=3055
[exp:wt]   data.actions = {{type="wire-removed", a=..., b=...}}  # no tags
[exp:wt]   in on_redo_applied undo_count=1 redo_count=0
[exp:wt]   in on_redo_applied undo[1].length=1 types=[wire-added]
[exp:wt]   in on_redo_applied undo[1][1] = {a=..., b=..., type="wire-added"}  # no tags
```

### Implications

For design row #9 (wire add/remove):

- **Natural anchor confirmed feasible.** Tag the `wire-added` /
  `wire-removed` action inside `on_player_setup_wire_drag` (the event
  that fires at end-of-drag) — or wherever the mod's existing
  `markPlayerAffectedWires` → `onWiresPossiblyUpdated` flow runs. Both
  endpoints, surface, and connector are in `action.a` / `action.b`,
  enough to compute a wire diff after the fact.
- **No mid-flow risk.** Ctrl+Z on a wire op fires only
  `on_undo_applied`; no `script_raised_*` or per-event leak. The
  matrix's "Mid-flow risk: None" for row #9 is correct.
- **Tags do not auto-transfer.** Ctrl+Z's redo entry has no tags.
  Ctrl+Y's undo entry has no tags. The mod must call `set_redo_tag`
  inside `on_undo_applied` and `set_undo_tag` inside `on_redo_applied`
  to round-trip — same pattern as E6 / E8.
- **Action type inverts on the redo side.** Forward `wire-added`
  becomes `wire-removed` on redo[1]; symmetric for `wire-removed`. The
  redo handler should still apply the *forward* effect (re-add the
  wire); type inversion is just Factorio's modeling of the
  about-to-be-redone op.
- **Scripted `connect_to/disconnect_from` is not a viable surface for
  mod-internal wire mutations expected to be undone.** Mod's own
  programmatic wire changes (e.g. wire restoration during entity
  recreate on undo) won't push to stack; they don't *need* to,
  because they happen inside `on_undo_applied` flows where the parent
  action is already the anchor.

### Caveats

- `drag_wire` is the scriptable proxy for player-driven wire drag.
  Real player input goes through the same `wire-added` action shape
  (Factorio docs: wire-added action is issued by *any* wire-drag
  finalisation). High confidence representative.
- Only red wire tested. Green wire and circuit-network wire-removed
  (Shift+LClick) not exercised but expected symmetric.
- Wire across more than two entities (chain) not exercised. The
  `wire-added` action is per-pair, so each pair gets its own action;
  multi-pair drag should produce multiple actions in one item. Not
  load-bearing for the design row.

---

## E9 — tile build/mine

### Question

For the design's rows #14 / #15 (tile build/mine at stage):

1. Does player-driven tile build produce a tagged `built-tile` undo
   entry?
2. Same for `surface.set_tiles(player, undo_index=0)`?
3. What mid-flow events fire during Ctrl+Z / Ctrl+Y for tiles?
4. Tag round-trip across Ctrl+Z / Ctrl+Y.

### Setup

A 5×5 grass-1 patch around `(12, 12)` as base. Two paths:

- **Path A — `surface.set_tiles`:** single tile at `(12,12)` to
  `concrete` with `{ player, undo_index=0 }`.
- **Path B — `LuaPlayer.build_from_cursor`:** put `concrete` (item) in
  cursor, call `build_from_cursor{position={13,13}}`. Concrete is a
  2×2 tile, so this places 4 tiles in a single undo item.

### Verdict — Path A (`surface.set_tiles`)

**PASS for stack registration + tag round-trip.** Mid-flow events do
NOT include `on_player_built_tile` or `on_player_mined_tile`; they
include a `script_raised_destroy` of a transient
`deconstructible-tile-proxy` entity (irrelevant to project state).

Forward (already known from prior partial run):

```
[exp:wt] E9 set_tiles concrete done
[exp:wt] post build tile undo_count=1 redo_count=0
[exp:wt] post build tile undo[1][1] = {
  type="built-tile", new_tile="concrete", previous_tile="grass-1",
  position={12,12}, surface_index=1
}
[exp:wt] E9 set_undo_tag on built-tile action[1]
```

`set_tiles` over an existing concrete with `grass-1` produces another
`built-tile` action (NOT `removed-tile`):

```
[exp:wt] post mine tile undo[1][1] = {
  type="built-tile", new_tile="grass-1", previous_tile="concrete", ...
}
```

Ctrl+Z:

```
[exp:wt] EVENT script_raised_destroy tick=3453
[exp:wt]   data.entity = "deconstructible-tile-proxy at [12.5,12.5]"
[exp:wt]   in script_raised_destroy undo_count=0 redo_count=0   # action in-flight

[exp:wt] EVENT on_undo_applied tick=3453
[exp:wt]   data.actions = {{type="built-tile", ..., tags={
    ["bp100:data"]={oldName="grass-1", stage=1},
    ["bp100:handler"]="e9-built-tile"}}}
[exp:wt]   in on_undo_applied undo_count=0 redo_count=1
[exp:wt]   redo[1][1] = {type="removed-tile", previous_tile="concrete", ...}  # no tags
```

Ctrl+Y:

```
[exp:wt] EVENT on_built_entity tick=3610
[exp:wt]   data.entity = "tile-ghost at [12.5,12.5]"   # transient ghost
[exp:wt]   in on_built_entity undo_count=0 redo_count=0   # in-flight again

[exp:wt] EVENT on_redo_applied tick=3610
[exp:wt]   data.actions = {{type="removed-tile", ...}}  # no tags
[exp:wt]   in on_redo_applied undo_count=1 redo_count=0
[exp:wt]   undo[1][1] = {type="built-tile", ...}  # restored shape, no tags
```

### Verdict — Path B (`LuaPlayer.build_from_cursor` with tile in cursor)

**PASS**. Player-driven tile build:

- Fires `on_player_built_tile` (does NOT fire from `set_tiles`).
- Registers a `built-tile` action per affected tile in a single undo
  item. Concrete (2×2) → 4 actions per cursor click.
- Stack is already populated when `on_player_built_tile` fires (the 4
  actions are visible from `undo[1]`).

```
[exp:wt] E9 can_build_from_cursor=true
[exp:wt] EVENT on_player_built_tile tick=3809
[exp:wt]   data = { tiles=[
    {old_tile=grass-1, position={12,12}},
    {old_tile=grass-1, position={13,12}},
    {old_tile=grass-1, position={12,13}},
    {old_tile=grass-1, position={13,13}}
  ], item=concrete, tile=concrete, surface_index=1, player_index=1 }
[exp:wt]   in on_player_built_tile undo_count=1 redo_count=0
[exp:wt]   in on_player_built_tile undo[1].length=4 types=[built-tile,built-tile,built-tile,built-tile]
```

Note: on_player_built_tile shows `previous_tile="concrete"` for the
already-concrete cell `(12,12)` (which was set by Path A and was not
fully reset before Path B — see "Caveats" below). The other three
cells correctly show `previous_tile="grass-1"`. Either way, all 4
actions accept tags.

Ctrl+Z:

```
# Per tile, mid-flow:
[exp:wt] EVENT script_raised_destroy tick=3911   x4
[exp:wt]   data.entity = "deconstructible-tile-proxy at [12.5,12.5]"
[exp:wt]   data.entity = "deconstructible-tile-proxy at [13.5,12.5]"
[exp:wt]   data.entity = "deconstructible-tile-proxy at [12.5,13.5]"
[exp:wt]   data.entity = "deconstructible-tile-proxy at [13.5,13.5]"
[exp:wt]   in script_raised_destroy undo_count=0 redo_count=0   # all 4 in-flight

[exp:wt] EVENT on_undo_applied tick=3911
[exp:wt]   data.actions = 4 built-tile actions, ALL with their tags intact
[exp:wt]   in on_undo_applied undo_count=0 redo_count=1
[exp:wt]   redo[1].length=4 types=[removed-tile,removed-tile,removed-tile,removed-tile]
```

All 4 mid-flow `script_raised_destroy` events fire BEFORE the single
`on_undo_applied` at the same tick.

Ctrl+Y:

```
# Per tile, mid-flow:
[exp:wt] EVENT on_built_entity tick=4068   x4
[exp:wt]   data.entity = "tile-ghost at [12.5,12.5]"
[exp:wt]   data.entity = "tile-ghost at [13.5,12.5]"
[exp:wt]   data.entity = "tile-ghost at [12.5,13.5]"
[exp:wt]   data.entity = "tile-ghost at [13.5,13.5]"
[exp:wt]   in on_built_entity undo_count=0 redo_count=0   # in-flight again

[exp:wt] EVENT on_redo_applied tick=4068
[exp:wt]   data.actions = 4 removed-tile actions, NO tags
[exp:wt]   in on_redo_applied undo_count=1 redo_count=0
[exp:wt]   undo[1].length=4 types=[built-tile,built-tile,built-tile,built-tile]   # no tags
```

### Implications

For design rows #14 / #15 (tile build/mine):

- **Natural anchor confirmed feasible** for both player-driven and
  scripted (`set_tiles`) paths. The action shape is the same:
  `{ type="built-tile", new_tile, previous_tile, position,
surface_index }`. Setting `previous_tile == new_tile` is a no-op
  ("paint same tile") that still produces a `built-tile` action — mod
  should treat that as no project change needed.
- **No real "removed-tile" action from `set_tiles`.** Even when
  setting tiles back to their natural type, the action stays
  `built-tile` with `new_tile` set to the new value and
  `previous_tile` to the old. Only Factorio's own undo path produces
  the `removed-tile` action shape (as the inverse on the redo stack
  during `on_undo_applied`). Design row #15 (tile mine) is therefore
  about player-driven tile mining (cursor over tile, mine it) — which
  was not separately exercised, but should produce a `removed-tile`
  action analogous to row #14.
- **Mid-flow risk for tile rows: harmless.** During Ctrl+Z, mid-flow
  fires `script_raised_destroy` of `deconstructible-tile-proxy` (a
  Factorio-internal helper, not project-tracked). During Ctrl+Y,
  mid-flow fires `on_built_entity` for `tile-ghost` (also transient,
  not project-tracked). The mod's normal entity handlers already
  filter unknown prototype names; neither event mutates project state
  for `deconstructible-tile-proxy` or `tile-ghost`. Suppression for
  tile rows is thus **not required** in practice — the design's
  matrix entry "Suppress mid-flow `script_raised_destroy`" can be
  marked as no-op for tiles.
- **`on_player_built_tile` / `on_player_mined_tile` do NOT fire
  during undo or redo.** Only `script_raised_destroy` (for proxy) and
  `on_built_entity` (for ghost) appear. Mod's `on_player_built_tile`
  handler will not run during undo flow; no suppression check needed
  there.
- **Concrete's 2×2 footprint produces 4 actions in one item.** When
  tagging player tile builds, the mod must iterate
  `e.tiles` from `on_player_built_tile` and tag each corresponding
  `built-tile` action. Position-key matching against `undo[1]` actions
  is the simplest approach (mirrors blueprint paste's approach in
  design's "Blueprint paste" section).
- **Tags do not auto-transfer.** Same as E6/E7/E8. Explicit
  `set_redo_tag` in `on_undo_applied` required.

### Mid-flow detection caveat

Across both E7 and E9 results, **mid-flow events that fire during
Ctrl+Z see BOTH undo and redo stacks empty**. The action being undone
is in-flight: popped from undo, not yet pushed to redo. Same for
Ctrl+Y: action popped from redo, not yet on undo at the time mid-flow
events fire.

Concretely (E9 path B):

```
EVENT script_raised_destroy   undo_count=0 redo_count=0   # 4 times
EVENT on_undo_applied         undo_count=0 redo_count=1   # action+tags here
```

This **breaks the design's "inspect undo-stack top during mid-flow to
suppress" strategy** as written. Inside a `script_raised_destroy`
during undo, neither `stack.get_undo_item(1)` nor
`stack.get_redo_item(1)` has the action carrying our `bp100:` tag.

Workarounds:

1. **Cache the tag at `set_undo_tag` time** in a tick-scoped table
   keyed by `(surface_index, position, tick)`. Mid-flow handler
   consults this table; entries cleared in `on_undo_applied` /
   `on_tick`.
2. **Filter mid-flow events by entity name** for tile undo
   (`deconstructible-tile-proxy`, `tile-ghost`) and entity types the
   mod doesn't otherwise track. For the cases that matter (project
   entities with mod-tracked types), workaround 1 is required.
3. **Use disposable anchors** for ops where mid-flow detection is
   load-bearing. Trade extra entity churn for guaranteed-skippable
   undo flows. Design's "Use a disposable anchor whenever ... the
   natural action's normal handler would fight with the desired undo
   behaviour" already allows this.

This finding is load-bearing for E1's verdict and the design's
"Mid-flow detection" section; flag for cross-reference when E1's
results land.

For E7 (wires) specifically, **no mid-flow events fire at all**, so
the caveat doesn't apply. Wire row's "Mid-flow risk: None" is correct.

For E9 (tiles), the mid-flow events fire but on irrelevant entities,
so the caveat is moot in practice for tile-only undo paths.

### Caveats

- Path B's `previous_tile="concrete"` for `(12,12)` reflects an
  experiment-state artifact (Path A's concrete had been put back by
  the prior Ctrl+Y, then `expClearStack` only cleared the stack, not
  the world tile). Doesn't change the verdict.
- Tile mine via `LuaPlayer.mine_tile` was not exercised — the API
  exists but was deemed redundant given `set_tiles(grass-1)` over
  concrete already produced a `built-tile` action. Real player tile
  mining should produce a `removed-tile` action with `previous_tile`
  populated; this is what the design row #15 expects. Worth
  confirming if a precise event shape is needed.
- Ctrl+Z and Ctrl+Y latency: actions land within the same tick they
  fire; no need for delayed event handling.
- Quality dimension not exercised; default-quality tiles only.

---

## Open questions for design follow-up

1. **Mid-flow stack inspection workaround** — design's "Mid-flow
   detection" needs revising. Both undo and redo stacks are empty
   while per-action `script_raised_*` events fire during Ctrl+Z /
   Ctrl+Y. Cache-by-(surface, position, tick) at tag time is the
   simplest fix; alternative is disposable anchors for affected ops.
   Cross-check with E1's verdict.
2. **Explicit `set_redo_tag` / `set_undo_tag` round-trip** — confirmed
   required across E6, E7, E8, E9. Fold into the tag-protocol section
   as a hard requirement.
3. **Tile-mine action shape (player mine vs `set_tiles`)** — confirm
   real player tile mining (cursor over tile, mine via default
   keybind) produces a `removed-tile` action with `previous_tile`
   populated. `set_tiles` always produces `built-tile`.
4. **Wire drag end detection** — the mod currently keys off
   `CustomInputs.Build` + `markPlayerAffectedWires` to schedule
   `onWiresPossiblyUpdated`. Confirm timing relative to the
   `wire-added` action: the action is on the stack by the time
   `on_player_setup_wire_drag` (or the wire-build event) fires, so
   tagging in the existing flow is feasible.
5. **`script_raised_destroy` of `deconstructible-tile-proxy`** —
   document as expected mid-flow noise during tile undo; mod's
   existing entity-name filters already ignore it. Worth a comment in
   `entity-events.ts` so future maintainers don't add unintended
   handling.
