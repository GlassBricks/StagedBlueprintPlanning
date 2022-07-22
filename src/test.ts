import { Events } from "./lib"

declare function __getTestFiles(): string[]
import lastCompileTime = require("last-compile-time")

declare let global: {
  lastCompileTimestamp?: string
}

if (script.active_mods.testorio) {
  function reinit() {
    const inventories = game.get_script_inventories(script.mod_name)[script.mod_name]
    if (inventories) inventories.forEach((x) => x.destroy())
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
      global.lastCompileTimestamp = lastCompileTime
      const force = game.forces.player
      force.research_all_technologies()
      force.enable_all_recipes()
    },
    after_test_run() {
      game.speed = __DebugAdapter ? 1 : 1 / 6
    },
    log_passed_tests: false,
    sound_effects: true,
  } as Testorio.Config)
  if (__DebugAdapter) {
    tagBlacklist.push("after_mod_reload")
  }
}

function isTestsRunning() {
  if (remote.interfaces.testorio?.isRunning) {
    return remote.call("testorio", "isRunning") || remote.call("testorio", "getTestStage") === "NotRun"
  }
  return true
}

Events.on_tick(() => {
  const ticks = math.ceil((__DebugAdapter ? 15 : 3) * 60 * game.speed)
  const mod = game.ticks_played % ticks
  if (mod === 0) {
    // tests not running or not ready
    if (!isTestsRunning()) {
      global.lastCompileTimestamp = lastCompileTime
      game.reload_mods()
    }
  } else if (mod === 1) {
    if (!isTestsRunning() && global.lastCompileTimestamp !== lastCompileTime && remote.interfaces.testorio?.runTests) {
      game.print("Rerunning: " + lastCompileTime)
      remote.call("testorio", "runTests")
    }
  }
})
