---
summary: "Resume state for tag-based undo experiments. G3 done; G1/G2/G4/G5/G6 partial — scaffolding present, no findings."
date: 2026-05-02
tags: [factorio, undo, experiments, resume]
---

# Experiments progress — resume here

Plan in [experiments.md](./experiments.md). 17 experiments split into
6 groups dispatched as parallel worktree subagents.

## Status

| Group | Branch | Worktree | Port | Experiments | Status | Findings |
|---|---|---|---|---|---|---|
| G1 foundations | `undo-rev-exp-foundations` | `~/src/StagedBlueprintPlanning.undo-rev-exp-foundations` | 14434 | E1, E2, E3 | **scaffolded, not run** | — |
| G2 rotation | `undo-rev-exp-rotation` | `~/src/StagedBlueprintPlanning.undo-rev-exp-rotation` | 14435 | E4, E5 | **scaffolded, not run** | — |
| G3 settings-upgrade | `undo-rev-exp-settings-upgrade` | `~/src/StagedBlueprintPlanning.undo-rev-exp-settings-upgrade` | 14436 | E6, E8 | ✅ **DONE** (commit `af53def`) | `_research/exp-settings-upgrade.md` |
| G4 wires-tiles | `undo-rev-exp-wires-tiles` | `~/src/StagedBlueprintPlanning.undo-rev-exp-wires-tiles` | 14437 | E7, E9 | partial — Factorio launched but Ctrl+Z phase not reached; some E9 evidence in `factorio-current.log` | — |
| G5 paste | `undo-rev-exp-paste` | `~/src/StagedBlueprintPlanning.undo-rev-exp-paste` | 14438 | E10, E11, E12 | **scaffolded, not run** | — |
| G6 edges | `undo-rev-exp-edges` | `~/src/StagedBlueprintPlanning.undo-rev-exp-edges` | 14439 | E13–E17 | **scaffolded, not run** | — |

### G3 (DONE) verdicts

| Exp | Verdict | Note |
|---|---|---|
| E6A | PASS | `LuaEntity.copy_settings(src, by_player=p)` registers tagged `copy-entity-settings` undo action; round-trips |
| E6B | NEEDS-USER | Blueprint shift+lclick paste — no scriptable trigger |
| E8a | PASS | `order_upgrade{...,player=p}` registers tagged `upgraded-entity`; round-trips |
| E8b | FAIL→insight | `cancel_upgrade(force, player)` does NOT push new entry; mutates the prior `upgraded-entity` action into a no-op (`target.name == original_name`); stale tag remains. **Design needs new operation row + `on_cancelled_upgrade` handler that clears the tag or removes the now-no-op action via `remove_undo_action`.** |

### G4 (partial) — preserved evidence in worktree log

`factorio-test-data-dir/factorio-current.log` has:

| Probe | Result |
|---|---|
| `LuaWireConnector.connect_to(target, false, defines.wire_origin.player)` | returns `true`, NO `wire-added` undo action created |
| `LuaWireConnector.disconnect_from(..., wire_origin.player)` | returns `true`, NO `wire-removed` undo action |
| `surface.set_tiles([{concrete, pos}], ..., player, undo_index=0)` | registers `built-tile`, taggable, `previous_tile`/`new_tile` populated |
| `surface.set_tiles([{grass-1, pos}], ..., player, undo_index=0)` over concrete | registers another `built-tile` (NOT `removed-tile`); previous=concrete, new=grass-1 |
| `on_player_built_tile`/`on_player_mined_tile` during `set_tiles` | DID NOT FIRE (set_tiles bypasses player tile events) |
| Mid-flow event ordering during Ctrl+Z | NOT TESTED (no input injection done) |

**Key implication:** wires (E7) confirmed needs-user. Tiles (E9) shows
`set_tiles` skips player tile events — design's mid-flow concern for tiles
may be moot when using set_tiles, but live player tile placement still
needs verification.

## Worktree state

Per-worktree uncommitted scaffolding (recoverable on resume):

- **foundations**: `src/test/experiments/foundations.ts`,
  `src/test/test-init.ts` (import added),
  `src/prototypes/entity-marker.ts` (E3 anchor prototype added),
  `scripts/run-foundations-exp.sh` (working driver template).
- **rotation**: `src/test/experiments/rotation.ts`, test-init.ts import.
- **wires-tiles**: `src/test/experiments/wires-tiles.ts`, test-init.ts
  import. `factorio-test-data-dir/factorio-current.log` has the partial
  evidence above. `factorio-test-data-dir/config.ini.user-backup` exists.
- **paste**: `src/test/experiments/paste.ts`, test-init.ts import,
  `src/prototypes/entity-marker.ts` (anchor prototype added).
- **edges**: `src/test/experiments/edges.ts`, test-init.ts import,
  `_scratch/run-edges.sh` driver attempt.

`config.ini.user-backup` is the user's own keybind config. If `config.ini`
got swapped to defaults, restore from `.user-backup` before running tests
normally.

## Learnings (load-bearing for resume)

### Subagent MCP access

**Subagents launched via Agent tool do NOT inherit MCP servers.** No
`mcp__kwin-mcp__*` tools, no `mcp` gateway tool. They only have basic
tools (bash, edit, find, grep, ls, read, write).

Path forward: use `kwin-mcp-cli` (CLI front-end) at
`/home/ben/.nix-profile/bin/kwin-mcp-cli`. Reads commands from stdin,
one per line. Pattern:

```bash
mkfifo /tmp/kwin-fifo.$$
kwin-mcp-cli > /tmp/kwin-out.log 2>&1 < /tmp/kwin-fifo.$$ &
exec 5>/tmp/kwin-fifo.$$
printf 'session_start screen_width=1920 screen_height=1080\n' >&5
printf 'launch_app command="bash -lc ..." env={"SDL_VIDEODRIVER":"wayland","DISPLAY":""}\n' >&5
printf 'mouse_click x=600 y=540\n' >&5
printf 'keyboard_key key=ctrl+z\n' >&5
printf 'session_stop\n' >&5
printf 'quit\n' >&5
```

### Working driver script reference

`~/src/StagedBlueprintPlanning.undo-rev-exp-foundations/scripts/run-foundations-exp.sh`
has a complete, working pattern: FIFO + flock + trap cleanup + wait_log
for `[exp:ready]` + per-experiment Ctrl+Z/Ctrl+Y/UDP cycle + session_stop.

G3's success used the same approach (its driver was cleaned up post-run).

### Bash tool timeout

The bash tool has a default ~600s timeout that **will kill in-progress
Factorio runs**. G1 hit this. For driver scripts longer than ~5min:

```bash
tmux new-session -d -s expdrv "bash $REPO/scripts/run-<group>-exp.sh > /tmp/<group>-driver.log 2>&1"
# poll progress in short bash calls
grep -E '\[driver\]|\[exp' /tmp/<group>-driver.log | tail -30
```

Pi's `bash` tool also accepts `timeout` param — set to e.g. 1800 if you
prefer foreground over tmux. tmux + poll is more flexible.

### Display lock and concurrency

`/tmp/factorio-exp-display.lock` serializes Factorio runtime across peer
agents. Use `flock -x -w 1800 9` (timeout) and `trap` for safe release.

In the failed run, two agents (G2, G4) bypassed kwin-mcp and launched
Factorio directly via `pnpm run test --graphics` — windows surfaced on
the user's real desktop. The lock didn't prevent this because they
acquired it then launched outside kwin-mcp's virtual session.

**Mitigation in next dispatch:** mandate that the driver script's
`launch_app` command go ONLY through kwin-mcp-cli's `launch_app`. Never
invoke Factorio binary or `pnpm run test --graphics` from anywhere else
in the script.

### kwin-mcp-cli interactive vs flag

`kwin-mcp-cli --default-live-session` uses real desktop instead of
virtual. Do NOT pass this flag in the experiment driver — must be
virtual.

## Resume plan

For each remaining group (G1, G2, G4, G5, G6) redispatch a subagent with:

1. Worktree path
2. Group slug + experiments + UDP port
3. **Hard rule: launch Factorio ONLY via kwin-mcp-cli `launch_app`. Never
   directly. Never with `pnpm run test --graphics` from bash.**
4. Reference G1's driver script for the pattern.
5. Tmux + poll for the driver run.
6. Reuse uncommitted scaffolding in worktree if useful.
7. Standard cleanup + commit per skill.

Concurrency: 5 subagents OK. Lock will serialize the live phase;
prep parallelizes. Keep flock timeout ≤ 30 min per holder. Strict
trap-on-exit lock release.

A redispatch preamble draft is saved at `/tmp/redispatch-preamble.md`
(may have been removed by `/tmp` cleanup; recreate from this doc's
"Learnings" section as needed).

### Suggested per-group prompt skeleton

```
WORKTREE: /home/ben/src/StagedBlueprintPlanning.undo-rev-exp-<slug>
GROUP: <slug>
EXPERIMENTS: <E#s>
UDP PORT: <port>

Read first:
- .agents/skills/experiment/SKILL.md
- .agents/skills/experiment/local-automation.md
- .planning/undo-revision/experiments.md (your specs only)
- .planning/undo-revision/design.md (relevant rows)
- .planning/undo-revision/experiments-progress.md (this file — learnings,
  prior partial state)
- ~/src/StagedBlueprintPlanning.undo-rev-exp-foundations/scripts/run-foundations-exp.sh
  (working driver template)

Hard rules (see learnings):
1. Subagents have NO mcp gateway. Use kwin-mcp-cli (CLI front-end).
2. NEVER launch Factorio outside kwin-mcp-cli's launch_app.
3. Long driver runs in tmux; poll log; don't rely on bash 600s timeout.
4. flock -x -w 1800 on /tmp/factorio-exp-display.lock; trap for release.
5. NO USER INPUT — needs-user verdict permitted.

Workflow / Cleanup / Findings format / Commit / NO MERGE — per skill.
```

## Coordinator action items on resume

1. Confirm system clean: no factorio procs, no held lock, no tmux.
2. Optionally revert uncommitted scaffolding in each worktree
   (`git stash` or `git restore .` + `git clean -fd`) before redispatch
   if you want fresh starts. Otherwise, agents reuse.
3. Decide concurrency (5 simultaneous OK; serial = safer).
4. Redispatch G1, G2, G4, G5, G6.
5. After all return: aggregate findings into a single `_research/`
   summary on the `undo-revision` branch; update `design.md` with
   confirmed/refuted assumptions and the new E8b cancel-upgrade row.
6. Branch cleanup (`wt merge` or just keep findings + `wt remove`).

## Cleanup if abandoning experiments

If you decide not to resume:

- `git worktree remove --force ~/src/StagedBlueprintPlanning.undo-rev-exp-<slug>`
  for each (rotation, foundations, wires-tiles, paste, edges).
- `git branch -D undo-rev-exp-<slug>` for each.
- Keep `undo-rev-exp-settings-upgrade` (G3 findings useful) — cherry-pick
  its findings commit onto `undo-revision` then remove worktree.
