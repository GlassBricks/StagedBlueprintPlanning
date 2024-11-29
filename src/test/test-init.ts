/* eslint-disable @typescript-eslint/no-require-imports */
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
import { createStageReference } from "../blueprints/stage-reference"
import { Events } from "../lib"
import { Migrations } from "../lib/migration"
import { debugPrint, getLastDebugPrintCall } from "../lib/test/misc"
import { getStageAtSurface } from "../project/project-refs"
import { UserProject } from "../project/ProjectDef"
import { deleteAllFreeSurfaces } from "../project/surfaces"
import { UndoHandler } from "../project/undo"
import { createUserProject } from "../project/UserProject"
import { teleportToProject } from "../ui/player-current-stage"
import { refreshCurrentProject } from "../ui/ProjectSettings"
import { getCurrentValues } from "../utils/properties-obj"

// better source map traceback
declare const ____lualib: {
  __TS__SourceMapTraceBack(this: void, fileName: string, sourceMap: SourceMap): void
}
interface SourceMap {
  [line: number]:
    | number
    | {
        line: number
        file: string
      }
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

declare const storage: {
  lastCompileTimestamp?: string
  printEvents?: boolean
  migrateNextTick?: boolean

  rerunMode?: "rerun" | "reload" | "none"
}

Events.on_player_created((p) => {
  game.get_player(p.player_index)?.toggle_map_editor()
  game.tick_paused = false
})

if ("factorio-test" in script.active_mods) {
  require("@NoResolution:test.in-world-test-util")
  function reinit() {
    for (const obj of rendering.get_all_objects(script.mod_name)) {
      obj.destroy()
    }
    const inventories = game.get_script_inventories(script.mod_name)[script.mod_name]
    if (inventories != nil) inventories.forEach((x) => x.destroy())
    const oldGlobal = storage
    // global = {}
    for (const [, player] of game.players) {
      const { screen, left, center, relative } = player.gui
      for (const gui of [screen, left, mod_gui.get_button_flow(player), center, relative]) {
        if (!gui) continue
        for (const child of gui.children) {
          if (child.get_mod() == script.mod_name) {
            child.destroy()
          }
        }
      }
      player.get_main_inventory()!.clear()
    }
    for (const [, surface] of game.surfaces) {
      if (surface.index != 1) game.delete_surface(surface)
    }
    Events.raiseFakeEventNamed("on_init", nil!)
    storage.rerunMode = oldGlobal.rerunMode
    storage.printEvents = oldGlobal.printEvents
  }

  commands.add_command("reinit", "", reinit)
  const tagBlacklist: string[] = []

  const testFiles = getProjectFilesMatchingRegex("\\.test\\.tsx?$")
  const testNames = testFiles.map((x) => string.gsub(x, "%.", "-")[0])
  testNames.push("test.misc-test")
  require("__factorio-test__/init")(testNames, {
    tag_blacklist: tagBlacklist,
    load_luassert: false,
    before_test_run() {
      reinit()
      storage.lastCompileTimestamp = lastCompileTime
      const force = game.forces.player
      force.enable_all_technologies()
      force.research_all_technologies()
      const player = game.players[1]
      if (player.controller_type != defines.controllers.editor) player.toggle_map_editor()

      deleteAllFreeSurfaces()
      getLastDebugPrintCall()
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

        const project = createUserProject("Test", 5)
        teleportToProject(player, project)

        setupManualTests(project)

        player.play_sound({ path: "utility/game_won" })

        player.cursor_stack?.clear()
        player.get_main_inventory()?.clear()
      }
    },
    log_passed_tests: false,
    sound_effects: true,
    // test_pattern: "integration%-test",
  } satisfies Partial<FactorioTest.Config>)
  if (__DebugAdapter && __DebugAdapter.breakpoint != nil) {
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
  if (storage.rerunMode == nil) storage.rerunMode = "rerun"
  if (storage.rerunMode == "none" || isTestsRunning()) return

  if (storage.migrateNextTick) {
    storage.migrateNextTick = nil
    Migrations.doMigrations(script.active_mods[script.mod_name]!)
  }

  const ticks = math.ceil((__DebugAdapter ? 8 : 2) * 60 * game.speed)
  const mod = game.ticks_played % ticks
  if (mod == 0) {
    storage.lastCompileTimestamp = lastCompileTime
    storage.migrateNextTick = true
    game.reload_mods()
  } else if (storage.lastCompileTimestamp != lastCompileTime && remote.interfaces["factorio-test"]?.runTests) {
    storage.lastCompileTimestamp = lastCompileTime
    game.print("Reloaded: " + lastCompileTime)
    if (storage.rerunMode == "rerun") {
      remote.call("factorio-test", "runTests")
    } else {
      refreshCurrentProject()
    }
  }
})
commands.add_command("rr", "", (e) => {
  const arg = e.parameter
  if (arg == "test") {
    storage.rerunMode = "rerun"
  } else if (arg == "only") {
    storage.rerunMode = "reload"
  } else if (arg == "off") {
    storage.rerunMode = "none"
  } else if (arg == nil) {
    if (storage.rerunMode == "none") game.reload_mods()
  } else {
    game.print("Expected 'test', 'only', 'off' or nothing")
  }
  game.print("Rerun mode: " + storage.rerunMode)
})

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function setupManualTests(_project: UserProject) {
  // const player = game.players[1]
  // function createEntityWithChanges() {
  //   const entity = createProjectEntityNoCopy(
  //     { name: "assembling-machine-1", recipe: "iron-gear-wheel" },
  //     Pos(0.5, 0.5),
  //     nil,
  //     2,
  //   )
  //   entity.applyUpgradeAtStage(3, "assembling-machine-2")
  //   entity._applyDiffAtStage(4, { recipe: "copper-cable" })
  //
  //   project.content.add(entity)
  //   updateWorldEntities(project, entity, 1, nil)
  //
  //   teleportToStage(player, project.getStage(4)!)
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

commands.add_command("print-bp-settings", "", () => {
  const player = game.player!
  const stage = getStageAtSurface(player.surface_index)
  if (!stage) return player.print("No stage at surface")

  const settings = getCurrentValues(stage.getBlueprintSettingsView())
  debugPrint(settings)
})

commands.add_command("createStageRef", "", (e) => {
  if (!e.player_index) return
  const player = game.get_player(e.player_index)!
  const stage = getStageAtSurface(player.surface_index)
  if (!stage) {
    player.print("Not in stage")
    return
  }

  createStageReference(player.cursor_stack!, stage)
})
