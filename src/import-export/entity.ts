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

import { BlueprintWire, MapPosition } from "factorio:runtime"
import { Entity } from "../entity/Entity"
import {
  addWireConnection,
  createProjectEntityNoCopy,
  ProjectEntity,
  StageDiffs,
  StageNumber,
} from "../entity/ProjectEntity"
import { Events, Mutable, PRRecord } from "../lib"
import { getNilPlaceholder, NilPlaceholder } from "../utils/diff-value"
import { MutableProjectContent } from "../entity/ProjectContent"
import { EntitiesExport } from "./project"
import { getDirectionalInfo } from "../entity/wire-connection"

export interface StageInfoExport<E extends Entity = Entity> {
  firstStage: StageNumber
  lastStage: StageNumber | nil
  firstValue?: E
  stageDiffs?: StageDiffsExport<E>
}

export interface EntityExport extends StageInfoExport {
  entityNumber: number
  firstValue: Entity
  position: MapPosition
  direction?: defines.direction
  wires?: BlueprintWire[]
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

// Does NOT handle wires, as those are inter-entity
export function exportEntity(entity: ProjectEntity, entityNumber: number = 0): EntityExport {
  const stageDiffs = entity.stageDiffs && toExportStageDiffs(entity.stageDiffs)
  return {
    entityNumber,
    position: entity.position,
    direction: entity.direction == 0 ? nil : entity.direction,
    firstStage: entity.firstStage,
    lastStage: entity.lastStage,
    firstValue: entity.firstValue,
    stageDiffs,
  }
}

// Does NOT handle wires, as those are inter-entity
export function importEntity(info: EntityExport): ProjectEntity {
  const stageDiffs = info.stageDiffs && fromExportStageDiffs(info.stageDiffs)

  const entity = createProjectEntityNoCopy(info.firstValue, info.position, info.direction, info.firstStage)
  entity.setLastStageUnchecked(info.lastStage)
  entity.setStageDiffsDirectly(stageDiffs)

  return entity
}

export function exportAllEntities(entities: ReadonlyLuaSet<ProjectEntity>): EntityExport[] {
  const entityMap = new LuaMap<ProjectEntity, number>()
  const result: EntityExport[] = []

  let thisEntityNumber = 0
  for (const entity of entities) {
    thisEntityNumber++
    if (!entity.isSettingsRemnant) {
      const newLocal = exportEntity(entity, thisEntityNumber)
      result.push(newLocal)
      entityMap.set(entity, thisEntityNumber)
    }
  }

  // pass 2: wires
  thisEntityNumber = 0
  for (const thisEntity of entities) {
    // lua set has consistent iteration order, so this is fine
    thisEntityNumber++
    const thisExport = result[thisEntityNumber - 1]
    const wires = thisEntity.wireConnections
    if (!thisEntity.isSettingsRemnant && wires) {
      if (!wires) continue
      const thisWires: BlueprintWire[] = (thisExport.wires = [])
      for (const [otherEntity, connections] of wires) {
        const otherEntityNumber = entityMap.get(otherEntity)
        if (!otherEntityNumber) continue
        for (const connection of connections) {
          const [, thisId, otherId] = getDirectionalInfo(connection, thisEntity)
          thisWires.push([thisEntityNumber, thisId, otherEntityNumber, otherId])
        }
      }
    }
  }
  return result
}

export function importAllEntities(content: MutableProjectContent, entities: EntitiesExport): void {
  const entityNumberToResult = new LuaMap<number, ProjectEntity>()
  for (const entity of entities) {
    const newEntity = importEntity(entity)
    entityNumberToResult.set(entity.entityNumber, newEntity)
    content.addEntity(newEntity)
  }
  for (const entity of entities) {
    if (!entity.wires) continue
    for (const [fromEntityNumber, fromId, toEntityNumber, toId] of entity.wires) {
      const fromEntity = entityNumberToResult.get(fromEntityNumber)
      const toEntity = entityNumberToResult.get(toEntityNumber)
      if (!fromEntity || !toEntity) continue
      addWireConnection({ fromEntity, toEntity, fromId, toId })
    }
  }
}
