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

import { LuaEntity } from "factorio:runtime"
import { ProjectEntity } from "../entity/ProjectEntity"
import { Stage } from "../project/ProjectDef"
import { getStageAtSurface } from "../project/stage-surface"

export function getProjectEntityOfEntity(entity: LuaEntity): LuaMultiReturn<[Stage, ProjectEntity] | [_?: nil]> {
  const stage = getStageAtSurface(entity.surface_index)
  if (!stage) return $multi()
  const found = stage.project.content.findCompatibleFromPreviewOrLuaEntity(entity, stage.stageNumber)
  if (found) return $multi(stage, found)
  return $multi()
}
