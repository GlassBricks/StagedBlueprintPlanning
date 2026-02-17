// Copyright (c) 2024-2025 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { BlueprintWire, MapPosition } from "factorio:runtime"
import { Entity } from "../entity/Entity"
import { MutableProjectContent } from "../entity/ProjectContent"
import {
  InternalProjectEntity,
  newProjectEntity,
  ProjectEntity,
  StagePropertiesData,
  StageDiffs,
  StageNumber,
  StageProperties,
} from "../entity/ProjectEntity"
import { getDirectionalInfo } from "../entity/wire-connection"
import { deepCopy, Events, Mutable, PRRecord } from "../lib"
import { getNilPlaceholder, NilPlaceholder } from "../utils/diff-value"
import { EntitiesExport } from "./project"

export type StagePropertiesExport = {
  [P in keyof StageProperties]?: PRRecord<StageNumber | `${number}`, StageProperties[P]>
}

export interface StageInfoExport<E extends Entity = Entity> {
  firstStage: StageNumber
  lastStage: StageNumber | nil
  firstValue?: E
  stageDiffs?: StageDiffsExport<E>
  stageProperties?: StagePropertiesExport
  /** @deprecated Legacy field, use stageProperties instead */
  unstagedValue?: PRRecord<StageNumber | `${number}`, unknown>
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
    const key = tonumber(stage)
    if (key == nil) continue
    const stageDiff: any = {}
    for (const [key, value] of pairs(diff)) {
      stageDiff[key] = isExportNilPlaceholder(value) ? nilPlaceholder : value
    }
    ret[key] = stageDiff
  }
  return ret
}

export function serializeStageProperties(entity: ProjectEntity): StagePropertiesExport | nil {
  let result: Mutable<StagePropertiesExport> | nil
  for (const key of keys<StageProperties>()) {
    const allStages = entity.getPropertyAllStages(key)
    if (allStages) {
      result ??= {}
      result[key] = deepCopy(allStages) as any
    }
  }
  return result
}

export function parseStagePropertiesExport(props: StagePropertiesExport): StagePropertiesData {
  const result: Mutable<StagePropertiesData> = {}
  for (const key of keys<StageProperties>()) {
    const stages = props[key]
    if (!stages) continue
    const converted: any = {}
    for (const [stage, value] of pairs(stages)) {
      const stageNumber = tonumber(stage)
      if (stageNumber != nil) {
        converted[stageNumber] = value
      }
    }
    result[key] = converted
  }
  return result
}

export function serializeEntity(entity: ProjectEntity, entityNumber: number = 0): EntityExport {
  const stageDiffs = entity.stageDiffs && toExportStageDiffs(entity.stageDiffs)
  const stageProperties = serializeStageProperties(entity)
  return {
    entityNumber,
    position: entity.position,
    direction: entity.direction == 0 ? nil : entity.direction,
    firstStage: entity.firstStage,
    lastStage: entity.lastStage,
    firstValue: entity.firstValue,
    stageDiffs,
    stageProperties,
  }
}

export function parseStageProperties(info: StageInfoExport): StagePropertiesData | nil {
  const props = info.stageProperties ?? legacyToStageProperties(info)
  return props ? parseStagePropertiesExport(props) : nil
}

export function applyStageInfoExport(entity: InternalProjectEntity, info: StageInfoExport): void {
  entity.setLastStage(info.lastStage)
  if (info.stageDiffs) entity.setStageDiffsDirectly(fromExportStageDiffs(info.stageDiffs))
  entity.setStagePropertiesDirectly(parseStageProperties(info))
}

export function deserializeEntity(info: EntityExport): ProjectEntity {
  const entity = newProjectEntity(info.firstValue, info.position, info.direction ?? 0, info.firstStage)
  applyStageInfoExport(entity, info)
  return entity
}

function legacyToStageProperties(info: StageInfoExport): StagePropertiesExport | nil {
  if (!info.unstagedValue) return nil
  return { unstagedValue: info.unstagedValue as StagePropertiesExport["unstagedValue"] }
}

export function serializeAllEntities(entities: ReadonlyLuaSet<ProjectEntity>): EntityExport[] {
  const entityMap = new LuaMap<ProjectEntity, number>()
  const result: EntityExport[] = []

  const entitysArr = Object.keys(entities).filter((entity) => !entity.isSettingsRemnant)

  let thisEntityNumber = 0
  for (const entity of entitysArr) {
    thisEntityNumber++
    const newLocal = serializeEntity(entity, thisEntityNumber)
    result.push(newLocal)
    entityMap.set(entity, thisEntityNumber)
  }

  // pass 2: wires
  thisEntityNumber = 0
  for (const thisEntity of entitysArr) {
    thisEntityNumber++
    const thisExport = result[thisEntityNumber - 1]
    const wires = thisEntity.wireConnections
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
  return result
}

export function deserializeAllEntities(content: MutableProjectContent, entities: EntitiesExport): void {
  const entityNumberToResult = new LuaMap<number, ProjectEntity>()
  for (const entity of entities) {
    const newEntity = deserializeEntity(entity)
    entityNumberToResult.set(entity.entityNumber, newEntity)
    content.addEntity(newEntity)
  }
  for (const entity of entities) {
    if (!entity.wires) continue
    for (const [fromEntityNumber, fromId, toEntityNumber, toId] of entity.wires) {
      const fromEntity = entityNumberToResult.get(fromEntityNumber)
      const toEntity = entityNumberToResult.get(toEntityNumber)
      if (!fromEntity || !toEntity) continue
      content.addWireConnection({ fromEntity, toEntity, fromId, toId })
    }
  }
}
