// Copyright (c) 2022-2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { LuaPlayer, LuaSurface, PlayerIndex, SurfaceIndex } from "factorio:runtime"
import { assertNever, Events, globalEvent, MutableProperty, onPlayerInit, Property, property } from "../lib"
import { Pos, Position } from "../lib/geometry"
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
    lastProjectSurface?: LuaSurface
  }
}
declare const storage: StorageWithPlayer

export function playerCurrentStage(index: PlayerIndex): Property<Stage | nil> {
  return storage.players[index].currentStage
}
const PlayerChangedStageEvent = globalEvent<[player: LuaPlayer, stage: Stage | nil, oldStage: Stage | nil]>()
export { PlayerChangedStageEvent }

function updatePlayer(player: LuaPlayer): void {
  const data = storage.players[player.index]
  if (data == nil) return

  const curStage = data.currentStage
  const newStage = getStageAtSurface(player.surface_index)
  const oldStage = curStage.get()
  if (newStage == oldStage) return
  curStage.set(newStage)
  PlayerChangedStageEvent.raise(player, newStage, oldStage)
}
onPlayerInit((index) => {
  storage.players[index].currentStage = property(nil)
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
  recordPlayerLastPosition(player)

  const currentStage = getStageAtSurface(player.surface_index)
  if (currentStage && currentStage.project == stage.project) {
    if (currentStage != stage) player.teleport(player.position, stage.surface)
    return
  }

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
  const globalPlayerData = storage.players[player.index]
  const currentStage = getStageAtSurface(player.surface_index)
  if (currentStage) {
    const playerData = getProjectPlayerData(player.index, currentStage.project)
    if (!playerData) return
    playerData.lastStage = currentStage.stageNumber
    playerData.lastPosition = player.position
  } else if (globalPlayerData != nil) {
    globalPlayerData.lastNonProjectLocation = {
      surface: player.surface,
      position: player.position,
    }
  }
  if (globalPlayerData != nil) {
    if (currentStage) globalPlayerData.lastProjectSurface = player.surface
  }
}

export function exitProject(player: LuaPlayer): void {
  recordPlayerLastPosition(player)
  const data = storage.players[player.index]
  if (data?.lastNonProjectLocation?.surface.valid) {
    player.teleport(data.lastNonProjectLocation.position, data.lastNonProjectLocation.surface)
  } else {
    player.teleport([0, 0], 1 as SurfaceIndex)
  }
}
export function enterLastProject(player: LuaPlayer): void {
  const data = storage.players[player.index]
  if (data?.lastProjectSurface?.valid) {
    const stage = getStageAtSurface(data.lastProjectSurface.index)
    if (stage) {
      teleportToStage(player, stage)
      return
    }
  }
  player.print("No known valid last project location")
}
