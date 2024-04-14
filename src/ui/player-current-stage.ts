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

import { LuaPlayer, LuaSurface, PlayerIndex, SurfaceIndex } from "factorio:runtime"
import { assertNever, Events, globalEvent, MutableProperty, onPlayerInit, Property, property } from "../lib"
import { Pos, Position } from "../lib/geometry"
import { Migrations } from "../lib/migration"
import { getProjectPlayerData } from "../project/player-project-data"
import { getStageAtSurface } from "../project/project-refs"
import { Stage, UserProject } from "../project/ProjectDef"
import { ProjectEvents } from "../project/UserProject"

declare global {
  interface PlayerData {
    currentStage: MutableProperty<Stage | nil>
    lastNonProjectLocation: {
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
  const newStage = getStageAtSurface(player.surface_index)
  const oldStage = curStage.get()
  if (newStage == oldStage) return
  curStage.set(newStage)
  PlayerChangedStageEvent.raise(player, newStage, oldStage)
}
onPlayerInit((index) => {
  global.players[index].currentStage = property(nil)
})

Events.on_player_changed_surface((e) => updatePlayer(game.get_player(e.player_index)!))
ProjectEvents.addListener((e) => {
  switch (e.type) {
    case "project-deleted":
    case "stage-deleted":
      for (const [, player] of game.players) {
        updatePlayer(player)
      }
      break
    case "project-created":
    case "pre-stage-deleted":
    case "stage-added":
    case "projects-reordered":
      return
    default:
      assertNever(e)
  }
})

export function teleportToStage(player: LuaPlayer, stage: Stage): void {
  const currentStage = getStageAtSurface(player.surface_index)
  if (currentStage && currentStage.project == stage.project) {
    if (currentStage != stage) player.teleport(player.position, stage.surface)
    return
  }
  recordPlayerLastPosition(player)

  const newPosition = getProjectPlayerData(player.index, stage.project)?.lastPosition ?? { x: 0, y: 0 }
  player.teleport(newPosition, stage.surface)
}

export function teleportToProject(player: LuaPlayer, project: UserProject): void {
  const currentStage = getStageAtSurface(player.surface_index)
  if (currentStage && currentStage.project == project) {
    return
  }
  recordPlayerLastPosition(player)

  const playerData = getProjectPlayerData(player.index, project)
  if (!playerData) return
  if (playerData.lastStage && playerData.lastStage <= project.numStages()) {
    const stage = project.getStage(playerData.lastStage)!
    player.teleport(playerData.lastPosition ?? { x: 0, y: 0 }, stage.surface)
  } else {
    const stage = project.getStage(1)!
    player.teleport(Pos(0, 0), stage.surface)
  }
}

export function recordPlayerLastPosition(player: LuaPlayer): void {
  const currentStage = getStageAtSurface(player.surface_index)
  if (currentStage) {
    const playerData = getProjectPlayerData(player.index, currentStage.project)
    if (!playerData) return
    playerData.lastStage = currentStage.stageNumber
    playerData.lastPosition = player.position
  } else {
    const data = global.players[player.index]
    if (data != nil)
      data.lastNonProjectLocation = {
        surface: player.surface,
        position: player.position,
      }
  }
}
export function exitProject(player: LuaPlayer): void {
  const data = global.players[player.index]
  if (data?.lastNonProjectLocation?.surface.valid) {
    player.teleport(data.lastNonProjectLocation.position, data.lastNonProjectLocation.surface)
  } else {
    player.teleport([0, 0], 1 as SurfaceIndex)
  }
}

Migrations.early("0.23.0", () => {
  for (const [, player] of game.players) {
    const playerData = global.players[player.index]
    if (!playerData) continue
    assume<{
      lastNonAssemblyLocation: any
    }>(playerData)
    playerData.lastNonProjectLocation = playerData.lastNonAssemblyLocation
    delete playerData.lastNonAssemblyLocation
  }
})
