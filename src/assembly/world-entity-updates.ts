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

import { Prototypes } from "../constants"
import { AssemblyContent } from "../entity/AssemblyContent"
import {
  AssemblyEntity,
  isWorldEntityAssemblyEntity,
  RollingStockAssemblyEntity,
  StageNumber,
} from "../entity/AssemblyEntity"
import { isPreviewEntity } from "../entity/entity-prototype-info"
import { EntityDollyResult, forceDollyEntity, tryDollyAllEntities } from "../entity/picker-dollies"
import { createEntity, createPreviewEntity, updateEntity } from "../entity/save-load"
import { updateWireConnectionsAtStage } from "../entity/wires"
import { Assembly } from "./AssemblyDef"
import {
  deleteAllHighlights,
  makeSettingsRemnantHighlights,
  updateAllHighlights,
  updateHighlightsOnSettingsRemnantRevived,
} from "./entity-highlights"

export type AssemblyEntityDollyResult =
  | EntityDollyResult
  | "cannot-move"
  | "entities-missing"
  | "connected-entities-missing"

function makePreviewEntity(
  assembly: Assembly,
  stage: StageNumber,
  entity: AssemblyEntity,
  entityName: string,
  direction: defines.direction,
): void {
  const existing = entity.getWorldOrPreviewEntity(stage)
  const previewName = Prototypes.PreviewEntityPrefix + entityName
  if (existing && isPreviewEntity(existing) && existing.name == previewName) {
    existing.direction = direction
  } else {
    const previewEntity = createPreviewEntity(assembly.getSurface(stage)!, entity.position, direction, entityName)
    entity.replaceWorldOrPreviewEntity(stage, previewEntity)
  }
}

export function clearWorldEntityAtStage(assembly: Assembly, entity: AssemblyEntity, stage: StageNumber): void {
  makePreviewEntity(assembly, stage, entity, entity.getNameAtStage(stage), entity.getPreviewDirection())
  updateAllHighlights(assembly, entity)
}

function makeEntityUneditable(entity: LuaEntity) {
  entity.minable = false
  entity.rotatable = false
  entity.destructible = false
}
function makeEntityEditable(entity: LuaEntity) {
  entity.minable = true
  entity.rotatable = true
  entity.destructible = false
}
function updateWorldEntitiesOnlyInRange(
  assembly: Assembly,
  entity: AssemblyEntity,
  startStage: StageNumber,
  endStage: StageNumber,
): void {
  assert(startStage >= 1)
  const { firstStage, lastStage } = entity
  const direction = entity.getDirection()
  const previewDirection = entity.getPreviewDirection()

  if (startStage == firstStage) startStage = 1 // also update all previews if first stage edited
  if (lastStage && lastStage > endStage) endStage = lastStage

  for (const [stage, value] of entity.iterateValues(startStage, endStage)) {
    const surface = assembly.getSurface(stage)!
    const existing = entity.getWorldOrPreviewEntity(stage)

    if (value != nil) {
      let luaEntity: LuaEntity | nil
      if (existing && !isPreviewEntity(existing)) {
        luaEntity = updateEntity(existing, value, direction)
      } else {
        luaEntity = createEntity(surface, entity.position, direction, value)
      }

      if (luaEntity) {
        if (stage != firstStage) makeEntityUneditable(luaEntity)
        else makeEntityEditable(luaEntity)

        entity.replaceWorldOrPreviewEntity(stage, luaEntity)

        continue
      }
      // else, fall through to make preview
    }

    // preview
    const entityName = (value ?? entity.firstValue).name
    makePreviewEntity(assembly, stage, entity, entityName, previewDirection)
  }
}

function updateWiresInRange(
  assembly: Assembly,
  entity: AssemblyEntity,
  startStage: StageNumber,
  endStage: StageNumber,
): void {
  const content = assembly.content
  for (const stage of $range(startStage, endStage)) {
    const worldEntity = entity.getWorldEntity(stage)
    if (worldEntity) {
      updateWireConnectionsAtStage(content, entity, stage)
    }
  }
}

export function updateWorldEntities(
  assembly: Assembly,
  entity: AssemblyEntity,
  startStage: StageNumber,
  updateWires = true,
): void {
  if (entity.isSettingsRemnant) return makeSettingsRemnant(assembly, entity)
  const lastStage = assembly.lastStageFor(entity)
  updateWorldEntitiesOnlyInRange(assembly, entity, startStage, lastStage)
  if (updateWires) updateWiresInRange(assembly, entity, startStage, lastStage)
  updateAllHighlights(assembly, entity)
}

export function updateWorldEntitiesOnLastStageChanged(
  assembly: Assembly,
  entity: AssemblyEntity,
  oldLastStage: StageNumber | nil,
): void {
  const movedDown = entity.lastStage != nil && (oldLastStage == nil || entity.lastStage < oldLastStage)
  if (movedDown) {
    // delete all entities after the new last stage
    for (const stage of $range(entity.lastStage + 1, oldLastStage ?? assembly.numStages())) {
      entity.destroyWorldOrPreviewEntity(stage)
    }
  } else if (oldLastStage) {
    updateWorldEntities(assembly, entity, oldLastStage + 1)
  }
  updateAllHighlights(assembly, entity)
}

export function updateNewWorldEntitiesWithoutWires(assembly: Assembly, entity: AssemblyEntity): void {
  return updateWorldEntities(assembly, entity, entity.firstStage, false)
}

export function refreshWorldEntityAtStage(assembly: Assembly, entity: AssemblyEntity, stage: StageNumber): void {
  if (!entity.isInStage(stage)) {
    entity.destroyWorldOrPreviewEntity(stage)
    return
  }
  if (entity.isSettingsRemnant) {
    entity.destroyWorldOrPreviewEntity(stage)
    makePreviewEntity(assembly, stage, entity, entity.getNameAtStage(stage), entity.getPreviewDirection())
    makeSettingsRemnantHighlights(assembly, entity)
    return
  }
  updateWorldEntitiesOnlyInRange(assembly, entity, stage, stage)
  updateWiresInRange(assembly, entity, stage, stage)
  updateAllHighlights(assembly, entity)
}

export function rebuildWorldEntityAtStage(assembly: Assembly, entity: AssemblyEntity, stage: StageNumber): void {
  entity.destroyWorldOrPreviewEntity(stage)
  refreshWorldEntityAtStage(assembly, entity, stage)
}

export function updateWireConnections(assembly: Assembly, entity: AssemblyEntity): void {
  updateWiresInRange(assembly, entity, entity.firstStage, assembly.lastStageFor(entity))
}

export function refreshAllWorldEntities(assembly: Assembly, entity: AssemblyEntity): void {
  return updateWorldEntities(assembly, entity, 1)
}

export function makeSettingsRemnant(assembly: Assembly, entity: AssemblyEntity): void {
  assert(entity.isSettingsRemnant)
  entity.destroyAllWorldOrPreviewEntities()
  const direction = entity.getPreviewDirection()
  for (const stage of $range(1, assembly.lastStageFor(entity))) {
    makePreviewEntity(assembly, stage, entity, entity.getNameAtStage(stage), direction)
  }
  makeSettingsRemnantHighlights(assembly, entity)
}

export function updateEntitiesOnSettingsRemnantRevived(assembly: Assembly, entity: AssemblyEntity): void {
  assert(!entity.isSettingsRemnant)
  const lastStage = assembly.lastStageFor(entity)
  updateWorldEntitiesOnlyInRange(assembly, entity, 1, lastStage)
  updateWiresInRange(assembly, entity, 1, lastStage)

  updateHighlightsOnSettingsRemnantRevived(assembly, entity)
}

export function deleteAllEntities(entity: AssemblyEntity): void {
  entity.destroyAllWorldOrPreviewEntities()
  deleteAllHighlights(entity)
}

function checkConnectionWorldEntityExists(
  content: AssemblyContent,
  entity: AssemblyEntity,
  startStage: StageNumber,
  endStage: StageNumber,
): boolean {
  const cableConnected = content.getCableConnections(entity)
  if (cableConnected) {
    for (const other of cableConnected) {
      if (!other.hasWorldEntityInRange(startStage, endStage)) return false
    }
  }
  const circuitConnections = content.getCircuitConnections(entity)
  if (circuitConnections) {
    for (const [other] of circuitConnections) {
      if (!other.hasWorldEntityInRange(startStage, endStage)) return false
    }
  }
  return true
}

function tryMoveOtherEntities(
  assembly: Assembly,
  entity: AssemblyEntity,
  stage: StageNumber,
  movedEntity: LuaEntity,
): AssemblyEntityDollyResult {
  if (entity.isUndergroundBelt() || entity.firstStage != stage) return "cannot-move"

  if (!checkConnectionWorldEntityExists(assembly.content, entity, stage, assembly.lastStageFor(entity)))
    return "connected-entities-missing"

  const entities: LuaEntity[] = []
  for (const stageNum of $range(1, entity.firstStage - 1)) {
    entities.push(entity.getWorldOrPreviewEntity(stageNum)!)
  }
  for (const stageNum of $range(entity.firstStage, assembly.lastStageFor(entity))) {
    const worldEntity = entity.getWorldOrPreviewEntity(stageNum)
    if (!worldEntity) return "entities-missing"
    entities.push(worldEntity)
  }

  return tryDollyAllEntities(entities, movedEntity.position, movedEntity.direction)
}

export function tryDollyEntities(
  assembly: Assembly,
  entity: AssemblyEntity,
  stage: StageNumber,
): AssemblyEntityDollyResult {
  const movedEntity = entity.getWorldOrPreviewEntity(stage)
  if (!movedEntity) return "entities-missing"
  const moveResult = tryMoveOtherEntities(assembly, entity, stage, movedEntity)
  if (moveResult != "success") {
    forceDollyEntity(movedEntity, entity.position, entity.getWorldDirection())
  } else {
    entity.setDirection(movedEntity.direction)
    const posChanged = assembly.content.changePosition(entity, movedEntity.position)
    assert(posChanged, "failed to change position in assembly content")
    deleteAllHighlights(entity)
    updateAllHighlights(assembly, entity)
  }

  return moveResult
}

export function rebuildStage(assembly: Assembly, stage: StageNumber): void {
  const surface = assembly.getSurface(stage)
  if (!surface) return
  for (const entity of surface.find_entities()) {
    if (isWorldEntityAssemblyEntity(entity)) entity.destroy()
  }
  for (const entity of surface.find_entities_filtered({
    type: ["simple-entity-with-owner", "rail-remnants"],
  })) {
    if (entity.name.startsWith(Prototypes.PreviewEntityPrefix)) entity.destroy()
  }
  const updateLater: RollingStockAssemblyEntity[] = []
  for (const entity of assembly.content.iterateAllEntities()) {
    if (entity.isRollingStock()) {
      updateLater.push(entity)
    } else {
      refreshWorldEntityAtStage(assembly, entity, stage)
    }
  }
  for (const entity of updateLater) {
    refreshWorldEntityAtStage(assembly, entity, stage)
  }
}
export function rebuildAllStages(assembly: Assembly): void {
  for (const stage of $range(1, assembly.numStages())) {
    rebuildStage(assembly, stage)
  }
}
export function disableAllEntitiesInStage(assembly: Assembly, stage: StageNumber): void {
  const surface = assembly.getSurface(stage)
  if (!surface) return
  const arr = surface.find_entities()
  for (const i of $range(1, arr.length)) {
    arr[i - 1].active = false
  }
}
export function enableAllEntitiesInStage(assembly: Assembly, stage: StageNumber): void {
  const surface = assembly.getSurface(stage)
  if (!surface) return
  const arr = surface.find_entities()
  for (const i of $range(1, arr.length)) {
    arr[i - 1].active = true
  }
}

export const _mockable = true
