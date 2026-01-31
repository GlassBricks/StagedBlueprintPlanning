// Copyright (c) 2022-2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { LuaEntity } from "factorio:runtime"
import { ProjectEntity } from "../entity/ProjectEntity"
import { getStageAtSurface } from "../project/project-refs"
import { Stage } from "../project/Project"

export function getProjectEntityOfEntity(entity: LuaEntity): LuaMultiReturn<[Stage, ProjectEntity] | [_?: nil]> {
  const stage = getStageAtSurface(entity.surface_index)
  if (!stage) return $multi()
  const found = stage.project.content.findCompatibleFromPreviewOrLuaEntity(entity, stage.stageNumber)
  if (found) return $multi(stage, found)
  return $multi()
}
