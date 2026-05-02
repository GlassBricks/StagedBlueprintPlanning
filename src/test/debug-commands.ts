// Copyright (c) 2022-2025 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { saveEntity } from "../entity/save-load"
import { Events } from "../lib"
import { debugPrint } from "../lib/test/misc"
import { UndoHandler } from "../project/actions"
import { getProjectEntityOfEntity } from "../ui/entity-util"

declare const storage: {
  printEvents?: boolean
  lastEventTick?: number
  eventCount?: number
}

// --- Event tracing ---------------------------------------------------------

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
    const currentTick = game.tick
    if (currentTick != storage.lastEventTick) {
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

commands.add_command("printev", "", (e) => {
  storage.printEvents = e.parameter == nil
  game.print("printEvents: " + storage.printEvents)
})

// --- Ad-hoc inspection ------------------------------------------------------------

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

commands.add_command("print-held-bp-entities", "", () => {
  const player = game.player!
  const stack = player.cursor_stack
  if (!stack?.is_blueprint) return player.print("Not a blueprint")
  const bp = stack.get_blueprint_entities()!
  debugPrint(bp)
})

commands.add_command("print-hovered-entity-project", "", () => {
  const player = game.player!
  const entity = player.selected
  if (!entity) {
    player.print("No entity selected")
    return
  }

  const [, projEntity] = getProjectEntityOfEntity(entity)
  if (!projEntity) {
    player.print("No project entity found")
    return
  }
  debugPrint(projEntity)
})

// --- Undo testing ----------------------------------------------------------

const TestUndo = UndoHandler<string>("in-world-test", (player, data) => {
  player.print(`Test undo: ${data}`)
})

commands.add_command("test-undo", "", (e) => {
  const player = game.player!
  const param = e.parameter ?? "no param"
  TestUndo.register(player, param)
  player.print(`Setup undo with: ${param}`)
})

// --- Scriptable: ready signal + UDP remote console -------------------

const READY_TAG = "[exp:ready]"
const UDP_TAG = "[exp:udp]"

Events.on_init(() => {
  log(`${READY_TAG} on_init`)
})

Events.on_load(() => {
  log(`${READY_TAG} on_load`)
})

script.on_nth_tick(1, () => {
  helpers.recv_udp()
})

Events.on_udp_packet_received((event) => {
  const payload = event.payload
  log(`${UDP_TAG} recv port=${event.source_port} player=${event.player_index} len=${string.len(payload)}`)
  const [chunk, compileErr] = load(payload, "udp")
  if (chunk == nil) {
    log(`${UDP_TAG} compile-error: ${compileErr}`)
    return
  }
  const [ok, result] = pcall(chunk)
  if (!ok) {
    log(`${UDP_TAG} run-error: ${result}`)
  } else if (result != nil) {
    log(`${UDP_TAG} result: ${serpent.dump(result)}`)
  } else {
    log(`${UDP_TAG} ok`)
  }
})
