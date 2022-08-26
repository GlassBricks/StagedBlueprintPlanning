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

import { AssemblyEvents } from "../assembly/Assembly"
import { Stage } from "../assembly/AssemblyDef"
import { getAssemblyAtPosition } from "../assembly/world-register"
import { assertNever, Events, onPlayerInit } from "../lib"
import { BBox } from "../lib/geometry"
import { MutableState, State, state } from "../lib/observable"

declare global {
  interface PlayerData {
    currentStage: MutableState<Stage | nil>
  }
}
declare const global: GlobalWithPlayers

onPlayerInit((index) => {
  global.players[index].currentStage = state(nil)
})

function updatePlayer(player: LuaPlayer): void {
  const data = global.players[player.index]
  if (!data) return // bug workaround
  const currentStage = data.currentStage
  const stage = currentStage.get()
  const { position, surface } = player
  if (stage && stage.valid && stage.surface === surface && BBox.contains(stage, position)) return

  const assembly = getAssemblyAtPosition(position)
  currentStage.set(assembly && assembly.getStageAt(surface, position))
}
Events.on_player_changed_position((e) => updatePlayer(game.get_player(e.player_index)!))
Events.on_player_changed_surface((e) => updatePlayer(game.get_player(e.player_index)!))

AssemblyEvents.addListener((e) => {
  if (
    e.type === "assembly-created" ||
    e.type === "assembly-deleted" ||
    e.type === "stage-added" ||
    e.type === "stage-deleted"
  ) {
    for (const [, player] of game.players) {
      updatePlayer(player)
    }
  } else if (e.type !== "pre-stage-deleted") {
    assertNever(e)
  }
})

export function playerCurrentStage(index: PlayerIndex): State<Stage | nil> {
  return global.players[index].currentStage
}

export function teleportToStage(player: LuaPlayer, stage: Stage): void {
  const currentPos = player.position
  const surface = stage.surface
  if (BBox.contains(stage, currentPos)) {
    // already in position, check surface
    if (player.surface !== surface) {
      player.teleport(player.position, surface)
    }
  } else {
    // teleport to center
    player.teleport(BBox.center(stage), surface)
  }
}

export function teleportToSurface1(player: LuaPlayer): void {
  if (player.surface.index !== 1) {
    player.teleport(player.position, game.surfaces[1])
  }
}
