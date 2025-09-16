// Copyright (c) 2022 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { PlayerIndex } from "factorio:runtime"
import { StageNumber } from "../entity/ProjectEntity"
import { onPlayerInit } from "../lib"
import { Position } from "../lib/geometry"
import { ProjectId, UserProject } from "./ProjectDef"
import { ProjectEvents } from "./UserProject"

export interface ProjectPlayerData {
  lastStage?: StageNumber
  lastPosition?: Position

  moveTargetStage?: StageNumber
}

declare global {
  interface PlayerData {
    projectPlayerData: LuaMap<ProjectId, ProjectPlayerData>
  }
}
declare const storage: StorageWithPlayer
onPlayerInit((index) => {
  storage.players[index].projectPlayerData = new LuaMap()
})

ProjectEvents.addListener((e) => {
  if (e.type == "project-deleted") {
    for (const [, player] of game.players) {
      storage.players[player.index].projectPlayerData.delete(e.project.id)
    }
  }
})
export function getProjectPlayerData(player: PlayerIndex, project: UserProject): ProjectPlayerData | nil {
  if (!project.valid) return nil
  const map = storage.players[player].projectPlayerData
  const id = project.id
  if (!map.has(id)) map.set(id, {})
  return map.get(id)
}
