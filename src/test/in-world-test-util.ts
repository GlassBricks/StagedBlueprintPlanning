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

import { saveEntity } from "../entity/save-load"
import { Events } from "../lib"
import { MockedFunctionTable } from "./module-mock"

declare let global: {
  printEvents?: boolean
  lastEventTick?: number
  eventCount?: number
}
const eventBlacklist = newLuaSet<keyof typeof defines.events>(
  "on_tick",
  "on_player_changed_position",
  // "on_selected_entity_changed",
  "on_chunk_charted",
  "on_chunk_generated",
  "on_player_main_inventory_changed",
  "on_gui_location_changed",
  // "on_gui_click",
  "on_research_finished",
  "script_raised_set_tiles",
)
for (const [name, key] of pairs(defines.events)) {
  if (eventBlacklist.has(name)) continue
  Events.registerEarly(key, (event) => {
    if (!global.printEvents) return
    // if (isTestsRunning()) return
    const currentTick = game.tick
    if (currentTick != global.lastEventTick) {
      // game.print(currentTick)
      global.eventCount = 0
      if (!global.lastEventTick || currentTick - global.lastEventTick > 60) {
        game.print(global.lastEventTick + "\n")
      }
    }
    global.lastEventTick = currentTick
    global.eventCount = (global.eventCount || 0) + 1
    game.print(
      `(${(game.tick % 1000).toString().padStart(3, " ")}) ${global.eventCount.toString().padStart(2, "0")}: ${name}`,
    )
    log(`${name} ${serpent.block(event)}`)
  })
}

import WorldListener = require("../assembly/user-actions")

for (const [k, v] of pairs(WorldListener)) {
  if (v == true) continue
  assume<MockedFunctionTable>(v)
  const orig = v.original
  v.original = (...args: any[]) => {
    if (global.printEvents) {
      global.lastEventTick = game.tick
      global.eventCount = (global.eventCount || 0) + 1
      game.print(
        `(${(game.tick % 1000).toString().padStart(3, " ")}) ${global.eventCount
          .toString()
          .padStart(2, "0")}:  [color=green]WorldListener.${k}[/color]`,
      )
    }
    return orig(...args)
  }
}

// noinspection SpellCheckingInspection
commands.add_command("printev", "", (e) => {
  global.printEvents = e.parameter == nil
  game.print("printEvents: " + global.printEvents)
})

// noinspection SpellCheckingInspection
commands.add_command("bpinfo", "", () => {
  const entity = game.player!.selected
  if (!entity) {
    game.print("No entity selected")
    return
  }
  game.print(serpent.block(saveEntity(entity)))
})
