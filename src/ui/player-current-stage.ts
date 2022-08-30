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
import {
  assertNever,
  Events,
  globalEventMulti,
  MutableState,
  onPlayerInit,
  onPlayerRemoved,
  State,
  state,
} from "../lib"

declare global {
  interface PlayerData {
    currentStage: MutableState<Stage | nil>
  }
}
declare const global: GlobalWithPlayers

export function playerCurrentStage(index: PlayerIndex): State<Stage | nil> {
  return global.players[index].currentStage
}
const PlayerChangedStageEvent = globalEventMulti<[player: LuaPlayer, stage: Stage | nil]>()
export { PlayerChangedStageEvent }

function updatePlayer(player: LuaPlayer): void {
  const data = global.players[player.index]
  if (data === nil) return

  const curStage = data.currentStage
  const newStage = getStageAtSurface(player.surface.index)
  if (curStage.get() !== newStage) {
    curStage.set(newStage)
    PlayerChangedStageEvent.raise(player, newStage)
  }
}
onPlayerInit((index) => {
  global.players[index].currentStage = state(nil)
})

onPlayerRemoved((index) => {
  const currentStage = global.players[index].currentStage
  currentStage.set(nil)
  currentStage.closeAll()
})

Events.on_player_changed_surface((e) => updatePlayer(game.get_player(e.player_index)!))
AssemblyEvents.addListener((e) => {
  switch (e.type) {
    case "assembly-deleted":
    case "stage-deleted":
      for (const [, player] of game.players) {
        updatePlayer(player)
      }
      break
    case "assembly-created":
    case "pre-stage-deleted":
    case "stage-added":
      return
    default:
      assertNever(e)
  }
})

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
