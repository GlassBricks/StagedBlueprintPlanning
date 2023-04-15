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

import { Stage, UserAssembly } from "../assembly/AssemblyDef"
import { getAssemblyPlayerData } from "../assembly/player-assembly-data"
import { AssemblyEvents, getStageAtSurface } from "../assembly/UserAssembly"
import { assertNever, Events, globalEvent, MutableProperty, onPlayerInit, Property, property } from "../lib"
import { Pos, Position } from "../lib/geometry"

declare global {
  interface PlayerData {
    currentStage: MutableProperty<Stage | nil>
    lastNonAssemblyLocation: {
      surface: LuaSurface
      position: Position
    }
  }
}
declare const global: GlobalWithPlayers

export function playerCurrentStage(index: PlayerIndex): Property<Stage | nil> {
  return global.players[index].currentStage
}
const PlayerChangedStageEvent = globalEvent<[player: LuaPlayer, stage: Stage | nil, oldStage: Stage | nil]>()
export { PlayerChangedStageEvent }

function updatePlayer(player: LuaPlayer): void {
  const data = global.players[player.index]
  if (data == nil) return

  const curStage = data.currentStage
  const newStage = getStageAtSurface(player.surface.index)
  const oldStage = curStage.get()
  if (newStage == oldStage) return
  curStage.set(newStage)
  PlayerChangedStageEvent.raise(player, newStage, oldStage)
}
onPlayerInit((index) => {
  global.players[index].currentStage = property(nil)
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
    case "assemblies-reordered":
      return
    default:
      assertNever(e)
  }
})

export function teleportToStage(player: LuaPlayer, stage: Stage): void {
  const currentStage = getStageAtSurface(player.surface.index)
  if (currentStage && currentStage.assembly == stage.assembly) {
    if (currentStage != stage) player.teleport(player.position, stage.surface)
    return
  }
  recordPlayerLastPosition(player)

  const newPosition = getAssemblyPlayerData(player.index, stage.assembly)?.lastPosition ?? { x: 0, y: 0 }
  player.teleport(newPosition, stage.surface)
}

export function teleportToAssembly(player: LuaPlayer, assembly: UserAssembly): void {
  const currentStage = getStageAtSurface(player.surface.index)
  if (currentStage && currentStage.assembly == assembly) {
    return
  }
  recordPlayerLastPosition(player)

  const playerData = getAssemblyPlayerData(player.index, assembly)
  if (!playerData) return
  if (playerData.lastStage && playerData.lastStage <= assembly.numStages()) {
    const stage = assembly.getStage(playerData.lastStage)!
    player.teleport(playerData.lastPosition ?? { x: 0, y: 0 }, stage.surface)
  } else {
    const stage = assembly.getStage(1)!
    player.teleport(Pos(0, 0), stage.surface)
  }
}

export function recordPlayerLastPosition(player: LuaPlayer): void {
  const currentStage = getStageAtSurface(player.surface.index)
  if (currentStage) {
    const playerData = getAssemblyPlayerData(player.index, currentStage.assembly)
    if (!playerData) return
    playerData.lastStage = currentStage.stageNumber
    playerData.lastPosition = player.position
  } else {
    const data = global.players[player.index]
    if (data != nil)
      data.lastNonAssemblyLocation = {
        surface: player.surface,
        position: player.position,
      }
  }
}
export function exitAssembly(player: LuaPlayer): void {
  const data = global.players[player.index]
  if (data?.lastNonAssemblyLocation?.surface.valid) {
    player.teleport(data.lastNonAssemblyLocation.position, data.lastNonAssemblyLocation.surface)
  } else {
    player.teleport([0, 0], 1 as SurfaceIndex)
  }
}
