// Copyright (c) 2022-2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { saveEntity } from "../entity/save-load"
import { Events } from "../lib"

declare const storage: {
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
    if (!storage.printEvents) return
    // if (isTestsRunning()) return
    const currentTick = game.tick
    if (currentTick != storage.lastEventTick) {
      // game.print(currentTick)
      storage.eventCount = 0
      if (!storage.lastEventTick || currentTick - storage.lastEventTick > 60) {
        game.print(storage.lastEventTick + "\n")
      }
    }
    storage.lastEventTick = currentTick
    storage.eventCount = (storage.eventCount || 0) + 1
    game.print(
      `(${(game.tick % 1000).toString().padStart(3, " ")}) ${storage.eventCount.toString().padStart(2, "0")}: ${name}`,
    )
    log(`${name} ${serpent.block(event)}`)
  })
}

// noinspection SpellCheckingInspection
commands.add_command("printev", "", (e) => {
  storage.printEvents = e.parameter == nil
  game.print("printEvents: " + storage.printEvents)
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

commands.add_command("stackinfo", "", () => {
  const bp = game.player!.cursor_stack
  if (!bp || !bp.valid_for_read || !bp.is_blueprint_setup()) {
    game.print("not a blueprint")
    return
  }
  game.print(serpent.block(bp.get_blueprint_entities()))
})
