// SPDX-FileCopyrightText: 2026 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { LuaEntity } from "factorio:runtime"
import { ProjectEntity, StageNumber } from "../../entity/ProjectEntity"
import { HighlightEntities } from "../../project/entity-highlights"
import { WorldPresentation } from "../../project/WorldPresentation"

export interface TestWorldQueries {
  getWorldEntity(entity: ProjectEntity, stage: StageNumber): LuaEntity | nil
  getWorldOrPreviewEntity(entity: ProjectEntity, stage: StageNumber): LuaEntity | nil
  hasErrorAt(entity: ProjectEntity, stage: StageNumber): boolean
  getExtraEntity<T extends keyof HighlightEntities>(
    entity: ProjectEntity,
    type: T,
    stage: StageNumber,
  ): HighlightEntities[T] | nil
  hasAnyExtraEntities(entity: ProjectEntity, type: keyof HighlightEntities): boolean
}

export function createWorldPresentationQueries(wp: WorldPresentation): TestWorldQueries {
  const es = wp.entityStorage
  return {
    getWorldEntity: (entity, stage) => wp.getWorldEntity(entity, stage),
    getWorldOrPreviewEntity: (entity, stage) => wp.getWorldOrPreviewEntity(entity, stage),
    hasErrorAt: (entity, stage) => wp.hasErrorAt(entity, stage),
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    getExtraEntity: (entity, type, stage) => es.get(entity, type as any, stage) as any,
    hasAnyExtraEntities: (entity, type) => es.hasAnyOfType(entity, type as any),
  }
}
