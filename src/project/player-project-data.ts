/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

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
