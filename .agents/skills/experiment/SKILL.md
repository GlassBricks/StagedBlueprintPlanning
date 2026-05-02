---
name: experiment
description: 
  "Run an interactive Factorio experiment to verify how the game actually
  behaves, typically to resolve open questions about Factorio's API, event
  ordering, or any runtime behavior that can't be confirmed by reading
  docs/code; that requires actions in-game." 
---

# Experiment

Run a Factorio experiment to confirm runtime behavior.
Goal: instrument → launch → drive scenario → inspect log → conclude.

Two modes:

- **User-in-loop**: agent launches; user does in-game actions; agent reads
  log. Default.
- **Automated**: agent drives Factorio end-to-end via local tooling
  (window launcher + input injection + log reading). Requires per-machine
  setup. Look for presence of file `./local-automation.md` for setup instructions.

## Related infrastructure: `src/test/debug-commands.ts`

Loaded in debug (not release) builds. Provides facilities:

- **Ready signal**: `on_init` / `on_load` log `[exp:ready] on_init` /
  `[exp:ready] on_load`. Poll for this tag to wait for startup.
- **UDP remote console**: when launched with `--enable-lua-udp=<port>`,
  every incoming UDP packet is `load()`ed and run as Lua. Outcome tagged
  `[exp:udp] recv|ok|result|compile-error|run-error` in
  `factorio-current.log`.

### UDP exec scope

- Chunk's `_ENV` is the global table. Locals from TSTL files (`import`s,
  module-level `let`/`const`, `function foo() {}`) are NOT visible.
- `require()` is blocked at runtime by Factorio ("Require can't be used
  outside of control.lua parsing"). Workaround:
  `package.loaded["__bp100__/path/to/file.lua"]` — forward slashes,
  `.lua` suffix. Key = source `.lua` file, not a re-export aggregator:
  e.g. `__bp100__/lib/event.lua` is empty (just re-exports);
  `Events.register` lives in `__bp100__/lib/Events.lua`.
- To expose helpers from an experiment file: `declare global { let foo }`
  - bare assignment (`foo = () => ...`). TSTL emits a Lua global write.
    `function foo() {}` syntax compiles to `local function` and is
    invisible to UDP.
- Factorio has no API to invoke `commands.add_command` handlers from
  Lua. `commands.commands` exposes names + help only. For automated
  flows, expose setup/finish as global functions, not commands.

## Workflow

### 0. Check for local automation.md

Look for file `./local-automation.md`. Read if present.
This contains instructions for how agent can run workflow end to end.
If its possible to do the experiment by yourself without user input,
follow these instructions, and (Automated mode) section below.

### 1. Frame the questions

- **Hypothesis** to confirm/refute, or data to gather.
- **Observable signal** distinguishing outcomes (event order, return
  value, visible state).
- **Action sequence** producing the signal — minimal in-game actions.

Group related questions. One run can do multiple experiments.

### 2. Design instrumentation

**Bias toward automation.** Anything scriptable via runtime API should
be a command/script, not a manual step.

Ideal user-in-loop flow:

1. Run `/exp-<scenario>-setup` (places entities, primes state, etc).
2. Perform the one or two truly interactive things (e.g. `Ctrl+Z`).
3. Run `/exp-<scenario>-done`

Per scenario, consider adding:

- **Setup/finish entrypoint** — two patterns:
  - **User-in-loop**: `commands.add_command("exp-foo-setup", ...)`.
    Player types `/exp-foo-setup` in chat. Only invocation path.
  - **Automated**: expose as Lua global. UDP calls directly.

    ```ts
    declare global {
      let expSetup: (this: void) => void
      let expFinish: (this: void) => void
    }
    expSetup = () => {
      /* ... */ log("[exp] setup done")
    }
    expFinish = () => {
      /* ... */ log("[exp] finish done")
    }
    ```

    UDP: `echo -n 'expSetup()' | nc -uw0 127.0.0.1 14434`.

- **Event listeners** — via `Events.register` or `Events.registerEarly`
  (early when you need to see events before normal mod handlers).
- **Custom logic**: state tracking, logic, event handlers that run only between setup and done, etc.

Logging:

- `log(...)` writes to `factorio-test-data-dir/factorio-current.log`.
  `game.print(...)` is chat only.
- Prefix `[exp]` for grep.
- Consider including: `game.tick`, event name, identifying fields (`position`,
  `name`, `unit_number`).
- Dump complex tables with `serpent.dump(value)`.
- Log MORE than seems necessary. Re-running is slow.
- Throwaway code: global vars fine; no need to plumb through `storage`.

### 3. Implement

Create `src/test/experiments/<slug>.ts`. Import it in
`src/test/test-init.ts`. Don't name the file `*.test.ts` — auto-registers
as a test module.

For UDP-callable helpers, use `declare global { let foo }` + assignment
(`foo = () => ...`). `function foo() {}` syntax compiles to `local
function` and won't be reachable from UDP.

### 4. Launch

```bash
pnpm run test --graphics --no-auto-start --factorio-args --enable-lua-udp=14434
```

`--graphics` opens interactive Factorio. `--no-auto-start` skips test
execution; player lands in editor world. `--enable-lua-udp=14434` opens
UDP for remote console (harmless for user-in-loop too). The `pretest`
hook runs `tstl` first.

Wait for ready signal:

```bash
until grep -q '\[exp:ready\]' factorio-test-data-dir/factorio-current.log; do
  sleep 2
done
```

In **user-in-loop** mode, run this command in the background (e.g. via tmux
session) so the GUI stays up while the agent continues. In **automated** mode,
see `local-automation.md` instructions.

### 5. Drive the scenario

**User-in-loop.** Brief the user:

> Factorio is launching. When the game window is up:
>
> 1. Run `/exp-foo-setup`.
> 2. Press `Ctrl+Z`.
> 3. Run `/exp-foo-done`.
> 4. Tell me when done.
>    <concise summary of experiment setup, what we we're looking for>

Keep manual steps minimal and explicit.

**Automated.** Send Lua via UDP for everything scriptable; fall back to
synthesized input only for actions with no API equivalent (e.g.
`Ctrl+Z`).

### 6. Inspect the log/data

Inspect `./factorio-test-data-dir/factorio-current.log`. Match against
hypothesis. If signals missing or ambiguous: tell the user, iterate.

### 7. Iterate

- Kill old factorio instance.
- Revise experiment code.
- Back to step 5.

### 8. Conclude

Write findings to `_research/<descriptive-name>.md` (unless specified otherwise).
Include, per question:

- Hypothesis/question tested
- Verdict/result
- Brief test setup description
- Evidence observed

### 9. Cleanup

- Kill factorio session.
- Delete `src/test/experiments/<slug>.ts` and its import
- Restore any swapped config (see "Default keybindings" below).

## Notes

- Log path: `factorio-test-data-dir/factorio-current.log` (relative to
  project root). Created by factorio-test on first launch.
- `before_test_run` in `test-init.ts` does editor/surface setup for
  normal runs; `--no-auto-start` skips it. Initial state: fresh save,
  one non-editor player on surface 1. Setup command must enter editor
  if needed.

# Automated mode

Replace user-in-loop with local tooling that can:

1. Launch a graphical Factorio window from a shell command.
2. Send keystrokes / mouse clicks to that window.
3. Read files in the repo.

The mechanism may be machine-specific. **If `local-automation.md` exists in this
skill directory, read it first** — it contains the concrete launcher, and
instructions for running on this machine.

If `local-automation.md` is absent, fall back to user-in-loop.

## When automation is feasible

- **Use when:** scenario is reachable via console commands and/or vanilla
  keyboard/mouse input (incl. `Ctrl+Z`, `Ctrl+Alt+E`, hotbar keys).
- **Skip when:** scenario needs precise mouse gestures tied to specific
  world tiles. Screen↔world coord translation is fragile. Fall back to
  user-in-loop.

Still try to script via API first. Pure-API
not always possible (`Ctrl+Z` undo has no API equivalent).

## Default keybindings (for keystroke flows)

User's `factorio-test-data-dir/config.ini` may customize keybindings.
Swap in defaults for the run, restore after:

```bash
# 1. Back up
cp factorio-test-data-dir/config.ini factorio-test-data-dir/config.ini.user-backup

# 2. Delete; factorio-test cli regenerates a minimal stub
rm factorio-test-data-dir/config.ini

# 3. Trigger regeneration (headless filter matching nothing)
pnpm exec factorio-test run --bail 1 -q "z%-nomatch" >/dev/null 2>&1

# 4. ... run experiment ...

# 5. Restore at end
mv factorio-test-data-dir/config.ini.user-backup factorio-test-data-dir/config.ini
```

**Always restore on exit, even on crash.** If
`config.ini.user-backup` exists at the start of a run, a previous run
didn't clean up. Restore it before doing anything else.

## Sending input

Method 1: UDP for Lua (always preferred):

```bash
echo -n '<lua source>' | nc -uw0 127.0.0.1 14434
```

Prefer calling pre-exposed `exp*` globals (see step 3) over inlining
setup logic in every packet. Cuts payload size, makes re-runs cheap,
and keeps experiment Lua under version control.

For cross-packet state, stash on `_G`: one packet writes
`_G.expProj = ...`, a later packet reads it. Survives until save
reload.

Method 2: Key/mousestrokes for actions with no API. Default
config: `` ` `` opens command mode. Send `` ` ``, then a
line starting with `/sc` (silent command) or `/c`, then Enter:

```
type:  `
type:  /sc log("[exp] hello")
press: Return
```

After Enter, focus returns to world. Next command needs another `` ` ``.

## General gotchas

- **`Escape` outside chat opens pause menu.**
- **Mouse click in editor world may trigger build/destroy** if cursor
  has an item. Mid-screen on empty editor usually safe.
- **`--no-auto-start` skips `before_test_run`.** Initial state: surface
  1, one non-editor player. Setup should enter editor if needed.
- **Synthesized printable-char keystrokes are flaky on many input
  stacks.** Prefer "type a string" primitives over per-key sends. Modifier
  combos (`ctrl+z`, `Return`, `Escape`) are usually fine.
- **Don't rely on window-listing/focus APIs** to find the Factorio
  window — SDL/OpenGL apps often don't expose accessibility. If you need
  focus, click into the window's screen region.
- **Factorio's script log goes to `factorio-current.log`, NOT the
  launcher's stdout/stderr.** Inspect via `bash` + `grep`. Don't rely
  on launcher-side log-reading tools.
- **Launcher session-stop primitives may kill the factorio child.**
  Don't rely on the factorio process surviving session teardown.
- **`bash -lc 'cmd1 && cmd2'` may exit before children finish.** Use
  `exec` on the final command (`bash -lc 'cd <dir> && exec <cmd>'`)
  when wrapping a long-running launch.
