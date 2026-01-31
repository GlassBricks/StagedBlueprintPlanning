// SPDX-FileCopyrightText: 2026 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { LuaEntity } from "factorio:runtime"
import { ExtraEntities, ExtraEntityType, ProjectEntity, StageNumber } from "../../entity/ProjectEntity"

export interface TestWorldQueries {
  getWorldEntity(entity: ProjectEntity, stage: StageNumber): LuaEntity | nil
  getWorldOrPreviewEntity(entity: ProjectEntity, stage: StageNumber): LuaEntity | nil
  hasErrorAt(entity: ProjectEntity, stage: StageNumber): boolean
  getExtraEntity<T extends keyof ExtraEntities>(
    entity: ProjectEntity,
    type: T,
    stage: StageNumber,
  ): ExtraEntities[T] | nil
  hasAnyExtraEntities(entity: ProjectEntity, type: ExtraEntityType): boolean
}

export function createOldPipelineWorldQueries(): TestWorldQueries {
  return {
    getWorldEntity: (entity, stage) => entity.getWorldEntity(stage),
    getWorldOrPreviewEntity: (entity, stage) => entity.getWorldOrPreviewEntity(stage),
    hasErrorAt: (entity, stage) => entity.hasErrorAt(stage),
    getExtraEntity: (entity, type, stage) => entity.getExtraEntity(type, stage),
    hasAnyExtraEntities: (entity, type) => entity.hasAnyExtraEntities(type),
  }
}
