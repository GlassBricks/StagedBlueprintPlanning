---
summary: "Rotation undo behavior for inserter (E4) and underground belt (E5)"
date: 2026-05-02
tags: [factorio, undo, experiments, rotation, underground-belt]
---

# Rotation undo behavior

| Exp | Question | Verdict |
| --- | --- | --- |
| E4 | `LuaEntity.rotate({by_player=p})` produces tagged `rotated-entity` undo action; tag survives undo | PASS |
| E4-key | `R` keystroke produces same action via injected input | NEEDS-USER (kwin-mcp `keyboard_key key=r` did not register; bare-letter keysyms unreliable per local-automation docs) |
| E4-midflow | Mid-flow risk during rotation undo | **DESIGN ISSUE** — `on_player_rotated_entity` DOES fire during undo (design row #6 says "None"); AND the tagged action is NOT visible via `stack.get_undo_item(1)` mid-flow (already popped). Suppression-by-stack-inspection won't work here. |
| E5 | Underground belt rotates as a pair via `entity.rotate({by_player=p})`, producing one `rotated-entity` action for the input end | PASS (single action; both belts rotate; types swap) |
| E5-drag | `LuaPlayer.build_from_cursor` with belt over an underground triggers drag-rotate / produces an undo action | FAIL — `build_from_cursor` returned nil (rejected as collision); no rotate, no undo entry |
| E5-realdrag | Actual mouse-drag of belt over underground end produces what action? | NEEDS-USER (cannot script real drag; build_from_cursor is a single-tile click and does not engage drag-rotate path) |

Findings path: `experiments/exp-rotation.md`. Key implication: the design's
"Mid-flow detection via undo-stack inspection" mechanism (design.md
"Mid-flow detection" section) does NOT work for the rotation case; needs
revision. See [Implications](#implications-for-design).

---

## Test setup

`src/test/experiments/rotation.ts` exposes Lua globals
(`expSetup_E4/5`, `expCheck_E4/5(label)`, `expRotateInserter_E4`,
`expDragRotate_E5`, `expRotateUnderground_E5`, `expFinish_E4/5`),
event tracing (`on_player_rotated_entity`, `on_built_entity`,
`on_player_mined_entity`, `script_raised_built/destroy`,
`on_undo_applied`, `on_redo_applied`). Driver
`scripts/run-rotation-exp.sh` cycles E4-keystroke, E4-API, E5-drag,
E5-API, E5-keystroke phases via UDP+kwin-mcp; restores config on exit.

Keystroke phases (E4-key, E5-key) failed to inject `R` to the game —
kwin-mcp's `keyboard_key key=r` did not produce any
`on_player_rotated_entity` (expected for bare letters per
`.agents/skills/experiment/local-automation.md` "kwin-mcp gotchas").
`keyboard_key key=ctrl+z` and `key=ctrl+y` worked. API-driven rotation
via `entity.rotate({by_player=p})` was used as a substitute and confirms
the same `on_player_rotated_entity` + `rotated-entity` action codepath.

---

## E4 — inserter rotation

### Forward (API-rotate as proxy for R)

```
[exp] E4 setup ok inserter_dir=4 pickup=(1.5,0.5) drop=(-0.69921875,0.5)
[exp] E4 after-setup-api undo_count=0 redo_count=0
[exp] ev on_player_rotated_entity tick=3165 inserter@(0.5,0.5)dir=8 previous_direction=4
[exp] during on_player_rotated_entity undo_count=1 redo_count=0
[exp] during on_player_rotated_entity   undo_action[1] type=rotated-entity name=inserter pos=(0.5,0.5) tags=nil raw={original_direction = 4, original_mirroring = false, surface_index = 1, target = {direction = 8, entity_number = 0, name = "inserter", position = {x = 0.5, y = 0.5}}, type = "rotated-entity"}
[exp] E4 rotate API ok=true new_dir=8
```

`entity.rotate({by_player=p})` returns true; rotates inserter east(4)
→ south(8); fires `on_player_rotated_entity` synchronously; pushes a
`rotated-entity` action onto the player's undo stack with
`original_direction=4`, `target.direction=8`. `target.entity_number=0`
(non-zero only inside blueprint contexts). Pickup/drop positions update
to match new direction.

### Tagging

```
[exp] E4 tagged rotated-entity at item=1 action=1 original_direction=4
[exp] E4 after-tag   undo_action[1] type=rotated-entity ... tags={["bp100:data"] = {oldDirection = 4}, ["bp100:handler"] = "rotateBack"}
```

`stack.set_undo_tag(1, j, "bp100:handler", "rotateBack")` and
`stack.set_undo_tag(1, j, "bp100:data", {oldDirection=4})` succeed
synchronously after the action is on the stack.

### Undo (Ctrl+Z)

```
[exp] ev on_player_rotated_entity tick=3267 inserter@(0.5,0.5)dir=4 previous_direction=8
[exp] during on_player_rotated_entity undo_count=0 redo_count=0
[exp] ev on_undo_applied tick=3267 actions=1
[exp]   undo action[1] type=rotated-entity raw={original_direction = 4, original_mirroring = false, surface_index = 1, tags = {["bp100:data"] = {oldDirection = 4}, ["bp100:handler"] = "rotateBack"}, target = {direction = 8, entity_number = 0, name = "inserter", position = {x = 0.5, y = 0.5}}, type = "rotated-entity"}
[exp] E4 post-undo-api undo_count=0 redo_count=1
[exp] E4 post-undo-api   redo_action[1] type=rotated-entity name=inserter raw={original_direction = 8, original_mirroring = false, surface_index = 1, target = {direction = 4, entity_number = 0, name = "inserter", position = {x = 0.5, y = 0.5}}, type = "rotated-entity"}
```

Sequence on Ctrl+Z, all on the same tick (3267):

1. Factorio pops the action from the undo stack (count 1 → 0).
2. Reverts the world (inserter back to dir=4).
3. Fires `on_player_rotated_entity` with `previous_direction=8`,
   entity now `direction=4`. **At this moment, the undo stack is
   empty AND the redo stack is empty** — the action is in transit.
4. Fires `on_undo_applied` with `e.actions[1]` carrying the
   original `rotated-entity` payload AND the inline `tags` field.
5. Pushes the inverse `rotated-entity` to the redo stack
   (count 0 → 1, no `tags` field — Factorio does not auto-transfer).

Tag round-trip via `on_undo_applied.actions[].tags` confirmed.

### Mid-flow risk — design row #6 needs revision

Design row #6 ("Entity rotation") lists mid-flow risk as **"None
(rotation doesn't destroy/create)"**. Refuted on two fronts:

1. **`on_player_rotated_entity` DOES fire during undo.** The mod's
   normal `rotated-entity` handler at
   `src/project/event-handlers/entity-events.ts` (`onEntityRotated`
   → `setEntityDirection`) will run, mutate project state to match
   the (already-undone) world direction, and then `on_undo_applied`
   runs handler #2 with our tag. In the simple case both end up
   setting the same direction so net state is correct; in the
   underground-belt pair case (see E5), only one of the two paired
   entities fires `on_player_rotated_entity`, but both belts have
   actually rotated (and swapped types), so the pair partner's
   project state may be wrong if not handled.

2. **`stack.get_undo_item(1)` does NOT contain the tagged action
   during the mid-flow event.** The action has been popped from undo
   before mid-flow events fire and is not yet on redo. Design's
   suppression strategy ("inspect the undo stack top inside mid-flow
   handlers") is therefore unviable for rotation as written.

Confirmed re-traceable: at the mid-flow `on_player_rotated_entity`
during undo, both `get_undo_item_count()` and `get_redo_item_count()`
returned 0; `e.actions[i].tags` in the subsequent `on_undo_applied`
on the same tick carried the bp100 tag.

---

## E5 — underground belt

### Setup

Pair: input at (4.5,0.5) dir=east(4), output at (7.5,0.5) dir=east(4).

### E5-drag (`build_from_cursor` belt over ug input)

```
[exp] E5 [post-setup] ug_A=underground-belt@(4.5,0.5)dir=4 ug_type=input ug_B=underground-belt@(7.5,0.5)dir=4 ug_type=output tb_A=nil tb_B=nil
[exp] E5 drag build_from_cursor ok=nil
[exp] E5 [after-drag-build] ug_A=underground-belt@(4.5,0.5)dir=4 ug_type=input ug_B=underground-belt@(7.5,0.5)dir=4 ug_type=output tb_A=nil tb_B=nil
[exp] E5 after-drag undo_count=0 redo_count=0
```

`p.build_from_cursor({position=(4.5,0.5), direction=south})` with
`transport-belt` in cursor over the underground input returned `nil`
(false). No rotate, no fast-replace, **no undo entry**. The world
is unchanged. Confirms `build_from_cursor` does NOT engage Factorio's
drag-rotate logic — that path is specific to a real held-mouse drag,
which has no scriptable equivalent.

### E5 API-rotate underground

```
[exp] E5 [after-setup-api] ug_A=underground-belt@(4.5,0.5)dir=4 ug_type=input ug_B=underground-belt@(7.5,0.5)dir=4 ug_type=output
[exp] ev on_player_rotated_entity tick=3901 underground-belt@(4.5,0.5)dir=12 ug_type=output previous_direction=4
[exp] during on_player_rotated_entity undo_count=1 redo_count=0
[exp] during on_player_rotated_entity   undo_action[1] type=rotated-entity name=underground-belt pos=(4.5,0.5) tags=nil raw={original_direction = 4, original_mirroring = false, surface_index = 1, target = {direction = 12, entity_number = 0, name = "underground-belt", position = {x = 4.5, y = 0.5}, type = "output"}, type = "rotated-entity"}
[exp] E5 rotate API ok=true new_dir=12
[exp] E5 [after-api-rotate] ug_A=underground-belt@(4.5,0.5)dir=12 ug_type=output ug_B=underground-belt@(7.5,0.5)dir=12 ug_type=input
```

Single `entity.rotate({by_player=p})` on the input end:

- One `rotated-entity` action emitted (for A only, at pos (4.5,0.5)),
  with `target.type="output"` reflecting the post-rotate type swap.
- World effect: BOTH belts rotated (4 → 12) AND BOTH had their
  `belt_to_ground_type` flipped (input→output, output→input).
  `on_player_rotated_entity` fired ONCE — for A only. B's mutation
  is silent at the event layer.

### E5 undo

```
[exp] ev on_player_rotated_entity tick=4004 underground-belt@(4.5,0.5)dir=4 ug_type=input previous_direction=12
[exp] during on_player_rotated_entity undo_count=0 redo_count=0
[exp] ev on_undo_applied tick=4004 actions=1
[exp]   undo action[1] type=rotated-entity raw={original_direction = 4, original_mirroring = false, surface_index = 1, target = {direction = 12, entity_number = 0, name = "underground-belt", position = {x = 4.5, y = 0.5}, type = "output"}, type = "rotated-entity"}
[exp] E5 post-undo-api ug_A=underground-belt@(4.5,0.5)dir=4 ug_type=input ug_B=underground-belt@(7.5,0.5)dir=4 ug_type=output
[exp] E5 post-undo-api   redo_action[1] type=rotated-entity name=underground-belt raw={original_direction = 12, original_mirroring = false, surface_index = 1, target = {direction = 4, entity_number = 0, name = "underground-belt", position = {x = 4.5, y = 0.5}, type = "input"}, type = "rotated-entity"}
```

Same sequence as E4 (mid-flow event then `on_undo_applied`, same tick;
stack momentarily empty at mid-flow). Both belts rotated back; types
restored. Single `on_player_rotated_entity` again — only for A. Tag
not set in this run (E5 path didn't auto-tag — see Caveats); the
shape would round-trip identically to E4 per the redo action's lack
of tags + the tags-in-event payload from E4.

### E5 keystroke (R) — failed to register

```
[exp] E5 key selected=underground-belt
... keyboard_key key=r issued ...
[exp] E5 [after-key-rotate] ug_A=underground-belt@(4.5,0.5)dir=4 ug_type=input ...
[exp] E5 after-key-rotate undo_count=0 redo_count=0
```

Selection succeeded (`p.selected = underground-belt`). R keystroke
did not produce a `on_player_rotated_entity`; world unchanged.
Same kwin-mcp limitation as E4-key.

---

## Implications for design

### Row #6 (Entity rotation) — REVISE mid-flow risk

Currently:

> Mid-flow risk: **None (rotation doesn't destroy/create)**

Should read: `on_player_rotated_entity` fires during undo with
`previous_direction = post-rotate dir`, entity in pre-rotate dir.
Mod's normal `onEntityRotated` handler will run before
`on_undo_applied`. Suppression needed.

### "Mid-flow detection" section — REVISE mechanism

Currently:

> The fix: **inspect the undo stack top inside mid-flow handlers**.
> If the topmost undo (or redo) item contains an action with a
> `bp100:` tag whose `target.position` and surface match the current
> event, skip the normal handler.

Refuted for rotation: at the moment `on_player_rotated_entity` fires
during undo, the action is **not on the undo stack** (already popped)
and **not on the redo stack** (not yet pushed). Both
`get_undo_item_count()` and `get_redo_item_count()` return 0 across
the gap.

Possible alternative mechanisms (need separate validation; not tested
in this experiment):

1. **Defer mid-flow handler to end-of-tick / next-tick.** Enqueue a
   handler invocation; if `on_undo_applied` or `on_redo_applied` fired
   on the same tick afterwards, drop the queued invocation. Requires
   confirming Factorio guarantees `on_undo_applied` fires on the same
   tick as the mid-flow events it triggers (verified true here for
   rotation; need to confirm for build/destroy too — that's E1's
   territory).

2. **Tick-scoped "undoing/redoing" flag set inside `on_undo_applied`
   and used by mid-flow handlers via deferral.** Same as above with a
   shared flag; mechanically equivalent.

3. **Read the inline `tags` field of `on_undo_applied.actions[]`
   instead of polling the stack.** `on_undo_applied` runs AFTER all
   mid-flow events, so this only works in conjunction with deferred
   mid-flow handling.

Other cases in the matrix that share this risk (rows #1, #2, #11,
#12, #13, #14, #15, #16) will need the same alternative if the
"undo stack inspection" doesn't hold for build/destroy either.
**Recommend re-running E1 (already scaffolded) to verify whether
`script_raised_destroy` / `script_raised_built` see the action on
the stack mid-flow, or also see the empty-stack gap.**

If E1 also shows the empty-stack gap, the alternative deferred-handler
mechanism becomes the only viable approach.

### Underground belt pair — new design concern

Single rotation of one underground end mutates BOTH ends (rotation
AND belt-to-ground-type flip), but `on_player_rotated_entity` fires
ONCE — for the user-rotated end only. The mod's existing
`onEntityRotated` handler processes A; B's project state mutation
needs to be derived (find the partner via `neighbours` or
`belt_neighbours`).

If the existing mod already handles this (likely via its
underground-pair logic), no change. If not, design row #6 should
note this side-effect and reference the pair-handling code.

### Row #7 (Underground belt drag rotate) — anchor confirmed disposable

Design row #7 already states `Anchor (no native action; the belt
build is fast-replace)`. Confirmed:

- `build_from_cursor` does NOT engage drag-rotate; no action is
  produced. Belt placement over an underground is rejected as
  collision when invoked via API.
- For the in-game drag-rotate behavior itself, NEEDS-USER to verify
  what action (if any) Factorio creates. Best-guess from row #7's
  design wording: a `rotated-entity` action does get created from
  drag-rotate (Factorio's native input handler invokes the same
  rotation codepath). If true, row #7 could collapse into row #6
  (natural anchor on `rotated-entity`). User-in-loop verification
  recommended before deciding whether the disposable anchor is still
  required.

---

## Caveats

- Keystroke for `R` (and any bare-letter game hotkey) cannot be
  reliably injected via kwin-mcp `keyboard_key`. The
  `entity.rotate({by_player})` API was used as a proxy; it shares
  the `on_player_rotated_entity` + `rotated-entity` codepath with R
  per all observable signals (event payload, action shape, undo
  round-trip), but a sliver of doubt remains that R might trigger an
  additional codepath (e.g. drag-rotate cancellation logic). Re-test
  under user-in-loop if confidence required.
- Redo (Ctrl+Y) was not exercised in this run. Factorio's swap
  pattern on the redo action (target/original_name swap, no tags
  carried over) is documented in G3 findings (E6, E8) and the same
  shape is observable in our redo-stack inspection here. Explicit
  `set_redo_tag` inside `on_undo_applied` required if redo state
  needs the tag.
- E5 drag-rotate tested only the `build_from_cursor` substitute. No
  attempt at scripted drag (e.g. sequence of `build_from_cursor`
  calls along the belt path) — unlikely to engage drag-rotate
  because Factorio's drag-rotate is gated on the input event being a
  held-mouse drag specifically.
- Rotation of `mirroring`-supporting entities (loaders) not tested;
  `original_mirroring` field present in action payload (`false` for
  inserter and underground belt). Design row #6's `oldType` and
  loader-type handling not exercised.
- Cancel/abort redo paths not tested.

---

## NEEDS-USER follow-ups

1. **E4-key:** Verify R keystroke from real player produces the
   identical `on_player_rotated_entity` + `rotated-entity` shape as
   the API path (high confidence yes; mostly belt-and-suspenders).

2. **E5-realdrag:** With cursor holding a transport-belt, drag mouse
   over an underground end perpendicular to the underground's
   direction. Inspect the undo stack and event log:
   - Does Factorio create a `rotated-entity`, `built-entity`, both,
     or neither?
   - Does `on_player_rotated_entity` fire?
   - Confirms whether design row #7's disposable-anchor strategy is
     still required.

3. **(Cross-experiment.) Re-run E1 with the same mid-flow stack
   snapshot harness used here.** Validate whether
   `script_raised_destroy` / `script_raised_built` also see an empty
   undo+redo stack at mid-flow, or whether they see the action still
   on the undo stack. The answer determines the design's mid-flow
   suppression mechanism for ALL natural-anchor rows in the matrix.
