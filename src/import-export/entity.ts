/*
 * Copyright (c) 2024-2025 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { MapPosition } from "factorio:runtime"
import { Entity } from "../entity/Entity"
import { createProjectEntityNoCopy, ProjectEntity, StageDiffs, StageNumber } from "../entity/ProjectEntity"
import { Events, Mutable, PRRecord } from "../lib"
import { getNilPlaceholder, NilPlaceholder } from "../utils/diff-value"

export interface StageInfoExport<E extends Entity = Entity> {
  firstStage: StageNumber
  lastStage: StageNumber | nil
  firstValue?: E
  stageDiffs?: StageDiffsExport<E>
}

export interface EntityExport extends StageInfoExport {
  firstValue: Entity
  position: MapPosition
  direction?: defines.direction
}

export type ExportNilPlaceholder = {
  __nil: true
}
const blueprintNilPlaceholder: ExportNilPlaceholder = { __nil: true }

export function isExportNilPlaceholder(value: AnyNotNil): value is ExportNilPlaceholder {
  return typeof value == "object" && "__nil" in value
}

export type StageDiffExport<E extends Entity = Entity> = {
  readonly [P in keyof E]?: E[P] | ExportNilPlaceholder
}
// type might be a string of a number instead, in case of "sparse" array
export type StageDiffsExport<E extends Entity = Entity> = PRRecord<StageNumber | `${number}`, StageDiffExport<E>>

let nilPlaceholder: NilPlaceholder | nil
Events.onInitOrLoad(() => {
  nilPlaceholder = getNilPlaceholder()
})

export function toExportStageDiffs(diffs: StageDiffs): StageDiffsExport {
  const ret: Mutable<StageDiffsExport> = {}
  for (const [stage, diff] of pairs(diffs)) {
    const bpDiff: any = {}
    for (const [key, value] of pairs(diff)) {
      bpDiff[key] = value == nilPlaceholder ? blueprintNilPlaceholder : value
    }
    ret[stage] = bpDiff
  }
  return ret
}

export function fromExportStageDiffs(diffs: StageDiffsExport): StageDiffs {
  const ret: Mutable<StageDiffs> = {}
  for (const [stage, diff] of pairs(diffs)) {
    const stageDiff: any = {}
    for (const [key, value] of pairs(diff)) {
      stageDiff[key] = isExportNilPlaceholder(value) ? nilPlaceholder : value
    }
    ret[tonumber(stage)!] = stageDiff
  }
  return ret
}

export function exportEntity(entity: ProjectEntity): EntityExport {
  const stageDiffs = entity.stageDiffs && toExportStageDiffs(entity.stageDiffs)
  return {
    position: entity.position,
    direction: entity.direction == 0 ? nil : entity.direction,
    firstStage: entity.firstStage,
    lastStage: entity.lastStage,
    firstValue: entity.firstValue,
    stageDiffs,
  }
}

export function importEntity(info: EntityExport): ProjectEntity {
  const stageDiffs = info.stageDiffs && fromExportStageDiffs(info.stageDiffs)

  const entity = createProjectEntityNoCopy(info.firstValue, info.position, info.direction, info.firstStage)
  entity.setLastStageUnchecked(info.lastStage)
  entity.setStageDiffsDirectly(stageDiffs)

  return entity
}

export function exportAllEntities(entities: ReadonlyLuaSet<ProjectEntity>): EntityExport[] {
  const result: EntityExport[] = []
  for (const entity of entities) {
    if (!entity.isSettingsRemnant) {
      result.push(exportEntity(entity))
    }
  }
  // todo: wires
  return result
}
