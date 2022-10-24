/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of 100% Blueprint Planning.
 *
 * 100% Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * 100% Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with 100% Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { UserAssembly } from "../assembly/AssemblyDef"
import { createUserAssembly } from "../assembly/UserAssembly"
import { WorldUpdater } from "../assembly/WorldUpdater"
import { createAssemblyEntity } from "../entity/AssemblyEntity"
import { destroyAllRenders, Events } from "../lib"
import { Pos } from "../lib/geometry"
import { openAssemblySettings } from "../ui/AssemblySettings"
import { teleportToStage } from "../ui/player-current-stage"

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
        if (typeof v === "number") {
          sourceMap[k] = { file: newFileName, line: v }
        }
      }
    }
    oldSourceMapTraceBack(fileName, sourceMap)
  }
}

declare function __getTestFiles(): string[]
import lastCompileTime = require("last-compile-time")

declare let global: {
  lastCompileTimestamp?: string
}

if (script.active_mods.testorio !== nil) {
  function reinit() {
    destroyAllRenders()
    const inventories = game.get_script_inventories(script.mod_name)[script.mod_name]
    if (inventories !== nil) inventories.forEach((x) => x.destroy())
    global = {}
    for (const [, player] of game.players) {
      const { screen, left, top, center, relative } = player.gui
      for (const gui of [screen, left, top, center, relative]) {
        for (const child of gui.children) {
          if (child.get_mod() === script.mod_name) child.destroy()
        }
      }
    }
    for (const [, surface] of game.surfaces) {
      if (surface.index !== 1) game.delete_surface(surface)
    }
    Events.raiseFakeEventNamed("on_init", nil!)
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
      const player = game.players[1]
      if (player.controller_type !== defines.controllers.editor) player.toggle_map_editor()
    },
    after_test_run() {
      // game.speed = __DebugAdapter ? 1 : 1 / 6
      const result = remote.call("testorio", "getResults") as { status?: "passed" | "failed" | "todo"; skipped: number }
      if (result.status === "passed" && result.skipped === 0) {
        game.surfaces[1].clear()
        const player = game.players[1]
        player.gui.screen["testorio:test-progress"]?.destroy()

        const assembly = createUserAssembly("Test", 5)
        openAssemblySettings(player, assembly)

        setupManualTests(assembly)
      }
    },
    log_passed_tests: false,
    sound_effects: true,
    // test_pattern: "integration%-test",
  } as Testorio.Config)
  if (__DebugAdapter) {
    tagBlacklist.push("after_mod_reload")
  }
}

// auto test rerunning

function isTestsRunning() {
  if (remote.interfaces.testorio?.isRunning) {
    return remote.call("testorio", "isRunning") || remote.call("testorio", "getTestStage") === "NotRun"
  }
  return true
}
let shouldTryRerun = true

Events.on_tick(() => {
  if (!shouldTryRerun) return
  const ticks = math.ceil((__DebugAdapter ? 12 : 3) * 60 * game.speed)
  const mod = game.ticks_played % ticks
  if (isTestsRunning()) return
  if (mod === 0) {
    // tests not running or not ready
    global.lastCompileTimestamp = lastCompileTime
    game.reload_mods()
  } else if (global.lastCompileTimestamp !== lastCompileTime && remote.interfaces.testorio?.runTests) {
    game.print("Rerunning: " + lastCompileTime)
    remote.call("testorio", "runTests")
  }
})
commands.add_command("norerun", "", () => {
  shouldTryRerun = false
})
/*{
  let lastEventTick = 0
  let count = 0
  const eventBlacklist = newLuaSet<keyof typeof defines.events>(
    "on_tick",
    "on_player_changed_position",
    // "on_selected_entity_changed",
    "on_chunk_charted",
    "on_chunk_generated",
    "on_player_main_inventory_changed",
    "on_gui_location_changed",
    "on_gui_click",
    "on_research_finished",
    "script_raised_set_tiles",
  )
  for (const [name, key] of pairs(defines.events)) {
    if (eventBlacklist.has(name)) continue
    Events.on(key, () => {
      // if (isTestsRunning()) return
      const currentTick = game.tick
      if (currentTick !== lastEventTick) {
        // game.print(currentTick)
        count = 0
      }
      lastEventTick = currentTick
      count++
      game.print(`(${(game.tick % 1000).toString().padStart(3, " ")}) ${count.toString().padStart(2, "0")}: ${name}`)
    })
  }
  // shouldTryRerun = false
}*/

function setupManualTests(assembly: UserAssembly) {
  const player = game.players[1]
  function createEntityWithChanges() {
    const entity = createAssemblyEntity(
      { name: "assembling-machine-1", recipe: "iron-gear-wheel" },
      Pos(0.5, 0.5),
      nil,
      2,
    )
    entity.applyUpgradeAtStage(3, "assembling-machine-2")
    entity._applyDiffAtStage(4, { recipe: "copper-cable" })

    assembly.content.add(entity)
    WorldUpdater.updateWorldEntities(assembly, entity, 1, nil)

    teleportToStage(player, assembly.getStage(4)!)
    player.opened = entity.getWorldEntity(4)
  }

  createEntityWithChanges()
}
