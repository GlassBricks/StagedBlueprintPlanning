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

import {
  AssemblyEntity,
  createAssemblyEntity,
  LoaderAssemblyEntity,
  RollingStockAssemblyEntity,
  StageNumber,
  UndergroundBeltAssemblyEntity,
} from "../entity/AssemblyEntity"
import { fixEmptyControlBehavior, hasControlBehaviorSet } from "../entity/empty-control-behavior"
import { Entity } from "../entity/Entity"
import { areUpgradeableTypes } from "../entity/entity-info"
import { canBeAnyDirection, saveEntity } from "../entity/save-load"
import { findUndergroundPair } from "../entity/underground-belt"
import { saveWireConnections } from "../entity/wires"
import { Assembly } from "./AssemblyDef"
import {
  deleteAllEntities,
  makeSettingsRemnant,
  rebuildWorldEntityAtStage,
  refreshWorldEntityAtStage,
  updateEntitiesOnSettingsRemnantRevived,
  updateNewWorldEntitiesWithoutWires,
  updateWireConnections,
  updateWorldEntities,
} from "./world-entity-updates"
import min = math.min

export type UpdateSuccess = "updated" | "no-change"
export type RotateError = "cannot-rotate" | "cannot-flip-multi-pair-underground"
export type UpdateError =
  | RotateError
  | "cannot-upgrade-multi-pair-underground"
  | "cannot-create-pair-upgrade"
  | "cannot-upgrade-changed-pair"
export type EntityRotateResult = UpdateSuccess | RotateError
export type EntityUpdateResult = UpdateSuccess | UpdateError | RotateError
export type WireUpdateResult = UpdateSuccess | "max-connections-exceeded"
export type StageMoveResult = UpdateSuccess | "cannot-move-upgraded-underground"

export function addNewEntity(
  assembly: Assembly,
  entity: LuaEntity,
  stage: StageNumber,
  knownValue?: BlueprintEntity,
): AssemblyEntity<any> | nil {
  const saved = saveEntity(entity, knownValue)
  if (!saved) return nil
  const { content } = assembly
  const assemblyEntity = createAssemblyEntity(saved, entity.position, entity.direction, stage)
  assemblyEntity.replaceWorldEntity(stage, entity)
  content.add(assemblyEntity)

  if (entity.type == "underground-belt") {
    // match direction with underground pair
    const [pair] = findUndergroundPair(content, assemblyEntity as UndergroundBeltAssemblyEntity)
    if (pair) {
      const otherDir = pair.firstValue.type
      ;(assemblyEntity as UndergroundBeltAssemblyEntity).setTypeProperty(otherDir == "output" ? "input" : "output")
    }
  }

  updateNewWorldEntitiesWithoutWires(assembly, assemblyEntity)
  saveWireConnections(content, assemblyEntity, stage, assembly.lastStageFor(assemblyEntity))
  updateWireConnections(assembly, assemblyEntity)

  return assemblyEntity
}

export function moveEntityOnPreviewReplaced(assembly: Assembly, entity: AssemblyEntity, stage: StageNumber): boolean {
  if (stage >= entity.firstStage) return false
  entity.moveToStage(stage)
  updateWorldEntities(assembly, entity, stage)
  return true
}

function shouldMakeSettingsRemnant(assembly: Assembly, entity: AssemblyEntity) {
  if (entity.hasStageDiff()) return true
  const connections = assembly.content.getCircuitConnections(entity)
  if (!connections) return false
  const stage = entity.firstStage
  for (const [otherEntity] of connections) {
    if (otherEntity.getWorldEntity(stage) == nil) {
      // has a connection at first stage, but not one in the world
      return true
    }
  }
  return false
}

export function deleteEntityOrCreateSettingsRemnant(assembly: Assembly, entity: AssemblyEntity): void {
  if (shouldMakeSettingsRemnant(assembly, entity)) {
    entity.isSettingsRemnant = true
    makeSettingsRemnant(assembly, entity)
  } else {
    assembly.content.delete(entity)
    deleteAllEntities(entity)
  }
}
export function forceDeleteEntity(assembly: Assembly, entity: AssemblyEntity): void {
  assembly.content.delete(entity)
  deleteAllEntities(entity)
}

export function reviveSettingsRemnant(assembly: Assembly, entity: AssemblyEntity, stage: StageNumber): boolean {
  if (!entity.isSettingsRemnant) return false
  entity.isSettingsRemnant = nil
  entity.moveToStage(stage)
  updateEntitiesOnSettingsRemnantRevived(assembly, entity)
  return true
}

function tryUpgradeUndergroundBelt(
  assembly: Assembly,
  stage: StageNumber,
  entity: UndergroundBeltAssemblyEntity,
  upgradeType: string,
): EntityUpdateResult {
  const [pair, hasMultiple] = findUndergroundPair(assembly.content, entity)
  if (hasMultiple) {
    return "cannot-upgrade-multi-pair-underground"
  }
  let isFirstStage = entity.firstStage == stage
  if (pair) {
    isFirstStage ||= pair.firstStage == stage
    if (!isFirstStage && entity.firstStage != pair.firstStage) {
      // createNotification(entity, byPlayer, [L_Interaction.CannotCreateUndergroundUpgradeIfNotInSameStage], true)
      return "cannot-create-pair-upgrade"
    }
  }
  const oldName = entity.firstValue.name
  const applyStage = isFirstStage ? entity.firstStage : stage
  const upgraded = entity.applyUpgradeAtStage(applyStage, upgradeType)
  if (!upgraded) return "no-change"

  if (!pair) {
    updateWorldEntities(assembly, entity, applyStage)
  } else {
    const pairStage = isFirstStage ? pair.firstStage : stage
    const pairUpgraded = pair.applyUpgradeAtStage(pairStage, upgradeType)
    // check pair still correct
    const [newPair, newMultiple] = findUndergroundPair(assembly.content, entity)
    if (newPair != pair || newMultiple) {
      entity.applyUpgradeAtStage(applyStage, oldName)
      pair.applyUpgradeAtStage(pairStage, oldName)
      return "cannot-upgrade-changed-pair"
    }

    updateWorldEntities(assembly, entity, applyStage)
    if (pairUpgraded) updateWorldEntities(assembly, pair, pairStage)
  }
  return "updated"
}

function tryUpdateUndergroundFromFastReplace(
  assembly: Assembly,
  stage: StageNumber,
  entity: AssemblyEntity,
  entitySource: LuaEntity,
): EntityUpdateResult {
  // only can upgrade via fast-replace
  const newType = entitySource.name
  if (newType == entity.getNameAtStage(stage)) return "no-change"

  const result = tryUpgradeUndergroundBelt(assembly, stage, entity as UndergroundBeltAssemblyEntity, newType)
  if (result != "no-change" && result != "updated") {
    refreshWorldEntityAtStage(assembly, entity, stage)
  }
  return result
}

function doUpdateEntityFromWorld(
  assembly: Assembly,
  stage: StageNumber,
  entity: AssemblyEntity,
  entitySource: LuaEntity,
  knownValue?: BlueprintEntity,
): boolean {
  entity.replaceWorldEntity(stage, entitySource)
  const newValue = saveEntity(entitySource, knownValue)
  if (!newValue) return false
  return entity.adjustValueAtStage(stage, newValue)
}

const undoRotate = refreshWorldEntityAtStage

export function tryUpdateEntityFromWorld(
  assembly: Assembly,
  entity: AssemblyEntity,
  stage: StageNumber,
  knownValue?: BlueprintEntity,
): EntityUpdateResult {
  const entitySource = entity.getWorldEntity(stage)
  if (!entitySource) return "no-change"
  if (entitySource.type == "underground-belt") {
    return tryUpdateUndergroundFromFastReplace(assembly, stage, entity, entitySource)
  }

  const rotated = !canBeAnyDirection(entitySource) && entitySource.direction != entity.getDirection()
  if (rotated) {
    const rotateAllowed = stage == entity.firstStage
    if (rotateAllowed) {
      entity.setDirection(entitySource.direction)
    } else {
      undoRotate(assembly, entity, stage)
      return "cannot-rotate"
    }
  }

  const hasDiff = doUpdateEntityFromWorld(assembly, stage, entity, entitySource, knownValue)
  if (hasDiff || rotated) {
    updateWorldEntities(assembly, entity, stage)
    return "updated"
  }
  return "no-change"
}

export function tryRotateEntityToMatchWorld(
  assembly: Assembly,
  entity: AssemblyEntity,
  stage: StageNumber,
): EntityRotateResult {
  const entitySource = entity.getWorldEntity(stage)
  if (!entitySource || canBeAnyDirection(entitySource)) return "no-change"

  const type = entitySource.type

  let pair: UndergroundBeltAssemblyEntity | nil
  if (type == "underground-belt") {
    const [thePair, hasMultiple] = findUndergroundPair(assembly.content, entity as UndergroundBeltAssemblyEntity)
    if (hasMultiple) {
      undoRotate(assembly, entity, stage)
      return "cannot-flip-multi-pair-underground"
    }
    pair = thePair
  }

  // canBeAnyDirection(entitySource) is false

  const newDirection = entitySource.direction
  const rotated = newDirection != entity.getDirection()
  if (!rotated) return "no-change"
  const rotateAllowed = stage == entity.firstStage || (pair && pair.firstStage == stage)
  if (!rotateAllowed) {
    undoRotate(assembly, entity, stage)
    return "cannot-rotate"
  }
  entity.setDirection(newDirection)
  if (type == "loader" || type == "loader-1x1") {
    ;(entity as LoaderAssemblyEntity).setTypeProperty(entitySource.loader_type)
  } else if (type == "underground-belt") {
    ;(entity as UndergroundBeltAssemblyEntity).setTypeProperty(entitySource.belt_to_ground_type)
  }
  updateWorldEntities(assembly, entity, entity.firstStage)
  if (pair) {
    pair.setDirection(newDirection)
    pair.setTypeProperty(entitySource.belt_to_ground_type == "input" ? "output" : "input")
    updateWorldEntities(assembly, pair, pair.firstStage)
  }
  return "updated"
}

function checkUpgradeType(existing: AssemblyEntity, upgradeType: string): void {
  if (!areUpgradeableTypes(existing.firstValue.name, upgradeType))
    error(` incompatible upgrade from ${existing.firstValue.name} to ${upgradeType}`)
}

function tryApplyUndergroundUpgradeTarget(
  assembly: Assembly,
  stage: StageNumber,
  entity: UndergroundBeltAssemblyEntity,
  entitySource: LuaEntity,
): EntityUpdateResult {
  const upgradeType = entitySource.get_upgrade_target()?.name
  if (!upgradeType) return "no-change"
  checkUpgradeType(entity, upgradeType)
  return tryUpgradeUndergroundBelt(assembly, stage, entity, upgradeType)
}

export function tryApplyUpgradeTarget(
  assembly: Assembly,
  entity: AssemblyEntity,
  stage: StageNumber,
): EntityUpdateResult {
  const entitySource = entity.getWorldEntity(stage)
  if (!entitySource) return "no-change"
  if (entitySource.type == "underground-belt") {
    return tryApplyUndergroundUpgradeTarget(assembly, stage, entity as UndergroundBeltAssemblyEntity, entitySource)
  }

  const rotateDir = entitySource.get_upgrade_direction()
  const rotated = rotateDir != nil && rotateDir != entity.getDirection() && !canBeAnyDirection(entitySource)
  if (rotated) {
    const rotateAllowed = stage == entity.firstStage
    if (rotateAllowed) {
      entity.setDirection(rotateDir)
    } else {
      undoRotate(assembly, entity, stage)
      return "cannot-rotate"
    }
  }

  let upgraded = false
  const upgradeType = entitySource.get_upgrade_target()?.name
  if (upgradeType) {
    checkUpgradeType(entity, upgradeType)
    upgraded = entity.applyUpgradeAtStage(stage, upgradeType)
  }
  if (rotated || upgraded) {
    updateWorldEntities(assembly, entity, stage)
    return "updated"
  }
  return "no-change"
}

function checkDefaultControlBehavior(assembly: Assembly, entity: AssemblyEntity, stage: StageNumber): boolean {
  if (stage <= entity.firstStage || hasControlBehaviorSet(entity, stage)) return false
  fixEmptyControlBehavior(entity)
  const luaEntity = entity.getWorldEntity(stage)
  if (luaEntity) doUpdateEntityFromWorld(assembly, stage, entity, luaEntity)
  return true
}

export function updateWiresFromWorld(assembly: Assembly, entity: AssemblyEntity, stage: StageNumber): WireUpdateResult {
  const [connectionsChanged, maxConnectionsExceeded] = saveWireConnections(assembly.content, entity, stage, stage)
  if (maxConnectionsExceeded) {
    updateWorldEntities(assembly, entity, entity.firstStage)
    return "max-connections-exceeded"
  }
  if (!connectionsChanged) return "no-change"

  const circuitConnections = assembly.content.getCircuitConnections(entity)
  if (circuitConnections) checkDefaultControlBehavior(assembly, entity, stage)
  updateWorldEntities(assembly, entity, entity.firstStage)
  if (circuitConnections) {
    for (const [otherEntity] of circuitConnections) {
      if (checkDefaultControlBehavior(assembly, otherEntity, stage)) {
        updateWorldEntities(assembly, otherEntity, otherEntity.firstStage)
      }
    }
  }
  return "updated"
}

export function moveEntityToStage(assembly: Assembly, entity: AssemblyEntity, stage: StageNumber): StageMoveResult {
  if (entity.isSettingsRemnant) return "no-change"
  const oldStage = entity.firstStage
  if (oldStage == stage) return "no-change"

  if (entity.isUndergroundBelt() && entity.hasStageDiff()) {
    return "cannot-move-upgraded-underground"
  }

  // move
  entity.moveToStage(stage)
  updateWorldEntities(assembly, entity, min(oldStage, stage))
  return "updated"
}

export function resetProp<T extends Entity>(
  assembly: Assembly,
  entity: AssemblyEntity<T>,
  stageNumber: StageNumber,
  prop: keyof T,
): boolean {
  const moved = entity.resetProp(stageNumber, prop)
  if (moved) updateWorldEntities(assembly, entity, stageNumber)
  return moved
}

export function movePropDown<T extends Entity>(
  assembly: Assembly,
  entity: AssemblyEntity<T>,
  stageNumber: StageNumber,
  prop: keyof T,
): boolean {
  const movedStage = entity.movePropDown(stageNumber, prop)
  if (movedStage) {
    updateWorldEntities(assembly, entity, movedStage)
    return true
  }
  return false
}

export function resetAllProps(assembly: Assembly, entity: AssemblyEntity, stageNumber: StageNumber): boolean {
  const moved = entity.resetValue(stageNumber)
  if (moved) updateWorldEntities(assembly, entity, stageNumber)
  return moved
}

export function moveAllPropsDown(assembly: Assembly, entity: AssemblyEntity, stageNumber: StageNumber): boolean {
  const movedStage = entity.moveValueDown(stageNumber)
  if (movedStage) {
    updateWorldEntities(assembly, entity, movedStage)
    return true
  }
  return false
}

export function resetTrain(assembly: Assembly, entity: RollingStockAssemblyEntity): void {
  const stage = entity.firstStage
  const luaEntity = entity.getWorldEntity(stage)
  if (!luaEntity) {
    refreshWorldEntityAtStage(assembly, entity, stage)
    return
  }

  const train = luaEntity.train
  if (!train) return

  const entities = train.carriages

  const content = assembly.content
  const assemblyEntities = entities.map((e) => content.findCompatibleWithLuaEntity(e, nil, stage)!)
  for (const entity of assemblyEntities) entity.destroyAllWorldOrPreviewEntities()
  for (const entity of assemblyEntities) rebuildWorldEntityAtStage(assembly, entity, stage)
}

export function setTrainLocationToCurrent(assembly: Assembly, entity: RollingStockAssemblyEntity): void {
  const stage = entity.firstStage
  const luaEntity = entity.getWorldEntity(stage)
  if (!luaEntity) return

  const train = luaEntity.train
  if (!train) return

  const entities = train.carriages
  const content = assembly.content

  for (const luaEntity of entities) {
    const assemblyEntity = content.findCompatibleWithLuaEntity(luaEntity, nil, stage)
    if (assemblyEntity) {
      content.changePosition(assemblyEntity, luaEntity.position)
      rebuildWorldEntityAtStage(assembly, assemblyEntity, stage)
    } else {
      // add
      addNewEntity(assembly, luaEntity, stage)
    }
  }
}

export const _mockable = true
