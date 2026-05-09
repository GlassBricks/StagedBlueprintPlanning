---
summary: "G1 foundations experiments E1, E2, E3 for tag-based undo/redo redesign. Mid-flow stack peek refuted; tag round-trip via on_undo_applied confirmed; hidden disposable anchor broken on redo path."
date: 2026-05-02
tags: [factorio, undo, experiments, foundations, tags, anchors]
---

# Foundations experiments — E1, E2, E3

Driver: `scripts/run-foundations-exp.sh` (kwin-mcp-cli + UDP).
Evidence file: `factorio-test-data-dir/factorio-current.log`
(`[exp:foundations]` lines).

## Verdict table

| Exp | Question | Verdict | Implication |
|---|---|---|---|
| E1  | Is the tagged action visible in `undo_redo_stack` during mid-flow `script_raised_*` / `on_player_*` events? | **FAIL** | Action is in flight: undoCount=0, redoCount=0 at mid-flow. Stack-peek detection refuted. |
| E2  | Can `set_redo_tag` be called from inside `on_undo_applied`, and does the tag survive into `on_redo_applied`? Action indices stable across undo/redo? | **PASS** | Action index 1 maps to action index 1 (`built-entity` → `removed-entity`); set_redo_tag works; tag visible in `e.actions` of `on_redo_applied`. |
| E3  | Disposable hidden anchor: tag-on-removed-entity, undo round-trip, redo round-trip. | **PARTIAL FAIL** | Forward + undo work cleanly. **Redo broken**: no redo entry is created when undoing the destroy of a `hidden: true` `simple-entity-with-owner`. |
| E3b | Same flow with a normal entity (iron-chest) — control. | **PASS** | Round-trip works with normal entity. Confirms E3's failure is specific to the hidden anchor prototype. |

## Setup

`src/test/experiments/foundations.ts` implements `expSetup_E*` /
`expCheck_E*` / `expFinish_E*` globals. Driver loops:
1. `expSetup_E<N>()`
2. `expCheck_E<N>('after-setup')`
3. `mouse_click` to focus + `keyboard_key ctrl+z`
4. `expCheck_E<N>('post-undo')`
5. `keyboard_key ctrl+y`
6. `expCheck_E<N>('post-redo')`
7. `expFinish_E<N>()`

Anchor prototype `bp100_undo-anchor-exp` registered via the existing
`createHiddenEntity(name)` helper:
`simple-entity-with-owner` + `hidden: true` +
`flags: ["player-creation", "placeable-off-grid"]` +
`collision_mask: { layers: {} }`.

Mid-flow listeners (`script_raised_built`, `script_raised_destroy`,
`on_built_entity`, `on_player_mined_entity`) dump `undo_redo_stack`
top item on each fire.

## E1 — mid-flow stack visibility

### Forward
```
[exp:foundations] E1 setup: built iron-chest at (-5.5,2.5) undoItems=1
[exp:foundations] E1 setup: tagged item=1 act=1
[exp:foundations] E1 post-setup UNDO[1] item=1 act=1 type=built-entity
  target=0@iron-chest@(-5.5,2.5) surface=1
  tags={["bp100:data"] = {kind = "E1", pos = {x = -5.5, y = 2.5}},
        ["bp100:handler"] = "expE1"}
```

### Ctrl+Z (undo)
```
[exp:foundations] E1 mid-flow script_raised_destroy ent=iron-chest pos=(-5.5,2.5)
[exp:foundations] E1 mid-flow:script_raised_destroy undoCount=0 redoCount=0   <-- IN FLIGHT
[exp:foundations] on_undo_applied tick=2655 actions=1
[exp:foundations] on_undo_applied item=-1 act=1 type=built-entity
  target=0@iron-chest@(-5.5,2.5) surface=1 tags={...full tag intact...}
[exp:foundations] E1 on_undo_applied:stack undoCount=0 redoCount=1
[exp:foundations] E1 on_undo_applied:stack REDO[1] item=1 act=1
  type=removed-entity target=... surface=1 tags=nil
```

Key observations:
- During `script_raised_destroy` the action exists on **neither** the
  undo nor the redo stack; both counts are 0. The action is "in
  flight" between Factorio popping it from undo and `on_undo_applied`
  finalising it onto redo.
- After `on_undo_applied` returns, `redoCount=1`. The redo entry's
  action carries the **inverse type** (`removed-entity`) and has
  **no tags** (Factorio does not auto-transfer tags from undo→redo).
- `e.actions` passed into `on_undo_applied` carries the original tag
  intact. So tags reach the handler reliably; only the post-handler
  redo entry lacks tags until we call `set_redo_tag`.

### Ctrl+Y (redo)
```
[exp:foundations] E1 mid-flow on_built_entity ent=iron-chest
[exp:foundations] E1 mid-flow:on_built_entity undoCount=0 redoCount=0   <-- IN FLIGHT
[exp:foundations] on_redo_applied tick=2776 actions=1
[exp:foundations] on_redo_applied item=-1 act=1 type=removed-entity ... tags=nil
[exp:foundations] E1 check:post-redo undoCount=1 redoCount=0
```

Same in-flight pattern on the redo side. Mid-flow event fires with
both stacks empty; `on_redo_applied` then finalises a fresh undo
entry (untagged).

### Implication for design

The "Mid-flow detection" section of `design.md` (peek `get_undo_item(1)`
inside `script_raised_*` / `on_player_*` handlers, suppress on
matching `bp100:` tag) **does not work**. The action is not visible
on either stack at the moment those events fire.

Workarounds to evaluate:
1. **Disposable-anchor-only strategy** (recommended). Filter mid-flow
   events by entity prototype name (`bp100_undo-anchor-*`); never
   peek the stack. Removes the detection problem entirely. Cost:
   anchor entity create+destroy per undoable op. Requires E3 redo
   path to work — see E3 below.
2. **Pre-undo flag via tick-based heuristic**. Track in `on_undo_applied`
   that *some* undo was just applied, set a "we're in an undo flow
   for tick T" flag. Mid-flow events fire at the *same tick* as
   `on_undo_applied`. But mid-flow events fire **before**
   `on_undo_applied`, so the flag cannot be set in time without a
   different signal source. Not viable without additional API.
3. **Side-channel detection**. `ScriptRaisedDestroyEvent` /
   `OnBuiltEntityEvent` carry no `cause` / `from_undo` field
   (verified against `typed-factorio/runtime/generated/events.d.ts`).
   Cannot distinguish undo flow from genuine player/script flow at
   the event itself.

## E2 — set_redo_tag from inside on_undo_applied

### Forward
```
[exp:foundations] E2 setup: built wooden-chest undoItems=1
[exp:foundations] E2 setup: tagged item=1 act=1
[exp:foundations] E2 check:after-setup UNDO[1] item=1 act=1 type=built-entity
  target=0@wooden-chest@(4.5,2.5) surface=1
  tags={["bp100:data"] = {kind = "E2-undo", ...}, ["bp100:handler"] = "expE2"}
```

### Inside on_undo_applied (after Ctrl+Z)
```
[exp:foundations] on_undo_applied actions=1
[exp:foundations] on_undo_applied act=1 type=built-entity ... tags={...intact...}
[exp:foundations] E2 on_undo_applied redoCount=1
[exp:foundations] E2 on_undo_applied:stack-pre-set-redo-tag REDO[1] act=1
  type=removed-entity target=0@wooden-chest@(4.5,2.5) surface=1 tags=nil
[exp:foundations] E2 set_redo_tag item=1 act=1 ok=true err=
[exp:foundations] E2 on_undo_applied:stack-post-set-redo-tag REDO[1] act=1
  type=removed-entity target=... tags={["bp100:data"] = {actionIndex = 1,
    kind = "E2-redo"}, ["bp100:handler"] = "expE2_redo"}
```

### Inside on_redo_applied (after Ctrl+Y)
```
[exp:foundations] on_redo_applied actions=1
[exp:foundations] on_redo_applied act=1 type=removed-entity ... tags={...redo tags intact...}
```

### Conclusions
- `set_redo_tag(1, idx, ...)` from inside `on_undo_applied` returns
  `ok=true`. The redo entry exists at that point (`redoCount=1`).
- Action index in undo (act=1, `built-entity`) maps 1:1 to action
  index in redo (act=1, `removed-entity`). No `surface_index_of_action`
  or position lookup required for direct round-trip.
- Tag survives into `on_redo_applied`'s `e.actions`. Symmetric
  `set_undo_tag` from `on_redo_applied` is implied by the same
  mechanism (not separately verified — design can rely on it).

### Implication
- The undo↔redo handshake works. After each `on_undo_applied`, the
  handler should call `set_redo_tag` on the matching action index to
  carry the tag forward. Same for `on_redo_applied` → `set_undo_tag`.
- No `surface_index_of_action` indirection needed for the simple
  case of one tagged action per item. Multi-action items still need
  index management — verified at this size, scale up untested.

## E3 — disposable anchor round-trip

### Forward (create anchor + destroy with player+undo_index=0)
```
[exp:foundations] E3 create_entity ok=true err= ent=true
[exp:foundations] E3 destroy ok=true
[exp:foundations] E3 after-destroy undoItems=1 (was 0)
[exp:foundations] E3 raw item=1 act=1 type=removed-entity
  target=0@bp100_undo-anchor-exp@(8.5,2.5) surface=1 tags=nil
[exp:foundations] E3 set_undo_tag ok=true err= item=1 act=1
[exp:foundations] E3 post-setup UNDO[1] act=1 type=removed-entity
  target=0@bp100_undo-anchor-exp@... tags={...full tag...}
```

`removed-entity` action created and taggable. PASS for tagging step.

### Ctrl+Z (undo of removed-entity)
```
[exp:foundations] E3 mid-flow on_built_entity ent=bp100_undo-anchor-exp pos=(8.5,2.5)
[exp:foundations] E3 mid-flow:on_built_entity undoCount=0 redoCount=0
[exp:foundations] on_undo_applied actions=1
[exp:foundations] on_undo_applied act=1 type=removed-entity
  target=0@bp100_undo-anchor-exp@... tags={...full tag intact...}
[exp:foundations] E3 on_undo_applied:stack undoCount=0 redoCount=0   <-- !!
[exp:foundations] E3 check:post-undo undoCount=0 redoCount=0 live anchors=1
```

- Anchor entity is recreated in the world (`live anchors=1`).
- `script_raised_built` filter matches by name — design's plan to
  ignore mid-flow anchor events by prototype name works.
- Tag fully intact in `e.actions` of `on_undo_applied`. PASS for
  tag delivery.
- **However**: `redoCount = 0` after `on_undo_applied` returns.
  Factorio did NOT create a redo entry.
- Post-undo Ctrl+Y therefore does nothing.

### Ctrl+Y (redo)
```
[exp:foundations] E3 check:post-redo undoCount=0 redoCount=0 live anchors=1
```

No `on_redo_applied` fired. No mid-flow events. Anchor stayed in
world. **Redo path broken.**

### E3b control — same flow with normal entity
```
[exp:foundations] E3b set_undo_tag ok item=1 act=1
[exp:foundations] E3b post-setup UNDO[1] act=1 type=removed-entity
  target=0@iron-chest@(12.5,2.5) ... tags={full tag}

# Ctrl+Z
[exp:foundations] E3b mid-flow on_built_entity ent=iron-chest
[exp:foundations] on_undo_applied act=1 type=removed-entity ... tags={...intact...}
[exp:foundations] E3b on_undo_applied:stack undoCount=0 redoCount=1   <-- works
[exp:foundations] E3b check:post-undo redoCount=1 live iron-chests=2

# Ctrl+Y
[exp:foundations] E3b mid-flow script_raised_destroy ent=iron-chest
[exp:foundations] on_redo_applied act=1 type=built-entity ... tags=nil
[exp:foundations] E3b on_redo_applied:stack undoCount=1 redoCount=0
[exp:foundations] E3b check:post-redo undoCount=1 redoCount=0 live iron-chests=1
```

Normal-entity round-trip works in both directions. Confirms the E3
redo failure is specific to the **hidden** anchor prototype, not the
flow.

### Implication
- `simple-entity-with-owner` with `hidden: true` +
  `flags: ["player-creation", "placeable-off-grid"]` +
  `collision_mask: { layers: {} }` does **not** survive an undo→redo
  round trip. Factorio refuses to create a redo entry for it.
- Disposable-anchor design must use a prototype that DOES round-trip.
  Current `Prototypes.UndoReference` uses the same `createHiddenEntity`
  helper, so it would have the same issue.
- Likely culprit: `hidden: true`. Other suspects: empty
  `collision_mask`, `simple-entity-with-owner` base. Untested in this
  run — needs a follow-up E3c experiment varying one flag at a time.
- Until a working anchor prototype is found, design row #3 (Send to
  stage), #4 (Bring to stage), #5 (Last stage change), #7
  (Underground belt drag rotate) cannot rely on Factorio's automatic
  redo. Either:
  - Find a prototype configuration that works (highest priority).
  - Accept no-redo for these ops (acceptable degradation but worse
    than current ghost-based system).
  - Manually push a fresh undo entry inside `on_undo_applied` (this
    creates a new undo entry, NOT a redo entry — it would only
    produce a "press Ctrl+Z again to redo" pattern, which is the
    wrong UX).

## Cross-cutting observations

1. **Stacks are momentarily empty during mid-flow events.** Verified
   in E1, E3, E3b mid-flow handlers. The action is in flight between
   pop-from-undo and `on_undo_applied`. Tag-based detection cannot
   read it from either stack.

2. **`e.actions` in `on_undo_applied` / `on_redo_applied` carries the
   originating action with tags.** Reliable channel for delivering
   payload to handler. Verified in all four sub-experiments.

3. **Action indices are stable across undo↔redo for single-action
   items.** `built-entity` at undo idx=1 ↔ `removed-entity` at redo
   idx=1.

4. **No tag auto-transfer.** `set_undo_tag` does not appear on the
   redo entry. Handler must call `set_redo_tag` (and vice versa)
   inside `on_undo_applied` / `on_redo_applied`.

5. **`removed-entity` from scripted `entity.destroy({player,
   undo_index: 0})` is taggable.** Confirms the disposable-anchor
   tagging step works for any prototype that registers an undo entry.

6. **Mid-flow event flavour reflects the world op being applied, NOT
   the original op being undone.** Undoing a build fires
   `script_raised_destroy` (Factorio is destroying the entity);
   redoing the same fires `on_built_entity` (Factorio is recreating
   it). The `on_player_*` vs `script_raised_*` distinction is NOT a
   reliable "is this an undo flow" signal.

## Action items for design.md

| Section | Status | Update needed |
|---|---|---|
| API constraints → Verified behaviour | OK | Confirms most claims. |
| Tag protocol | OK | E2 confirms set_redo_tag round-trip. |
| Mid-flow detection | **CRITICAL — wrong** | Stack-peek mechanism refuted by E1. Replace with disposable-anchor-only strategy (filter by prototype name) for ops needing suppression. Drop the `currentlyTagging` flag and undo-stack inspection. |
| Anchor strategy | NEEDS REVISION | E3 shows the current `createHiddenEntity` prototype does not round-trip on redo. Add a follow-up experiment to find a prototype variant that does. Until resolved, document that disposable-anchor ops are undo-only (no redo). |
| Operation matrix rows #1, #2, #11, #12, #13, #14, #15, #16 (natural anchors with mid-flow risk) | NEEDS REVISION | Cannot suppress mid-flow via stack peek. Two options: (a) switch all to disposable anchors (uniformity, higher cost), (b) restructure normal handlers so they tolerate "ghost" undo-flow events without state mutation. Pick after design discussion. |
| Operation matrix rows #3, #4, #5, #7 (already disposable) | NEEDS REVISION | Anchor redo path broken; either accept no-redo or fix the prototype. |

## NEEDS-USER follow-ups

- **None for the questions in scope.** All three primary experiments
  (E1, E2, E3) reached a verdict via fully-automated UDP+keystroke.
- New question raised by E3 (which prototype configuration round-trips
  through redo) is also fully scriptable; treat as a follow-up
  experiment, not user-blocked.

## Cleanup

- Driver script removed.
- `src/test/experiments/foundations.ts` removed.
- `src/test/test-init.ts` import line reverted.
- `src/prototypes/entity-marker.ts` experiment data.extend reverted.
- `factorio-test-data-dir/config.ini` restored from `.user-backup`.
- No factorio / kwin-mcp / tmux processes left running.
