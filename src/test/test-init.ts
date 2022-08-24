/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of BBPP3.
 *
 * BBPP3 is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * BBPP3 is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with BBPP3. If not, see <https://www.gnu.org/licenses/>.
 */

import { createDemonstrationAssembly } from "../assembly/Assembly"
import { Events, protectedAction } from "../lib"
import { destroyAllRenders } from "../lib/rendering"
import { openAssemblySettings } from "../ui/gui/AssemblySettings"

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
    const inventories = game.get_script_inventories(script.mod_name)[script.mod_name]
    if (inventories !== nil) inventories.forEach((x) => x.destroy())
    global = {}
    for (const [, player] of game.players) {
      const { screen, left, top, center } = player.gui
      for (const gui of [screen, left, top, center]) {
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
      destroyAllRenders()
      reinit()
      global.lastCompileTimestamp = lastCompileTime
      const force = game.forces.player
      force.research_all_technologies()
      force.enable_all_recipes()
    },
    after_test_run() {
      // game.speed = __DebugAdapter ? 1 : 1 / 6
      const result = remote.call("testorio", "getResults") as { status?: "passed" | "failed" | "todo" }
      const assembly = createDemonstrationAssembly(12)
      if (result.status === "passed") {
        game.surfaces[1].find_entities().forEach((e) => e.destroy())
        const player = game.players[1]
        player.gui.screen["testorio:test-progress"]?.destroy()
        protectedAction(() => {
          openAssemblySettings(player, assembly)
        })
      }
    },
    log_passed_tests: false,
    sound_effects: true,
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
let shouldTryRerun = !__DebugAdapter

Events.on_tick(() => {
  if (!shouldTryRerun) return
  const ticks = math.ceil(3 * 60 * game.speed)
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

commands.add_command("foo", "", (e) => {
  const player = game.players[e.player_index!]
  const entity = player.selected
  if (!entity) return player.print("No selected entity")
  const hbox = entity.surface.create_entity({
    name: "highlight-box",
    target: entity,
    position: entity.position,
  })!
  const id = script.register_on_entity_destroyed(entity)
  game.print("entity id: " + id)
  const id2 = script.register_on_entity_destroyed(hbox)
  game.print("hbox id: " + id2)
})

Events.on_entity_destroyed((e) => {
  game.print("destroyed: " + e.registration_number)
})
