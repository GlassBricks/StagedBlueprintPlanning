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

import { BlueprintEntity, LuaEntity } from "factorio:runtime"
import { trySetEmptyControlBehavior } from "../entity/empty-control-behavior"
import { Entity } from "../entity/Entity"
import { areUpgradeableTypes } from "../entity/entity-prototype-info"
import { ProjectContent } from "../entity/ProjectContent"
import {
  createProjectEntityNoCopy,
  LoaderProjectEntity,
  ProjectEntity,
  RollingStockProjectEntity,
  StageNumber,
  UndergroundBeltProjectEntity,
} from "../entity/ProjectEntity"
import { canBeAnyDirection, saveEntity } from "../entity/save-load"
import { findUndergroundPair } from "../entity/underground-belt"
import { saveWireConnections } from "../entity/wires"
import { Project } from "./ProjectDef"
import {
  deleteAllEntities,
  makeSettingsRemnant,
  rebuildWorldEntityAtStage,
  refreshWorldEntityAtStage,
  updateEntitiesOnSettingsRemnantRevived,
  updateNewWorldEntitiesWithoutWires,
  updateWireConnections,
  updateWorldEntities,
  updateWorldEntitiesOnLastStageChanged,
} from "./world-entity-updates"
import min = math.min

export function addNewEntity(
  project: Project,
  entity: LuaEntity,
  stage: StageNumber,
  knownValue?: BlueprintEntity,
): ProjectEntity<any> | nil {
  const saved = saveEntity(entity, knownValue)
  if (!saved) return nil
  const { content } = project
  const projectEntity = createProjectEntityNoCopy(saved, entity.position, entity.direction, stage)
  projectEntity.replaceWorldEntity(stage, entity)
  content.add(projectEntity)

  if (entity.type == "underground-belt") {
    // match direction with underground pair
    const [pair] = findUndergroundPair(content, projectEntity as UndergroundBeltProjectEntity)
    if (pair) {
      const otherDir = pair.firstValue.type
      ;(projectEntity as UndergroundBeltProjectEntity).setTypeProperty(otherDir == "output" ? "input" : "output")
    }
  }

  updateNewWorldEntitiesWithoutWires(project, projectEntity, knownValue != nil && knownValue.name != entity.name)
  const [hasDiff, , additionalToUpdate] = saveWireConnections(
    content,
    projectEntity,
    stage,
    project.lastStageFor(projectEntity),
  )
  if (hasDiff) {
    updateWireConnections(project, projectEntity)
    if (additionalToUpdate) {
      for (const otherEntity of additionalToUpdate) {
        updateWireConnections(project, otherEntity)
      }
    }
  }

  return projectEntity
}

function shouldMakeSettingsRemnant(project: Project, entity: ProjectEntity) {
  if (entity.hasStageDiff()) return true
  const connections = project.content.getCircuitConnections(entity)
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

export function deleteEntityOrCreateSettingsRemnant(project: Project, entity: ProjectEntity): void {
  if (shouldMakeSettingsRemnant(project, entity)) {
    entity.isSettingsRemnant = true
    makeSettingsRemnant(project, entity)
  } else {
    project.content.delete(entity)
    deleteAllEntities(entity)
  }
}
export function forceDeleteEntity(project: Project, entity: ProjectEntity): void {
  project.content.delete(entity)
  deleteAllEntities(entity)
}

export function tryReviveSettingsRemnant(project: Project, entity: ProjectEntity, stage: StageNumber): StageMoveResult {
  if (!entity.isSettingsRemnant) return StageMoveResult.NoChange
  const result = checkCanSetFirstStage(project, entity, stage)
  if (result == StageMoveResult.Updated || result == StageMoveResult.NoChange) {
    entity.setFirstStageUnchecked(stage)
    entity.isSettingsRemnant = nil
    updateEntitiesOnSettingsRemnantRevived(project, entity)
  }
  return result
}

export declare const enum EntityRotateResult {
  Updated = "updated",
  NoChange = "no-change",
  CannotRotate = "cannot-rotate",
  CannotFlipMultiPairUnderground = "cannot-flip-multi-pair-underground",
}

export declare const enum EntityUpdateResult {
  Updated = "updated",
  NoChange = "no-change",
  CannotRotate = "cannot-rotate",
  CannotUpgradeMultiPairUnderground = "cannot-upgrade-multi-pair-underground",
  CannotCreatePairUpgrade = "cannot-create-pair-upgrade",
  CannotUpgradeChangedPair = "cannot-upgrade-changed-pair",
}

function tryUpgradeUndergroundBelt(
  project: Project,
  stage: StageNumber,
  entity: UndergroundBeltProjectEntity,
  upgradeType: string,
): EntityUpdateResult {
  const [pair, hasMultiple] = findUndergroundPair(project.content, entity)
  if (hasMultiple) {
    return EntityUpdateResult.CannotUpgradeMultiPairUnderground
  }
  let isFirstStage = entity.firstStage == stage
  if (pair) {
    isFirstStage ||= pair.firstStage == stage
    if (!isFirstStage && entity.firstStage != pair.firstStage) {
      // createNotification(entity, byPlayer, [L_Interaction.CannotCreateUndergroundUpgradeIfNotInSameStage], true)
      return EntityUpdateResult.CannotCreatePairUpgrade
    }
  }
  const oldName = entity.firstValue.name
  const applyStage = isFirstStage ? entity.firstStage : stage
  const upgraded = entity.applyUpgradeAtStage(applyStage, upgradeType)
  if (!upgraded) return EntityUpdateResult.NoChange

  if (!pair) {
    updateWorldEntities(project, entity, applyStage)
  } else {
    const pairStage = isFirstStage ? pair.firstStage : stage
    const pairUpgraded = pair.applyUpgradeAtStage(pairStage, upgradeType)
    // check pair still correct
    const [newPair, newMultiple] = findUndergroundPair(project.content, entity)
    if (newPair != pair || newMultiple) {
      entity.applyUpgradeAtStage(applyStage, oldName)
      pair.applyUpgradeAtStage(pairStage, oldName)
      return EntityUpdateResult.CannotUpgradeChangedPair
    }

    updateWorldEntities(project, entity, applyStage)
    if (pairUpgraded) updateWorldEntities(project, pair, pairStage)
  }
  return EntityUpdateResult.Updated
}

function tryUpdateUndergroundFromFastReplace(
  project: Project,
  stage: StageNumber,
  entity: ProjectEntity,
  entitySource: LuaEntity,
): EntityUpdateResult {
  // only can upgrade via fast-replace
  const newType = entitySource.name
  if (newType == entity.getNameAtStage(stage)) return EntityUpdateResult.NoChange

  const result = tryUpgradeUndergroundBelt(project, stage, entity as UndergroundBeltProjectEntity, newType)
  if (result != EntityUpdateResult.NoChange && result != EntityUpdateResult.Updated) {
    refreshWorldEntityAtStage(project, entity, stage)
  }
  return result
}

function doUpdateEntityFromWorld(
  stage: StageNumber,
  entity: ProjectEntity,
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
  project: Project,
  entity: ProjectEntity,
  stage: StageNumber,
  knownValue?: BlueprintEntity,
): EntityUpdateResult {
  const entitySource = entity.getWorldEntity(stage)
  if (!entitySource) return EntityUpdateResult.NoChange
  if (entitySource.type == "underground-belt") {
    return tryUpdateUndergroundFromFastReplace(project, stage, entity, entitySource)
  }

  const rotated = !canBeAnyDirection(entitySource) && entitySource.direction != entity.direction
  if (rotated) {
    const rotateAllowed = stage == entity.firstStage
    if (rotateAllowed) {
      entity.direction = entitySource.direction
    } else {
      undoRotate(project, entity, stage)
      return EntityUpdateResult.CannotRotate
    }
  }

  const hasDiff = doUpdateEntityFromWorld(stage, entity, entitySource, knownValue)
  if (hasDiff || rotated) {
    updateWorldEntities(project, entity, stage)
    return EntityUpdateResult.Updated
  }
  return EntityUpdateResult.NoChange
}

export function tryRotateEntityToMatchWorld(
  project: Project,
  entity: ProjectEntity,
  stage: StageNumber,
): EntityRotateResult {
  const entitySource = entity.getWorldEntity(stage)
  if (!entitySource || canBeAnyDirection(entitySource)) return EntityRotateResult.NoChange

  const type = entitySource.type

  let pair: UndergroundBeltProjectEntity | nil
  if (type == "underground-belt") {
    const [thePair, hasMultiple] = findUndergroundPair(project.content, entity as UndergroundBeltProjectEntity)
    if (hasMultiple) {
      undoRotate(project, entity, stage)
      return EntityRotateResult.CannotFlipMultiPairUnderground
    }
    pair = thePair
  }

  // canBeAnyDirection(entitySource) is false

  const newDirection = entitySource.direction
  const rotated = newDirection != entity.direction
  if (!rotated) return EntityRotateResult.NoChange
  const rotateAllowed = stage == entity.firstStage || (pair && pair.firstStage == stage)
  if (!rotateAllowed) {
    undoRotate(project, entity, stage)
    return EntityRotateResult.CannotRotate
  }
  entity.direction = newDirection
  if (type == "loader" || type == "loader-1x1") {
    ;(entity as LoaderProjectEntity).setTypeProperty(entitySource.loader_type)
  } else if (type == "underground-belt") {
    ;(entity as UndergroundBeltProjectEntity).setTypeProperty(entitySource.belt_to_ground_type)
  }
  updateWorldEntities(project, entity, entity.firstStage)
  if (pair) {
    pair.direction = newDirection
    pair.setTypeProperty(entitySource.belt_to_ground_type == "input" ? "output" : "input")
    updateWorldEntities(project, pair, pair.firstStage)
  }
  return EntityRotateResult.Updated
}

function checkUpgradeType(existing: ProjectEntity, upgradeType: string): void {
  if (!areUpgradeableTypes(existing.firstValue.name, upgradeType))
    error(` incompatible upgrade from ${existing.firstValue.name} to ${upgradeType}`)
}

function tryApplyUndergroundUpgradeTarget(
  project: Project,
  stage: StageNumber,
  entity: UndergroundBeltProjectEntity,
  entitySource: LuaEntity,
): EntityUpdateResult {
  const upgradeType = entitySource.get_upgrade_target()?.name
  if (!upgradeType) return EntityUpdateResult.NoChange
  checkUpgradeType(entity, upgradeType)
  return tryUpgradeUndergroundBelt(project, stage, entity, upgradeType)
}

export function tryApplyUpgradeTarget(project: Project, entity: ProjectEntity, stage: StageNumber): EntityUpdateResult {
  const entitySource = entity.getWorldEntity(stage)
  if (!entitySource) return EntityUpdateResult.NoChange
  if (entitySource.type == "underground-belt") {
    return tryApplyUndergroundUpgradeTarget(project, stage, entity as UndergroundBeltProjectEntity, entitySource)
  }

  const rotateDir = entitySource.get_upgrade_direction()
  const rotated = rotateDir != nil && rotateDir != entity.direction && !canBeAnyDirection(entitySource)
  if (rotated) {
    const rotateAllowed = stage == entity.firstStage
    if (rotateAllowed) {
      entity.direction = rotateDir
    } else {
      undoRotate(project, entity, stage)
      return EntityUpdateResult.CannotRotate
    }
  }

  let upgraded = false
  const upgradeType = entitySource.get_upgrade_target()?.name
  if (upgradeType) {
    checkUpgradeType(entity, upgradeType)
    upgraded = entity.applyUpgradeAtStage(stage, upgradeType)
  }
  if (rotated || upgraded) {
    updateWorldEntities(project, entity, stage)
    return EntityUpdateResult.Updated
  }
  return EntityUpdateResult.NoChange
}

function checkDefaultControlBehavior(entity: ProjectEntity, stage: StageNumber): boolean {
  if (!trySetEmptyControlBehavior(entity, stage)) return false
  const luaEntity = entity.getWorldEntity(stage)
  if (luaEntity) doUpdateEntityFromWorld(stage, entity, luaEntity)
  return true
}

export declare const enum WireUpdateResult {
  Updated = "updated",
  NoChange = "no-change",
  MaxConnectionsExceeded = "max-connections-exceeded",
}

export function updateWiresFromWorld(project: Project, entity: ProjectEntity, stage: StageNumber): WireUpdateResult {
  const [connectionsChanged, maxConnectionsExceeded, additionalEntitiesToUpdate] = saveWireConnections(
    project.content,
    entity,
    stage,
    stage,
  )
  if (!connectionsChanged) return WireUpdateResult.NoChange

  const circuitConnections = project.content.getCircuitConnections(entity)
  // check setting no-op control behavior
  if (circuitConnections) checkDefaultControlBehavior(entity, stage)
  updateWorldEntities(project, entity, entity.firstStage)
  if (circuitConnections) {
    for (const [otherEntity] of circuitConnections) {
      if (checkDefaultControlBehavior(otherEntity, stage)) {
        updateWorldEntities(project, otherEntity, otherEntity.firstStage, false)
      }
    }
  }

  // update other entities as needed
  if (additionalEntitiesToUpdate) {
    for (const otherEntity of additionalEntitiesToUpdate) {
      updateWireConnections(project, otherEntity)
    }
  }

  if (maxConnectionsExceeded) {
    // this is last, so other updates happen even if max connections exceeded
    return WireUpdateResult.MaxConnectionsExceeded
  }
  return WireUpdateResult.Updated
}

export declare const enum StageMoveResult {
  Updated = "updated",
  NoChange = "no-change",
  CannotMoveUpgradedUnderground = "cannot-move-upgraded-underground",
  CannotMovePastLastStage = "cannot-move-past-last-stage",
  CannotMoveBeforeFirstStage = "cannot-move-before-first-stage",
  IntersectsAnotherEntity = "intersects-another-entity",
}

function firstStageChangeWillIntersect(content: ProjectContent, entity: ProjectEntity, newStage: StageNumber): boolean {
  // moving up is ok
  if (newStage >= entity.firstStage) return true

  // check moving down
  const foundBelow = content.findCompatibleWithExistingEntity(entity, newStage)
  return foundBelow == nil || foundBelow == entity
}

function lastStageChangeWillIntersect(
  content: ProjectContent,
  entity: ProjectEntity,
  newStage: StageNumber | nil,
): boolean {
  const { lastStage } = entity
  // moving down is ok
  if (lastStage == nil || (newStage != nil && newStage < lastStage)) return true

  // check moving up
  const foundAbove = content.findCompatibleWithExistingEntity(entity, lastStage + 1)
  return foundAbove == nil || (newStage != nil && foundAbove.firstStage > newStage)
}

function checkCanSetFirstStage(project: Project, entity: ProjectEntity, stage: StageNumber): StageMoveResult {
  if (entity.isSettingsRemnant) return StageMoveResult.NoChange
  const oldStage = entity.firstStage
  if (oldStage == stage) return StageMoveResult.NoChange

  if (entity.isUndergroundBelt() && entity.hasStageDiff()) {
    return StageMoveResult.CannotMoveUpgradedUnderground
  }

  // if (stage == entity.firstStage) return StageMoveResult.NoChange
  if (entity.lastStage && stage > entity.lastStage) return StageMoveResult.CannotMovePastLastStage

  if (!firstStageChangeWillIntersect(project.content, entity, stage)) {
    return StageMoveResult.IntersectsAnotherEntity
  }
  return StageMoveResult.Updated
}

export function trySetFirstStage(project: Project, entity: ProjectEntity, stage: StageNumber): StageMoveResult {
  const result = checkCanSetFirstStage(project, entity, stage)
  if (result == StageMoveResult.Updated) {
    const stageToUpdate = min(entity.firstStage, stage)
    entity.setFirstStageUnchecked(stage)
    updateWorldEntities(project, entity, stageToUpdate)
  }
  return result
}

function checkSetLastStage(project: Project, entity: ProjectEntity, stage: StageNumber | nil): StageMoveResult {
  if (entity.isSettingsRemnant) return StageMoveResult.NoChange
  const oldLastStage = entity.lastStage
  if (oldLastStage == stage) return StageMoveResult.NoChange
  // check firstStage <= lastStage
  if (stage != nil && stage < entity.firstStage) return StageMoveResult.CannotMoveBeforeFirstStage

  if (!lastStageChangeWillIntersect(project.content, entity, stage)) {
    return StageMoveResult.IntersectsAnotherEntity
  }

  return StageMoveResult.Updated
}

export function trySetLastStage(project: Project, entity: ProjectEntity, stage: StageNumber | nil): StageMoveResult {
  if (entity.isSettingsRemnant) return StageMoveResult.NoChange
  const result = checkSetLastStage(project, entity, stage)
  if (result == StageMoveResult.Updated) {
    const oldLastStage = entity.lastStage
    entity.setLastStageUnchecked(stage)
    updateWorldEntitiesOnLastStageChanged(project, entity, oldLastStage)
  }
  return result
}

export function resetProp<T extends Entity>(
  project: Project,
  entity: ProjectEntity<T>,
  stageNumber: StageNumber,
  prop: keyof T,
): boolean {
  const moved = entity.resetProp(stageNumber, prop)
  if (moved) updateWorldEntities(project, entity, stageNumber)
  return moved
}

export function movePropDown<T extends Entity>(
  project: Project,
  entity: ProjectEntity<T>,
  stageNumber: StageNumber,
  prop: keyof T,
): boolean {
  const movedStage = entity.movePropDown(stageNumber, prop)
  if (movedStage) {
    updateWorldEntities(project, entity, movedStage)
    return true
  }
  return false
}

export function resetAllProps(project: Project, entity: ProjectEntity, stageNumber: StageNumber): boolean {
  const moved = entity.resetValue(stageNumber)
  if (moved) updateWorldEntities(project, entity, stageNumber)
  return moved
}

export function moveAllPropsDown(project: Project, entity: ProjectEntity, stageNumber: StageNumber): boolean {
  const movedStage = entity.moveValueDown(stageNumber)
  if (movedStage) {
    updateWorldEntities(project, entity, movedStage)
    return true
  }
  return false
}

export function resetTrain(project: Project, entity: RollingStockProjectEntity): void {
  const stage = entity.firstStage
  const luaEntity = entity.getWorldEntity(stage)
  if (!luaEntity) {
    refreshWorldEntityAtStage(project, entity, stage)
    return
  }

  const train = luaEntity.train
  if (!train) return

  const entities = train.carriages

  const content = project.content
  const projectEntities = entities.map((e) => content.findCompatibleWithLuaEntity(e, nil, stage)!)
  for (const entity of projectEntities) entity.destroyAllWorldOrPreviewEntities()
  for (const entity of projectEntities) rebuildWorldEntityAtStage(project, entity, stage)
}

export function setTrainLocationToCurrent(project: Project, entity: RollingStockProjectEntity): void {
  const stage = entity.firstStage
  const luaEntity = entity.getWorldEntity(stage)
  if (!luaEntity) return

  const train = luaEntity.train
  if (!train) return

  const entities = train.carriages
  const content = project.content

  for (const luaEntity of entities) {
    const projectEntity = content.findCompatibleWithLuaEntity(luaEntity, nil, stage)
    if (projectEntity) {
      content.changePosition(projectEntity, luaEntity.position)
      rebuildWorldEntityAtStage(project, projectEntity, stage)
    } else {
      // add
      addNewEntity(project, luaEntity, stage)
    }
  }
}

export const _mockable = true
