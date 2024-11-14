/*
 * Copyright (c) 2024 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { BlueprintEntity, BoundingBox, LuaInventory, LuaItemStack, LuaPlayer } from "factorio:runtime"
import { isEmpty, Mutable } from "../lib"
import { Stage } from "../project/ProjectDef"
import { BpStagedInfo, BpStagedInfoTags, toBpStageDiffs } from "./blueprint-stage-info"

declare global {
  interface PlayerData {
    tempBpInventory?: LuaInventory
  }
}
declare const storage: StorageWithPlayer

export function createBlueprintWithStageInfo(player: LuaPlayer, stage: Stage, area: BoundingBox): LuaItemStack | nil {
  const inventory = (storage.players[player.index].tempBpInventory ??= game.create_inventory(1))
  const stack = inventory[0]
  stack.clear()
  stack.set_stack("blueprint")

  const entityMapping = stack.create_blueprint({
    surface: stage.surface,
    force: player.force_index,
    area,
  })
  if (isEmpty(entityMapping)) {
    stack.clear()
    return nil
  }
  const blueprintEntities = stack.get_blueprint_entities() as Mutable<BlueprintEntity>[]
  const content = stage.project.content
  const stageNumber = stage.stageNumber

  for (const [number, luaEntity] of pairs(entityMapping)) {
    const projectEntity = content.findEntityExact(luaEntity, luaEntity.position, stageNumber)
    if (!projectEntity) continue
    const info: BpStagedInfo = {
      firstStage: projectEntity.firstStage,
      lastStage: projectEntity.lastStage,
    }
    const diffs = projectEntity.stageDiffs
    if (diffs) {
      info.firstValue = projectEntity.firstValue
      info.stageDiffs = toBpStageDiffs(diffs)
    }
    blueprintEntities[number - 1].tags = { bp100: info } satisfies BpStagedInfoTags
  }

  stack.set_blueprint_entities(blueprintEntities)
  return stack
}

export const _mockable = true
