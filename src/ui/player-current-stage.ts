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

import { AssemblyEvents, getStageAtSurface } from "../assembly/Assembly"
import { Stage } from "../assembly/AssemblyDef"
import { assertNever, Events, MutableState, onPlayerInit, State, state } from "../lib"

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
  if (data !== nil) {
    data.currentStage.set(getStageAtSurface(player.surface.index))
  }
}
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
  const currentStage = getStageAtSurface(player.surface.index)
  if (currentStage && currentStage.assembly === stage.assembly) {
    if (currentStage === stage) return
    player.teleport(player.position, stage.surface)
  } else {
    // teleport to center
    player.teleport({ x: 0, y: 0 }, stage.surface)
  }
}

export function teleportToSurface1(player: LuaPlayer): void {
  if (player.surface.index !== 1) {
    player.teleport(player.position, game.surfaces[1])
  }
}
