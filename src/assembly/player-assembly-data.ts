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

import { StageNumber } from "../entity/AssemblyEntity"
import { onPlayerInit } from "../lib"
import { Position } from "../lib/geometry"
import { AssemblyId, UserAssembly } from "./AssemblyDef"
import { AssemblyEvents } from "./UserAssembly"

export interface AssemblyPlayerData {
  lastStage?: StageNumber
  lastPosition?: Position

  moveTargetStage?: StageNumber
}

declare global {
  interface PlayerData {
    assemblyPlayerData: LuaMap<AssemblyId, AssemblyPlayerData>
  }
}
declare const global: GlobalWithPlayers
onPlayerInit((index) => {
  global.players[index].assemblyPlayerData = new LuaMap()
})
AssemblyEvents.addListener((e) => {
  if (e.type == "assembly-deleted") {
    for (const [, player] of game.players) {
      global.players[player.index].assemblyPlayerData.delete(e.assembly.id)
    }
  }
})
export function getAssemblyPlayerData(player: PlayerIndex, assembly: UserAssembly): AssemblyPlayerData | nil {
  if (!assembly.valid) return nil
  const map = global.players[player].assemblyPlayerData
  const id = assembly.id
  if (!map.has(id)) map.set(id, {})
  return map.get(id)
}
