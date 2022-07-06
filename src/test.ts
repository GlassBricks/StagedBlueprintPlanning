import { Events } from "./lib"

declare function __getTestFiles(): string[]

declare let global: unknown

if (script.active_mods.testorio) {
  function reinit() {
    const inventories = game.get_script_inventories(script.mod_name)[script.mod_name]
    if (inventories) inventories.forEach((x) => x.destroy())
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    global = {}
    Events.raiseFakeEventNamed("on_init", nil)
  }

  commands.add_command("reinit", "", reinit)

  let testsStarted = false
  Events.on_game_created_from_scenario(() => {
    testsStarted = true
  })
  Events.on_player_created((p) => {
    if (!testsStarted) return
    game.get_player(p.player_index)?.toggle_map_editor()
    game.tick_paused = false
  })

  const tagBlacklist: string[] = []

  require("__testorio__/init")(__getTestFiles(), {
    tag_blacklist: tagBlacklist,
    before_test_run() {
      reinit()
      const force = game.forces.player
      force.enable_all_recipes()
    },
    after_test_run() {
      // const results = remote.call("testorio", "getResults")
      // if (results.status === "passed" && results.skipped === 0) {
      // }
      game.players[1]?.gui.screen["testorio:test-config"]?.bring_to_front()
    },
    log_passed_tests: false,
  } as Testorio.Config)
  if (__DebugAdapter) {
    tagBlacklist.push("after_mod_reload")
  }
}
