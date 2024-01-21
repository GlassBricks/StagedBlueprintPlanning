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

import { BlueprintEntity, BoundingBox, LuaPlayer } from "factorio:runtime"
import { Mutable } from "../lib"
import { Stage } from "../project/ProjectDef"
import { BpStageInfo, BpStageInfoTags } from "./blueprint-stage-info"

export function takeBlueprintWithStageInfo(player: LuaPlayer, stage: Stage, area: BoundingBox): void {
  const stack = player.cursor_stack
  if (!stack) error("cannot create blueprint without cursor stack")

  stack.set_stack("blueprint")
  const entityMapping = stack.create_blueprint({
    surface: stage.surface,
    force: player.force_index,
    area,
  })
  const blueprintEntities = stack.get_blueprint_entities() as Mutable<BlueprintEntity>[]
  const content = stage.project.content
  const stageNumber = stage.stageNumber
  for (const [number, luaEntity] of pairs(entityMapping)) {
    const projectEntity = content.findExact(luaEntity, luaEntity.position, stageNumber)
    if (!projectEntity) continue
    const info: BpStageInfo = {
      firstStage: projectEntity.firstStage,
    }
    const diffs = projectEntity.stageDiffs
    if (diffs) {
      info.firstValue = projectEntity.firstValue
    }
    blueprintEntities[number - 1].tags = {
      bp100: {
        firstStage: projectEntity.firstStage,
      },
    } satisfies BpStageInfoTags
  }

  stack.set_blueprint_entities(blueprintEntities)
}
