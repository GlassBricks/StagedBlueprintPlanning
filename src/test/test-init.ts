/*
 * Copyright (c) 2022-2023 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import * as mod_gui from "mod-gui"
import { UserAssembly } from "../assembly/AssemblyDef"
import { deleteAllFreeSurfaces } from "../assembly/surfaces"
import { UndoHandler } from "../assembly/undo"
import { createUserAssembly, getStageAtSurface } from "../assembly/UserAssembly"
import { destroyAllRenders, Events, shallowCompare } from "../lib"
import { Migrations } from "../lib/migration"
import { debugPrint } from "../lib/test/misc"
import { refreshCurrentAssembly } from "../ui/AssemblySettings"
import { teleportToAssembly } from "../ui/player-current-stage"
import { getCurrentValues } from "../utils/properties-obj"
import "./in-world-test-util"
import "./module-mock"

// better source map traceback
declare const ____lualib: {
  __TS__SourceMapTraceBack(this: void, fileName: string, sourceMap: SourceMap): void
}
interface SourceMap {
  [line: number]: number | { line: number; file: string }
}
{
  const oldSourceMapTraceBack = ____lualib.__TS__SourceMapTraceBack
  ____lualib.__TS__SourceMapTraceBack = function (fileName: string, sourceMap: SourceMap) {
    if (fileName.endsWith("-test.lua")) {
      const newFileName = fileName.slice(0, -9) + ".test.ts"
      for (const [k, v] of pairs(sourceMap)) {
        if (typeof v == "number") {
          sourceMap[k] = { file: newFileName, line: v }
        }
      }
    }
    oldSourceMapTraceBack(fileName, sourceMap)
  }
}

import lastCompileTime = require("last-compile-time")

declare let global: {
  lastCompileTimestamp?: string
  printEvents?: boolean
  migrateNextTick?: boolean

  rerunMode?: "rerun" | "reload" | "none"
}

if (script.active_mods["factorio-test"] != nil) {
  function reinit() {
    destroyAllRenders()
    const inventories = game.get_script_inventories(script.mod_name)[script.mod_name]
    if (inventories != nil) inventories.forEach((x) => x.destroy())
    const oldGlobal = global
    // global = {}
    for (const [, player] of game.players) {
      const { screen, left, center, relative } = player.gui
      for (const gui of [screen, left, mod_gui.get_button_flow(player), center, relative]) {
        if (!gui) continue
        for (const child of gui.children) {
          if (child.get_mod() == script.mod_name) {
            log("destorying gui: " + child.name)
            child.destroy()
          }
        }
      }
    }
    for (const [, surface] of game.surfaces) {
      if (surface.index != 1) game.delete_surface(surface)
    }
    Events.raiseFakeEventNamed("on_init", nil!)
    global.rerunMode = oldGlobal.rerunMode
    global.printEvents = oldGlobal.printEvents
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

  const testFiles = getProjectFilesMatchingRegex("\\.test\\.tsx?$")
  // replace . with -
  const testNames = testFiles.map((x) => string.gsub(x, "%.", "-")[0])
  testNames.push("test.misc-test")
  require("__factorio-test__/init")(testNames, {
    tag_blacklist: tagBlacklist,
    before_test_run() {
      reinit()
      global.lastCompileTimestamp = lastCompileTime
      const force = game.forces.player
      force.research_all_technologies()
      force.enable_all_recipes()
      const player = game.players[1]
      if (player.controller_type != defines.controllers.editor) player.toggle_map_editor()
    },
    after_test_run() {
      // game.speed = __DebugAdapter ? 1 : 1 / 6
      const result = remote.call("factorio-test", "getResults") as {
        status?: "passed" | "failed" | "todo"
        skipped: number
      }
      if (result.status == "passed" && result.skipped == 0) {
        game.surfaces[1].clear()
        const player = game.players[1]
        player.gui.screen["factorio-test-test-gui"]?.destroy()

        deleteAllFreeSurfaces()

        const assembly = createUserAssembly("Test", 5)
        teleportToAssembly(player, assembly)

        setupManualTests(assembly)

        player.play_sound({ path: "utility/game_won" })
      }
    },
    log_passed_tests: false,
    sound_effects: true,
    // test_pattern: "integration%-test",
  } satisfies Partial<FactorioTest.Config>)
  if (__DebugAdapter) {
    tagBlacklist.push("after_mod_reload")
  }
}

// auto test rerunning

function isTestsRunning() {
  if (remote.interfaces["factorio-test"]?.isRunning) {
    return remote.call("factorio-test", "isRunning") || remote.call("factorio-test", "getTestStage") == "NotRun"
  }
  return true
}

Events.on_tick(() => {
  if (global.rerunMode == nil) global.rerunMode = "rerun"
  if (global.rerunMode == "none" || isTestsRunning()) return

  if (global.migrateNextTick) {
    global.migrateNextTick = nil
    Migrations.doMigrations(script.active_mods[script.mod_name])
  }

  const ticks = math.ceil((__DebugAdapter ? 20 : 5) * 60 * game.speed)
  const mod = game.ticks_played % ticks
  if (mod == 0) {
    global.lastCompileTimestamp = lastCompileTime
    global.migrateNextTick = true
    game.reload_mods()
  } else if (global.lastCompileTimestamp != lastCompileTime && remote.interfaces["factorio-test"]?.runTests) {
    global.lastCompileTimestamp = lastCompileTime
    game.print("Reloaded: " + lastCompileTime)
    if (global.rerunMode == "rerun") {
      remote.call("factorio-test", "runTests")
    } else {
      refreshCurrentAssembly()
    }
  }
})
commands.add_command("rerun", "", () => {
  global.rerunMode = "rerun"
})
// noinspection SpellCheckingInspection
commands.add_command("ronly", "", () => {
  global.rerunMode = "reload"
})
commands.add_command("norerun", "", () => {
  global.rerunMode = "none"
})
commands.add_command("rr", "", () => {
  game.reload_mods()
})

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function setupManualTests(_assembly: UserAssembly) {
  // const player = game.players[1]
  // function createEntityWithChanges() {
  //   const entity = createAssemblyEntity(
  //     { name: "assembling-machine-1", recipe: "iron-gear-wheel" },
  //     Pos(0.5, 0.5),
  //     nil,
  //     2,
  //   )
  //   entity.applyUpgradeAtStage(3, "assembling-machine-2")
  //   entity._applyDiffAtStage(4, { recipe: "copper-cable" })
  //
  //   assembly.content.add(entity)
  //   updateWorldEntities(assembly, entity, 1, nil)
  //
  //   teleportToStage(player, assembly.getStage(4)!)
  //   player.opened = entity.getWorldEntity(4)
  // }
  //
  // createEntityWithChanges()
}

const TestUndo = UndoHandler<string>("in-world-test", (player, data) => {
  player.print(`Test undo: ${data}`)
})

commands.add_command("test-undo", "", (e) => {
  const player = game.player!
  const param = e.parameter ?? "no param"
  TestUndo.register(player, param)
  player.print(`Setup undo with: ${param}`)
})

Events.on_built_entity((e) => {
  if (e.created_entity.valid && e.created_entity.name == "assembling-machine-3") {
    const player = game.get_player(e.player_index)!
    player.request_translation(["bp100-undo-later-test"])
    // registerUndo(player, "built")
  }
})

Events.on_string_translated((e) => {
  if (shallowCompare(e.localised_string, ["bp100-undo-later-test"])) {
    const player = game.get_player(e.player_index)!
    TestUndo.register(player, "build after translation")
  }
})

commands.add_command("print-bp-settings", "", () => {
  const player = game.player!
  const stage = getStageAtSurface(player.surface.index)
  if (!stage) return player.print("No stage at surface")

  // const settings = getCurrentValues(stage.stageBlueprintSettings)
  const settings = getCurrentValues(stage.getBlueprintSettingsView())

  // player.print(serpent.block(settings))
  debugPrint(settings)
})
