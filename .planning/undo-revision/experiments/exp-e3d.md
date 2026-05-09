---
summary: "Adding `minable` to a hidden simple-entity-with-owner makes the destroy/undo entry round-trip through redo. Resolves E3c failure."
date: 2026-05-02
tags: [factorio, undo, experiments, anchor, prototype]
---

# E3d: hidden simple-entity-with-owner round-trips when `minable` set

## Question

E3c established that all 5 working `simple-entity-with-owner` (SEW) variants
created an undo entry on `entity.destroy{raise_destroy=true, player=…}`,
but the redo arm always failed: post-undo recreated the entity, post-redo
left it in place (no destroy on redo). The E3c summary refuted hypotheses
about `hidden`, `collision_mask`, `flags`, and base type.

User hypothesis: the `minable` property is missing on the existing
`createHiddenEntity` prototype. Without `minable`, the engine may treat
the SEW as non-mineable and refuse to redo a destroy.

## Verdict

**CONFIRMED.** Adding `minable: { mining_time: 0.1 }` to a hidden SEW
makes destroy/undo/redo round-trip cleanly. All 3 minable variants
tested round-tripped; none of the 5 non-minable E3c variants did.

## Setup

3 prototypes added to `src/prototypes/entity-marker.ts` via a new
`createMinableHiddenEntity()` helper. Same baseline as `createHiddenEntity`
(hidden, empty collision_mask, `["player-creation","placeable-off-grid"]`)
plus `minable: { mining_time: 0.1 }`. Variants:

| Variant | Extra |
|---------|-------|
| `bp100_uf-M0` | minable only |
| `bp100_uf-M1` | minable + `selectable_in_game: true` |
| `bp100_uf-M2` | minable + `selectable_in_game: true` + `flags: ["player-creation"]` (no `placeable-off-grid`) |

Per-variant flow (driver = local kwin-mcp + UDP, factorio-test --graphics
--no-auto-start --enable-lua-udp=14441):

1. Setup: `surf.create_entity{raise_built=true}` then
   `entity.destroy{raise_destroy=true, player=playerIndex}`.
   Tag the resulting undo action with `bp100:data` + `bp100:handler`.
2. After-setup check: count live anchors on surface, dump stack.
3. Press **Ctrl+Z**.
4. Post-undo check.
5. Press **Ctrl+Y**.
6. Post-redo check.

Round-trip = `after=0, postUndo=1, postRedo=0`.

## Evidence (factorio-current.log, summary lines)

```
[exp:e3d] E3d summary bp100_uf-M0: after=0 postUndo=1 postRedo=0 roundTrip=true
[exp:e3d] E3d summary bp100_uf-M1: after=0 postUndo=1 postRedo=0 roundTrip=true
[exp:e3d] E3d summary bp100_uf-M2: after=0 postUndo=1 postRedo=0 roundTrip=true
```

Per-variant stack transitions confirm Ctrl+Y consumed the redo entry:

```
M0 after-setup undoCount=1 redoCount=0
M0 post-undo   undoCount=0 redoCount=1   <- entity restored
M0 post-redo   undoCount=1 redoCount=0   <- entity destroyed again
```

Same pattern for M1 / M2.

## Implication

The current production prototype `Prototypes.UndoReference` (and
`Prototypes.EntityMarker`, `Prototypes.StageReferenceData`) all share the
same `createHiddenEntity()` helper which is missing `minable`. All of
them will exhibit the E3c failure under the proposed tag-based undo
design (recreated on undo, but undestroyable on redo).

**Fix**: add `minable: { mining_time: 0.1 }` (any small non-nil value
should suffice; check `mining_time = 0` if a zero is permitted). Apply
to `createHiddenEntity` so all three downstream prototypes inherit it.

This unblocks the disposable-anchor strategy in `design.md` — the
existing helper just needs the prototype fix; no need to switch base type
to `container`/`electric-pole`.

## Caveats / open questions

- Did NOT test `minable: { mining_time: 0 }` (zero) — engine may reject
  zero-time mining. `0.1` is safe.
- All 3 round-tripped, but MUST verify the production helper change
  doesn't break existing user flows: the prior helper had `flags:
  ["player-creation","placeable-off-grid"]`, M2's narrower flag set
  (`["player-creation"]` only) also worked. Recommend keeping
  `placeable-off-grid` for off-grid placement freedom.
- Ctrl+Z worked only with the **default** keybind config. The user's
  customized config has `undo=ALT+Z`. Experiment infra must swap
  `config.ini` to default per skill instructions.

## Tooling note

Direct MCP gateway (`kwin_mcp_*` tools) is more reliable for this kind
of run than the `kwin-mcp-cli` FIFO+exec pattern: the CLI's session
detached after a single keystroke ("Broken pipe" on the EIS socket),
killing the wayland subsession and crashing the launched factorio with
"SDL_Error: wayland not available". Gateway-driven sessions stay alive
across many input events.
