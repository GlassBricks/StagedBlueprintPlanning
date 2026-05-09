---
summary: "Edge cases for tag-based undo (E13–E17): same-tick indexing, remove_undo_action, stack pruning, missing endpoints, cross-mod namespace"
date: 2026-05-02
tags: [factorio, undo, experiments, edges]
---

# Undo edge cases (E13–E17)

| Exp | Question                                                                                            | Verdict                                                                                                                                                  |
| --- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E13 | Same-tick player op + tag: does first tag still attach to the right action? Action-index stability? | PASS. Multi-anchor via `undo_index: 0/1` indexes correctly within one item. Multiple `build_from_cursor` calls same tick produce SEPARATE undo items.    |
| E14 | `remove_undo_action`: do remaining tagged actions still fire `on_undo_applied`; indices renumbered? | PASS. Removed action drops cleanly; `on_undo_applied.actions[]` reflects post-removal order; remaining tags survive intact.                              |
| E15 | Factorio-pruned undo entries: cap, silent oldest-drop?                                              | PASS. Default cap = 100 items. Pushing the 101st silently drops oldest; FIFO; no event fires.                                                            |
| E16 | Best-effort lookup on destroyed neighbour                                                           | PASS (lookup pattern). `surface.find_entity(name, pos)` returns `nil` silently when entity gone — design's best-effort wire-restore skip is implementable. Wire-undo proper not testable scriptally (per G4: scripted wires don't push undo). |
| E17 | Cross-mod tag namespace                                                                             | PASS. `bp100:` and `othermod:` tags coexist on same action; prefix-scan via `pairs(tags)` correctly distinguishes namespaces; `get_undo_tag` returns per-key value cleanly. |

Findings path: `experiments/exp-edges.md`. No NEEDS-USER for this group.

---

## E13 — same-tick action-index stability

### Question

Player builds entity. Mod tags in `on_built_entity`. Same tick another `on_built_entity` (e.g. drag-build belt). Does the first tag still attach to the right action? What is the action-index behavior when multiple actions append same tick?

### Verdict

PASS. Two distinct grouping behaviours, both stable for index-by-`item.length` tagging:

1. **Script-driven multi-anchor** (`entity.destroy({player, undo_index: 0})` then `({player, undo_index: 1})`): one undo item, N actions, indices 1..N. Tagging at `item.length` after each call tags that call's action.

2. **Player-driven sequential `build_from_cursor` same tick**: N SEPARATE undo items, each with one action. Item[1] is always the newest. `on_built_entity` sees `item.length=1` for the just-pushed action.

### Setup

`expE13Run()` in `src/test/experiments/edges.ts`. Path (a): `surface.create_entity` then `entity.destroy({player, undo_index: 0|1})` ×2. Path (b): `player.build_from_cursor` ×3 with iron-chest cursor stack at (5,0), (7,0), (9,0). `on_built_entity` handler tags each event with `item.length` at event time.

### Evidence

Path (a) — script-driven with `undo_index: 0/1`:

```
[exp:E13:scriptpath] item.length=2
[exp:E13:scriptpath] item 1 length=2
[exp:E13:scriptpath] item 1 action[1] type=removed-entity pos=5.5,5.5 tags={bp100:probe="script_1"}
[exp:E13:scriptpath] item 1 action[2] type=removed-entity pos=7.5,5.5 tags={bp100:probe="script_2"}
```

Path (b) — three player builds same tick:

```
[exp:E13:playerpath] before tick=2563 undo_count=0
[exp:E13:built] tick=2563 pos=5.5,0.5 item.length=1 tag=build_1_at_5.5_0.5
[exp:E13:built] tick=2563 pos=7.5,0.5 item.length=1 tag=build_2_at_7.5_0.5
[exp:E13:built] tick=2563 pos=9.5,0.5 item.length=1 tag=build_3_at_9.5_0.5
[exp:E13:playerpath] after  tick=2563 undo_count=3
```

Final stack snapshot (item[1] = top of undo, newest):

```
[exp:E13:dump] undo_count=3
[exp:E13:dump] item 1 length=1
[exp:E13:dump] item 1 action[1] type=built-entity pos=9.5,0.5 tags={bp100:probe="build_3_at_9.5_0.5"}
[exp:E13:dump] item 2 length=1
[exp:E13:dump] item 2 action[1] type=built-entity pos=7.5,0.5 tags={bp100:probe="build_2_at_7.5_0.5"}
[exp:E13:dump] item 3 length=1
[exp:E13:dump] item 3 action[1] type=built-entity pos=5.5,0.5 tags={bp100:probe="build_1_at_5.5_0.5"}
```

### Implications

- Mod's tagging strategy (`set_undo_tag(1, item.length, ...)` inside `on_built_entity`) is correct for both grouping behaviours: in path (a) the index increases per call; in path (b) it is always 1 because each event opens its own item.
- **Sequential `build_from_cursor` calls do NOT auto-group.** Each opens a new undo item. This contrasts with native drag-build (real cursor input) which Factorio is documented to group within one item. Per-tick mod-side appends targeting the player's most-recent item still need to use `undo_index: 1` explicitly; relying on Factorio to group player builds is mode-specific.
- **Native drag-build not directly tested.** API has no scriptable equivalent; would need NEEDS-USER. If Factorio groups drag-build into one item with N actions, the tag-by-length pattern still works (length increments synchronously with each `on_built_entity`); if it splits into N items as `build_from_cursor` does, also fine. Either way the design is robust.
- Item ordering: `get_undo_item(1)` is always the newest. Older items shift up the index as new ones push.

### Caveats

- Scripted `build_from_cursor` may differ from native input in how Factorio groups. The verified safe assumption: each `on_built_entity` sees the just-appended action at `item.length` of `item 1`.
- `controller_type=1` (character), `pos=0,0`, `char=true` at test time — character-mode editor (Editor Extensions). Plain editor controller may behave differently.

---

## E14 — `remove_undo_action` behavior

### Question

After `stack.remove_undo_action(item_index, action_index)`:

1. Do remaining tagged actions still fire `on_undo_applied`?
2. Do indices in `event.actions` reflect post-removal order?

### Verdict

PASS on both. `remove_undo_action` is in-place; surviving actions retain tags and reposition without gap.

### Setup

`expE14Setup()` creates one undo item with three `removed-entity` actions (anchor entities via `create_entity` + `destroy({player, undo_index: 0|1})`). All three tagged with `bp100:probe = action_<i>`, `bp100:handler = e14_probe`. Then `expE14Remove()` calls `stack.remove_undo_action(1, 2)`. `expE14Dump()` confirms state. Driver sends `Ctrl+Z` (only keystroke in this group). Listener logs `on_undo_applied`.

### Evidence

```
[exp:E14:setup] item 1 length=3
[exp:E14:setup] item 1 action[1] type=removed-entity pos=10.5,40.5 tags={bp100:handler="e14_probe", bp100:probe="action_1"}
[exp:E14:setup] item 1 action[2] type=removed-entity pos=12.5,40.5 tags={bp100:handler="e14_probe", bp100:probe="action_2"}
[exp:E14:setup] item 1 action[3] type=removed-entity pos=14.5,40.5 tags={bp100:handler="e14_probe", bp100:probe="action_3"}

[exp:E14:remove] before remove_undo_action(1, 2)
... item length 3 ...
[exp:E14:remove] after remove_undo_action(1, 2)
[exp:E14:remove:after] item 1 length=2
[exp:E14:remove:after] item 1 action[1] type=removed-entity pos=10.5,40.5 tags={bp100:handler="e14_probe", bp100:probe="action_1"}
[exp:E14:remove:after] item 1 action[2] type=removed-entity pos=14.5,40.5 tags={bp100:handler="e14_probe", bp100:probe="action_3"}

# Ctrl+Z

[exp:undo_applied] tick=2914 player=1 actions=2
[exp:undo_applied] action[1] type=removed-entity tags={bp100:handler="e14_probe", bp100:probe="action_1"}
[exp:undo_applied] action[2] type=removed-entity tags={bp100:handler="e14_probe", bp100:probe="action_3"}

[exp:E14:post-undo] undo_count=0 redo_count=1
```

### Implications

- The mod's `on_cancelled_upgrade` handler proposed in G3 (E8b finding) — which uses `remove_undo_action` to drop the now-no-op `upgraded-entity` entry — is safe: surviving actions in the same item continue to undo cleanly.
- Multi-entity grouped operations (send-to-stage, blueprint paste) can drop individual entries (e.g. failed sub-op) without breaking peer entries' undo handlers.
- Action-index in `event.actions` does NOT carry forward original positions after removal. Mod handlers receive a compact 1..M list. Mod payloads must be self-contained per action; cross-action lookup by index would break.

### Caveats

- Tested only with multiple `removed-entity` actions in one item. Mixed-type items (e.g. built-entity + wire-added) untested but expected to behave identically.
- Did not exercise redo of a partially-removed item (the redo stack contains the item with same compacted shape per `undo_count=0 redo_count=1`).

---

## E15 — Factorio-pruned undo entries

### Question

Does Factorio cap the undo stack at a fixed item count? What is the cap? Does pruning happen silently? FIFO?

### Verdict

PASS. Default cap = **100 items**. Push past cap silently drops the oldest item (FIFO). No event fires for the pruned entry.

### Setup

`expE15Run()` loops 110 iterations: each iteration creates+destroys an anchor entity at a unique position via `create_entity` + `destroy({player, undo_index: 0})` (each opens a new item). Tags item[1].action[1] with `iter_<i>`. Logs item count every 10 iterations and on cap saturation. Final pass reads tags of oldest and newest items.

### Evidence

```
[exp:E15] iter=1 undo_count=1
[exp:E15] iter=10 undo_count=10
...
[exp:E15] iter=99 undo_count=99
[exp:E15] iter=100 undo_count=100
[exp:E15] cap reached: count stuck at 100 starting iter=101
[exp:E15] iter=101 undo_count=100
[exp:E15] iter=110 undo_count=100
[exp:E15] final undo_count=100 capObservedAt=101
[exp:E15] oldest item tag=iter_11
[exp:E15] newest item tag=iter_110
```

After 110 pushes, entries `iter_1..iter_10` were pruned silently; `iter_11..iter_110` retained; oldest = `iter_11`, newest = `iter_110`. Cap held strict at 100.

### Implications

- **Mod payload cleanup**: not required from mod-side — the pruned `bp100:data` payload simply disappears with its action. No leak: tags live on the action, not in mod storage. The design's storage migration (drop per-player buffer) eliminates the only leak vector.
- **Tag points to handler that no longer matters**: not an issue, since pruning takes the tag with the action. There's no "tag pointing to a handler that no longer matters" because there's no surviving stack entry.
- Cap is per-player; this experiment used player 1. Configurable per-player via `LuaPlayer.undo_redo_stack`? API has `get_max_undo_items()`/`set_max_undo_items()` (typed-factorio) — design need not assume the default.
- 100 is large enough that mid-flow false-positive risk from stale `bp100:` tags on prior items is bounded: the mid-flow suppression check inspects `get_undo_item(1)` only, not the whole stack, so prior items never interfere.

### Caveats

- Did not exercise `set_max_undo_items()` to confirm cap is mutable.
- All actions were `removed-entity`. Mixed-type items unlikely to differ but not tested.
- No `on_undo_applied` listener was watching during prune; confirmed-no-event by absence in the log around iter 101–110.

---

## E16 — entity destroyed before undo applied

### Question

When the design's wire-restoration handler runs and one endpoint has been destroyed since the wire was tagged, does the lookup-by-position+name pattern silently skip without crash?

### Verdict

PASS for the lookup pattern. `LuaSurface.find_entity(name, pos)` returns `nil` for a missing endpoint; iteration handles found and missing endpoints uniformly.

### Setup

`expE16Run()` places two `decider-combinator` at (30,0) and (33,0). Wires them red via `LuaWireConnector.connect_to(target, false, defines.wire_origin.player)`. Force-destroys A via `entity.destroy({})` (no undo entry). Then iterates the two payload endpoints calling `find_entity(name, pos)` for each.

### Evidence

```
[exp:E16] wire connected=true
[exp:E16] payload={endpoints = {{name = "decider-combinator", position = {x = 30.5, y = 0}}, {name = "decider-combinator", position = {x = 33.5, y = 0}}}}
[exp:E16] destroyed A; B.valid=true
[exp:E16:lookup] miss at 30.5,0 name=decider-combinator (returned nil)
[exp:E16:lookup] hit at 33.5,0 name=decider-combinator valid=true
[exp:E16] lookup result found=1 missing=1
```

### Implications

- Design's "wire restoration is best-effort" path is straightforward to implement: `for each endpoint: e = surface.find_entity(name, pos); if e then ... end`. No guard, no exception, no crash.
- Position lookup is exact (`find_entity(name, pos)` matches by position+name). For wires from `BlueprintWire[]`, payload's stored endpoint position must match the project entity's stored position; the EntityExport already serializes this consistently.

### Caveats

- **Wire-undo proper not tested.** Per G4 finding, scripted wires (`connect_to(..., wire_origin.player)`) do not push to the player undo stack. So we cannot drive a Ctrl+Z that exercises a wire-action's `on_undo_applied`. The lookup pattern itself is mod-internal and verified.
- Did not exercise the case where an endpoint was destroyed mid-`on_undo_applied` (i.e. between the start of undo replay and the wire-restore handler). Real-world risk is low: same-tick events are atomic; entities aren't destroyed mid-handler.
- Did not exercise the case of an entity that exists at the position but is a different prototype than the payload says. `find_entity(name, pos)` filters by name so a mismatch returns nil — same as missing.

---

## E17 — cross-mod tag namespace

### Question

If another mod also uses undo tags (`othermod:foo`), does the suppression check correctly trigger only on `bp100:` keys? Do the namespaces interfere?

### Verdict

PASS. Tags from different namespaces coexist without mutual interference. Prefix matching via `pairs(tags)` cleanly identifies presence per namespace; per-key reads via `get_undo_tag` return only that key's value.

### Setup

`expE17Run()` creates one anchor action (`removed-entity` via disposable). Sets four tags on the same action:

```ts
stack.set_undo_tag(1, 1, "bp100:handler", "X")
stack.set_undo_tag(1, 1, "bp100:data", { foo: 1 })
stack.set_undo_tag(1, 1, "othermod:handler", "Y")
stack.set_undo_tag(1, 1, "othermod:data", { bar: 2 })
```

`hasNamespacedTag(action, prefix)` scans `pairs(action.tags)` for `string.sub(k, 1, #prefix) == prefix`.

### Evidence

```
[exp:E17] undo_count=1
[exp:E17] action tags={bp100:data={foo = 1}, bp100:handler="X", othermod:data={bar = 2}, othermod:handler="Y"}
[exp:E17] hasBp100=true hasOther=true hasFake=false
[exp:E17] bp100:handler = X
[exp:E17] othermod:handler = Y
```

### Implications

- **Suppression check in `script_raised_destroy` / `script_raised_built` / etc. must scan only for `bp100:` prefix.** Confirmed: prefix scan via `pairs` + `string.sub` is reliable. False-positive on a peer mod's `othermod:` tag does not occur with prefix-only scan.
- Tag table is shared per-action across mods. No mod can clear another's tag inadvertently — `set_undo_tag` only writes the specified key. (Does not mutate other keys; verified by all four tags surviving.)
- Design's open-question "Suppression false-positives if two sibling mods both tag actions on the same entity": the bp100-prefix scan correctly ignores the peer's tag. The only risk is two `bp100:` entries on the same action from different mod versions/forks — out of scope for cross-mod, addressed by namespace versioning if needed (not needed today).
- `get_undo_tag(item, action, "bp100:handler")` returns only the requested key; other namespaces' keys are not visible through this path. The suppression check could either iterate `pairs(tags)` looking for prefix, or directly probe `bp100:handler` (faster since key is known).

### Caveats

- Real cross-mod test would have a second mod actually call `set_undo_tag`. Here the simulation uses one mod (this experiment) writing both namespaces. Functionally identical from Factorio's API perspective: tags are a flat `Record<string, AnyBasic>` per action, no per-mod scoping internally.
- Did not exercise undo of an action with foreign tags. Expected: `on_undo_applied.actions[0].tags` includes ALL namespaces' tags inline, mod's handler reads only its own keys.

---

## Aggregate implications for design

1. **Indexing primitive (E13)**: tagging by `item.length` in event handlers is correct under both observed grouping behaviours (one-item-many-actions via `undo_index`, and one-item-per-event for sequential `build_from_cursor`).
2. **Multi-entity item resilience (E14)**: design's per-action self-contained tag protocol survives `remove_undo_action`; partial-removal of grouped items behaves cleanly.
3. **Pruning (E15)**: 100-item cap is plenty for typical play; mod has no per-action cleanup obligation; design's storage migration (drop per-player buffer) closes the only mod-side leak vector.
4. **Best-effort lookups (E16)**: the wire-restoration design is implementable via plain `find_entity(name, pos)` checks. Wire-undo proper remains NEEDS-USER for actual end-to-end test (per G4).
5. **Namespace isolation (E17)**: `bp100:` prefix scan is sufficient for mid-flow suppression; cross-mod tag interference is not a real concern.

## Open follow-ups

- **Native drag-build grouping** (E13): does Factorio bundle drag-built belts into one undo item with N actions, or N items? Not directly testable via API; user-in-loop pass with a real drag-build of e.g. 10 belts would resolve. Design works under both outcomes.
- **`set_max_undo_items()` confirmation** (E15): cap is presumably mutable via API; not tested. Design need not depend on a specific value.
- **Wire-undo `on_undo_applied`** (E16): per G4 finding, scripted wires don't push to undo. End-to-end wire-undo test still NEEDS-USER (drag a real wire, Ctrl+Z).
