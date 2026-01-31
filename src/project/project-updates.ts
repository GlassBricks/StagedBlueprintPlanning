// Copyright (c) 2022-2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { BlueprintInsertPlan, LuaEntity, LuaTrain, nil } from "factorio:runtime"
import { Entity, TrainEntity } from "../entity/Entity"
import {
  getNameAndQuality,
  InserterProjectEntity,
  LoaderProjectEntity,
  MovableProjectEntity,
  NameAndQuality,
  newProjectEntity,
  ProjectEntity,
  StageDiffs,
  StageNumber,
  UndergroundBeltProjectEntity,
} from "../entity/ProjectEntity"
import { areUpgradeableTypes, getPrototypeInfo } from "../entity/prototype-info"
import { canBeAnyDirection, forceFlipUnderground, saveEntity } from "../entity/save-load"
import { findUndergroundPair, undergroundCanReach } from "../entity/underground-belt"
import { saveWireConnections } from "../entity/wires"
import { fromExportStageDiffs, StageInfoExport } from "../import-export/entity"
import { Pos, Position } from "../lib/geometry"
import { createProjectTile, ProjectTile } from "../tiles/ProjectTile"
import { Project } from "./ProjectDef"
import { WorldUpdates } from "./world-updates"
import min = math.min

export declare const enum EntityUpdateResult {
  Updated = "updated",
  NoChange = "no-change",
  CannotRotate = "cannot-rotate",
  CannotUpgradeChangedPair = "cannot-upgrade-changed-pair",
}

export declare const enum WireUpdateResult {
  Updated = "updated",
  NoChange = "no-change",
}

export declare const enum StageMoveResult {
  Updated = "updated",
  NoChange = "no-change",
  CannotMovePastLastStage = "cannot-move-past-last-stage",
  CannotMoveBeforeFirstStage = "cannot-move-before-first-stage",
  IntersectsAnotherEntity = "intersects-another-entity",
  EntityIsPersistent = "entity-is-persistent",
}

/** @noSelf */
export interface ProjectUpdates {
  addNewEntity<E extends Entity = Entity>(
    entity: LuaEntity,
    stage: StageNumber,
    stagedInfo?: StageInfoExport,
    items?: BlueprintInsertPlan[],
  ): ProjectEntity<E> | nil
  addNewEntity(
    entity: LuaEntity,
    stage: StageNumber,
    stagedInfo?: StageInfoExport,
    items?: BlueprintInsertPlan[],
  ): ProjectEntity | nil

  maybeDeleteProjectEntity(entity: ProjectEntity, stage: StageNumber): void
  deleteEntityOrCreateSettingsRemnant(entity: ProjectEntity): void

  /** Deleted entities should be able to be re-added via readdDeletedEntity */
  forceDeleteEntity(entity: ProjectEntity): void
  readdDeletedEntity(entity: ProjectEntity): void

  tryReviveSettingsRemnant(entity: ProjectEntity, stage: StageNumber): StageMoveResult
  tryUpdateEntityFromWorld(entity: ProjectEntity, stage: StageNumber, items?: BlueprintInsertPlan[]): EntityUpdateResult
  tryRotateEntityFromWorld(entity: ProjectEntity, stage: StageNumber): EntityUpdateResult
  tryUpgradeEntityFromWorld(entity: ProjectEntity, stage: StageNumber): EntityUpdateResult
  updateWiresFromWorld(entity: ProjectEntity, stage: StageNumber): WireUpdateResult

  setValueFromStagedInfo(
    entity: ProjectEntity,
    info: StageInfoExport,
    items: BlueprintInsertPlan[] | nil,
    luaEntity: LuaEntity,
  ): StageMoveResult

  trySetFirstStage(entity: ProjectEntity, stage: StageNumber): StageMoveResult
  trySetLastStage(entity: ProjectEntity, stage: StageNumber | nil): StageMoveResult

  resetProp<T extends Entity>(entity: ProjectEntity<T>, stage: StageNumber, prop: keyof T): boolean
  movePropDown<T extends Entity>(entity: ProjectEntity<T>, stage: StageNumber, prop: keyof T): boolean
  resetAllProps(entity: ProjectEntity, stage: StageNumber): boolean
  moveAllPropsDown(entity: ProjectEntity, stage: StageNumber): boolean

  resetVehicleLocation(entity: MovableProjectEntity): void
  setVehicleLocationHere(entity: MovableProjectEntity): void

  setTileAtStage(position: Position, stage: StageNumber, value: string | nil): void
  deleteTile(position: Position): boolean

  scanProjectForExistingTiles(): void
}

export function ProjectUpdates(project: Project, WorldUpdates: WorldUpdates): ProjectUpdates {
  const content = project.content
  const wp = project.worldPresentation

  const {
    deleteWorldEntities,
    makeSettingsRemnant,
    rebuildWorldEntityAtStage,
    refreshWorldEntityAtStage,
    resetUnderground,
    reviveSettingsRemnant,
    updateNewWorldEntitiesWithoutWires,
    updateWireConnections,
    updateWorldEntities,
    updateWorldEntitiesOnLastStageChanged,
    updateAllHighlights,
    updateTilesInRange,
  } = WorldUpdates

  return {
    addNewEntity,
    maybeDeleteProjectEntity,
    deleteEntityOrCreateSettingsRemnant,
    forceDeleteEntity,
    readdDeletedEntity,
    tryReviveSettingsRemnant,
    tryUpdateEntityFromWorld,
    tryRotateEntityFromWorld,
    tryUpgradeEntityFromWorld,
    updateWiresFromWorld,
    setValueFromStagedInfo,
    trySetFirstStage,
    trySetLastStage,
    resetProp,
    movePropDown,
    resetAllProps,
    moveAllPropsDown,
    resetVehicleLocation,
    setVehicleLocationHere,
    setTileAtStage,
    deleteTile: removeTile,
    scanProjectForExistingTiles,
  }

  function fixNewUndergroundBelt(projectEntity: ProjectEntity, entity: LuaEntity, stage: StageNumber): void {
    if (entity.type != "underground-belt") return
    assume<UndergroundBeltProjectEntity>(projectEntity)
    const pair = findUndergroundPair(content, projectEntity, stage)
    if (pair) {
      const expectedType = pair.firstValue.type == "output" ? "input" : "output"
      if (expectedType != projectEntity.firstValue.type) {
        const mut = projectEntity._asMut()
        mut.setTypeProperty(expectedType)
        mut.direction = pair.direction
      }
    }
  }

  function createNewProjectEntity(
    entity: LuaEntity,
    stage: StageNumber,
    stageInfo: StageInfoExport | nil,
    items?: BlueprintInsertPlan[],
  ): ProjectEntity | nil {
    if (stageInfo) {
      return createProjectEntityFromStagedInfo(entity, stageInfo, items)
    }

    const [value, unstagedValue] = saveEntity(entity, items)
    if (!value) return nil
    return newProjectEntity(value, entity.position, entity.direction, stage, unstagedValue)
  }
  function addNewEntity(
    entity: LuaEntity,
    stage: StageNumber,
    stageInfo?: StageInfoExport,
    items?: BlueprintInsertPlan[],
  ): ProjectEntity | nil {
    const projectEntity = createNewProjectEntity(entity, stage, stageInfo, items)
    if (!projectEntity) return nil
    wp.replaceWorldOrPreviewEntity(projectEntity, stage, entity)
    content.addEntity(projectEntity)

    fixNewUndergroundBelt(projectEntity, entity, stage)

    if (projectEntity.getType() == "locomotive") {
      projectEntity._asMut().isNewRollingStock = true
    }

    updateNewWorldEntitiesWithoutWires(projectEntity)
    const hasDiff = saveWireConnections(content, projectEntity, stage, project.lastStageFor(projectEntity), wp)
    if (hasDiff) {
      updateWireConnections(projectEntity)
    }
    updateAllHighlights(projectEntity)

    return projectEntity
  }

  function shouldMakeSettingsRemnant(entity: ProjectEntity) {
    if (entity.hasStageDiff()) return true
    const connections = entity.wireConnections
    if (!connections) return false
    const stage = entity.firstStage
    for (const [otherEntity] of connections) {
      if (wp.getWorldEntity(otherEntity, stage) == nil) {
        // has a connection at the first stage, but not one in the world
        return true
      }
    }
    return false
  }
  function maybeDeleteProjectEntity(projectEntity: ProjectEntity, stage: number): void {
    const firstStage = projectEntity.firstStage

    if (firstStage != stage) {
      if (firstStage < stage) {
        rebuildWorldEntityAtStage(projectEntity, stage)
      }
      // else: stage > existingStage; bug, ignore
      return
    }

    deleteEntityOrCreateSettingsRemnant(projectEntity)
  }
  function deleteEntityOrCreateSettingsRemnant(entity: ProjectEntity): void {
    if (shouldMakeSettingsRemnant(entity)) {
      entity._asMut().isSettingsRemnant = true
      makeSettingsRemnant(entity)
    } else {
      deleteWorldEntities(entity)
      content.deleteEntity(entity)
    }
  }

  function forceDeleteEntity(entity: ProjectEntity): void {
    deleteWorldEntities(entity)
    content.deleteEntity(entity)
  }

  function readdDeletedEntity(entity: ProjectEntity): void {
    content.addEntity(entity)
    updateWorldEntities(entity, 1)
  }

  function tryReviveSettingsRemnant(entity: ProjectEntity, stage: StageNumber): StageMoveResult {
    if (!entity.isSettingsRemnant) return StageMoveResult.NoChange
    if (entity.isPersistent()) return StageMoveResult.EntityIsPersistent
    const result = checkCanSetFirstStage(entity, stage)
    if (result == StageMoveResult.Updated || result == StageMoveResult.NoChange) {
      const mut = entity._asMut()
      mut.setFirstStageUnchecked(stage)
      mut.isSettingsRemnant = nil
      reviveSettingsRemnant(entity)
    }
    return result
  }

  function applyValueFromWorld(
    stage: StageNumber,
    entity: ProjectEntity,
    entitySource: LuaEntity,
    items: BlueprintInsertPlan[] | nil,
  ): boolean {
    const [value, unstagedValue] = saveEntity(entitySource, items)
    if (value == nil) return false

    const mut = entity._asMut()
    const hasDiff = mut.adjustValueAtStage(stage, value)
    const hasUnstagedDiff = mut.setUnstagedValue(stage, unstagedValue)
    return hasDiff || hasUnstagedDiff
  }

  function tryUpdateEntityFromWorld(
    entity: ProjectEntity,
    stage: StageNumber,
    items: BlueprintInsertPlan[] | nil,
  ): EntityUpdateResult {
    const entitySource = wp.getWorldEntity(entity, stage)
    if (!entitySource) return EntityUpdateResult.NoChange
    return handleUpdate(entity, entitySource, stage, entitySource.direction, nil, true, items)
  }

  function tryRotateEntityFromWorld(entity: ProjectEntity, stage: StageNumber): EntityUpdateResult {
    const entitySource = wp.getWorldEntity(entity, stage)
    if (!entitySource) return EntityUpdateResult.NoChange
    return handleUpdate(entity, entitySource, stage, entitySource.direction, nil, false, nil)
  }

  function checkUpgradeType(existing: ProjectEntity, upgradeType: string): void {
    if (!areUpgradeableTypes(existing.firstValue.name, upgradeType))
      error(` incompatible upgrade from ${existing.firstValue.name} to ${upgradeType}`)
  }

  function tryUpgradeEntityFromWorld(entity: ProjectEntity, stage: StageNumber): EntityUpdateResult {
    const entitySource = wp.getWorldEntity(entity, stage)
    if (!entitySource) return EntityUpdateResult.NoChange

    const [upgradeName, upgradeQuality] = entitySource.get_upgrade_target()
    const targetUpgrade = upgradeName && getNameAndQuality(upgradeName.name, upgradeQuality?.name)
    return handleUpdate(entity, entitySource, stage, nil, targetUpgrade, false, nil)
  }

  function handleUpdate(
    entity: ProjectEntity,
    entitySource: LuaEntity,
    stage: StageNumber,
    targetDirection: defines.direction | nil,
    targetUpgrade: NameAndQuality | nil,
    getBpValue: boolean,
    items: BlueprintInsertPlan[] | nil,
  ): EntityUpdateResult {
    if (entity.isUndergroundBelt()) {
      return handleUndergroundBeltUpdate(
        entity,
        entitySource,
        stage,
        targetDirection,
        targetUpgrade ?? getNameAndQuality(entitySource.name, entitySource.quality.name),
      )
    }

    const rotated = targetDirection && targetDirection != entity.direction && !canBeAnyDirection(entitySource)
    if (rotated) {
      const rotateAllowed = stage == entity.firstStage
      if (rotateAllowed) {
        entity._asMut().direction = targetDirection
        const entityType = entitySource.type
        if (entityType == "loader" || entityType == "loader-1x1") {
          assume<LoaderProjectEntity>(entity)
          entity._asMut().setTypeProperty(entitySource.loader_type)
        } else if (entityType == "inserter") {
          assume<InserterProjectEntity>(entity)
          // also update pickup and drop positions
          // Need a relative position when setting the positions, but we only get an absolute when retrieving them from
          // the source, so we need to translate them
          const inserterMut = entity._asMut()
          if (entity.firstValue.pickup_position)
            inserterMut.setPickupPosition(Pos.minus(entitySource.pickup_position, entitySource.position))
          if (entity.firstValue.drop_position)
            inserterMut.setDropPosition(Pos.minus(entitySource.drop_position, entitySource.position))
        }
      } else {
        refreshWorldEntityAtStage(entity, stage)
        return EntityUpdateResult.CannotRotate
      }
    }
    let hasDiff = false
    if (getBpValue && applyValueFromWorld(stage, entity, entitySource, items)) {
      hasDiff = true
    } else if (targetUpgrade) {
      checkUpgradeType(entity, targetUpgrade.name)
      if (entity._asMut().applyUpgradeAtStage(stage, targetUpgrade)) {
        hasDiff = true
      }
    }
    if (rotated || hasDiff) {
      updateWorldEntities(entity, stage)
      return EntityUpdateResult.Updated
    }

    // Pasting a blueprint in editor mode may remove item requests; refresh those requests
    if (entity.getUnstagedValue(stage)?.items) {
      updateWorldEntities(entity, stage)
    }
    return EntityUpdateResult.NoChange
  }

  function updatePair(
    entity1: UndergroundBeltProjectEntity,
    entity1Stage: StageNumber,
    entity2: UndergroundBeltProjectEntity,
    entity2Stage: StageNumber,
  ) {
    // delay updating of highlights, since both pairs might need to be rotated together to avoid errors
    updateWorldEntities(entity1, entity1Stage, false)
    updateWorldEntities(entity2, entity2Stage, false)
    updateAllHighlights(entity1)
    updateAllHighlights(entity2)
  }

  function handleUndergroundFlippedBack(
    entity: UndergroundBeltProjectEntity,
    worldEntity: LuaEntity,
    stage: StageNumber,
    targetDirection: defines.direction,
    pair: UndergroundBeltProjectEntity | nil,
  ): EntityUpdateResult {
    if (!pair) {
      // allow
      updateWorldEntities(entity, stage)
      return EntityUpdateResult.NoChange
    }
    if (pair.direction == targetDirection) {
      // pair is already correct direction
      updatePair(entity, entity.firstStage, pair, pair.firstStage)
      return EntityUpdateResult.NoChange
    }
    // this wasn't rotated, but pair was
    const rotateAllowed = stage == entity.firstStage || pair.firstStage == stage
    if (!rotateAllowed) {
      forceFlipUnderground(worldEntity) // back to broken state
      return EntityUpdateResult.CannotRotate
    }
    // rotate pair
    const pairMut = pair._asMut()
    pairMut.direction = worldEntity.direction
    const oppositeType = worldEntity.belt_to_ground_type == "input" ? "output" : "input"
    pairMut.setTypeProperty(oppositeType)
    updatePair(entity, entity.firstStage, pair, pair.firstStage)
    return EntityUpdateResult.Updated
  }

  function doUndergroundBeltUpdate(
    thisUg: UndergroundBeltProjectEntity,
    worldEntity: LuaEntity,
    pair: UndergroundBeltProjectEntity | nil,
    stage: StageNumber,
    targetDirection: defines.direction | nil,
    targetUpgrade: NameAndQuality,
  ): EntityUpdateResult {
    const rotated = targetDirection && targetDirection != thisUg.direction

    const oldUpgrade = thisUg.getUpgradeAtStage(stage)
    // const upgraded = targetUpgrade != oldUpgrade
    const upgraded = targetUpgrade.name != oldUpgrade.name || targetUpgrade.quality != oldUpgrade.quality

    if (!rotated && !upgraded) {
      if (!targetDirection) return EntityUpdateResult.NoChange
      return handleUndergroundFlippedBack(thisUg, worldEntity, stage, targetDirection, pair)
    }

    const isSelfOrPairFirstStage = stage == thisUg.firstStage || (pair && pair.firstStage == stage)

    if (rotated) {
      const rotateAllowed = isSelfOrPairFirstStage
      if (!rotateAllowed) {
        resetUnderground(thisUg, stage)
        return EntityUpdateResult.CannotRotate
      }

      const thisUgMut = thisUg._asMut()
      thisUgMut.direction = targetDirection
      const oldType = thisUg.firstValue.type
      const newType = oldType == "input" ? "output" : "input"
      thisUgMut.setTypeProperty(newType)
      if (pair) {
        const pairMut = pair._asMut()
        pairMut.direction = targetDirection
        pairMut.setTypeProperty(oldType)
      }
    }

    const applyStage = isSelfOrPairFirstStage ? thisUg.firstStage : stage
    const pairApplyStage = pair && isSelfOrPairFirstStage ? pair.firstStage : stage
    let cannotUpgradeChangedPair = false
    let newPair: UndergroundBeltProjectEntity | nil = nil
    if (upgraded) {
      thisUg._asMut().applyUpgradeAtStage(applyStage, targetUpgrade)
      newPair = findUndergroundPair(content, thisUg, stage, targetUpgrade.name)
      if (pair == nil) {
        if (newPair != nil) {
          const pairPair = findUndergroundPair(content, newPair, stage, nil, thisUg)
          cannotUpgradeChangedPair = pairPair != nil && pairPair != thisUg
        }
      } else {
        cannotUpgradeChangedPair = newPair != nil && newPair != pair
      }
      if (cannotUpgradeChangedPair) {
        thisUg._asMut().applyUpgradeAtStage(stage, oldUpgrade)
      } else if (pair) {
        if (undergroundCanReach(thisUg, pair, targetUpgrade.name)) {
          pair._asMut().applyUpgradeAtStage(pairApplyStage, targetUpgrade)
        } else {
          pair = nil
        }
      }
    }

    if (cannotUpgradeChangedPair && !rotated) {
      refreshWorldEntityAtStage(thisUg, stage)
      if (pair) refreshWorldEntityAtStage(pair, stage)
    } else if (!pair) {
      updateWorldEntities(thisUg, applyStage)
    } else {
      updatePair(thisUg, applyStage, pair, pairApplyStage)
    }
    return cannotUpgradeChangedPair ? EntityUpdateResult.CannotUpgradeChangedPair : EntityUpdateResult.Updated
  }
  function handleUndergroundBeltUpdate(
    entity: UndergroundBeltProjectEntity,
    worldEntity: LuaEntity,
    stage: StageNumber,
    targetDirection: defines.direction | nil,
    targetUpgrade: NameAndQuality,
  ): EntityUpdateResult {
    const pair = findUndergroundPair(content, entity, stage)
    const updateResult = doUndergroundBeltUpdate(entity, worldEntity, pair, stage, targetDirection, targetUpgrade)

    const newWorldEntity = wp.getWorldEntity(entity, stage)
    if (newWorldEntity) {
      const worldPair = newWorldEntity.neighbours as LuaEntity | nil
      if (worldPair && (!pair || wp.getWorldEntity(pair, stage) != worldPair)) {
        // this pair is not the expected pair, so doUndergroundBeltUpdate didn't update it
        // this is an error state, just update highlights
        const worldPairEntity = content.findCompatibleWithLuaEntity(worldPair, nil, stage)
        if (worldPairEntity) updateAllHighlights(worldPairEntity)
      }
    }

    return updateResult
  }

  function updateWiresFromWorld(entity: ProjectEntity, stage: StageNumber): WireUpdateResult {
    const connectionsChanged = saveWireConnections(content, entity, stage, stage, wp)
    if (!connectionsChanged) return WireUpdateResult.NoChange

    updateWorldEntities(entity, entity.firstStage)
    return WireUpdateResult.Updated
  }

  function handleUndergroundBeltValueSet(
    entity: UndergroundBeltProjectEntity,
    oldStageDiffs: StageDiffs | nil,
    stageDiffs: StageDiffs | nil,
  ): void {
    const possiblyUpdatedStages = newLuaSet<StageNumber>()
    if (oldStageDiffs) {
      for (const [stage] of pairs(oldStageDiffs)) possiblyUpdatedStages.add(stage)
    }
    if (stageDiffs) {
      for (const [stage] of pairs(stageDiffs)) possiblyUpdatedStages.add(stage)
    }
    const ugPairs = newLuaSet<UndergroundBeltProjectEntity>()
    for (const stage of possiblyUpdatedStages) {
      const pair = findUndergroundPair(content, entity, stage)
      if (pair) ugPairs.add(pair)
    }
    for (const pair of ugPairs) {
      updateAllHighlights(pair)
    }
  }

  function createProjectEntityFromStagedInfo(
    entity: LuaEntity,
    stageInfo: StageInfoExport,
    items: BlueprintInsertPlan[] | nil,
  ): ProjectEntity | nil {
    const [value, unstagedValue] = saveEntity(entity, items)
    if (!value) return nil

    const projectEntity = newProjectEntity(
      stageInfo.firstValue ?? value,
      entity.position,
      entity.direction,
      stageInfo.firstStage,
      unstagedValue,
    )
    projectEntity.setLastStageUnchecked(stageInfo.lastStage)
    const diffs = stageInfo.stageDiffs
    if (diffs) {
      projectEntity.setStageDiffsDirectly(fromExportStageDiffs(diffs))
    }
    replaceUnstagedValue(projectEntity, stageInfo)
    return projectEntity
  }

  function setValueFromStagedInfo(
    entity: ProjectEntity,
    info: StageInfoExport,
    items: BlueprintInsertPlan[],
    luaEntity: LuaEntity,
  ): StageMoveResult {
    const firstValue = info.firstValue ?? saveEntity(luaEntity, items)[0]
    if (!firstValue) return StageMoveResult.NoChange
    const targetStage = info.firstStage
    if (targetStage != entity.firstStage) {
      const result = checkCanSetFirstStage(entity, targetStage)
      if (result != StageMoveResult.Updated) return result
      entity._asMut().setFirstStageUnchecked(targetStage)
    }
    const lastStage = info.lastStage
    const oldLastStage = entity.lastStage
    if (lastStage != oldLastStage) {
      const result = checkCanSetLastStage(entity, lastStage)
      if (result != StageMoveResult.Updated) return result
      entity._asMut().setLastStageUnchecked(lastStage)

      // delete entities from oldLastStage to newLastStage if applicable
      if (lastStage != nil && (oldLastStage == nil || lastStage < oldLastStage))
        updateWorldEntitiesOnLastStageChanged(entity, oldLastStage)
    }

    const oldStageDiffs = entity.stageDiffs

    const entityMut = entity._asMut()
    entityMut.setFirstValueDirectly(firstValue)
    const stageDiffs = info.stageDiffs ? fromExportStageDiffs(info.stageDiffs) : nil
    entityMut.setStageDiffsDirectly(stageDiffs)
    replaceUnstagedValue(entity, info)

    updateWorldEntities(entity, 1)

    if (entity.isUndergroundBelt()) {
      handleUndergroundBeltValueSet(entity, oldStageDiffs, stageDiffs)
    }
    return StageMoveResult.Updated
  }

  function replaceUnstagedValue(entity: ProjectEntity<Entity>, info: StageInfoExport<Entity>) {
    const unstagedValues = info.unstagedValue
    if (unstagedValues != nil) {
      const entityMut = entity._asMut()
      entityMut.clearPropertyInAllStages("unstagedValue")
      for (const [stage, value] of pairs(unstagedValues)) {
        const stageNumber = tonumber(stage)
        if (stageNumber == nil) continue
        entityMut.setUnstagedValue(stageNumber, value)
      }
    }
  }

  function firstStageChangeWillIntersect(entity: ProjectEntity, newStage: StageNumber): boolean {
    // moving up is ok
    if (newStage >= entity.firstStage) return true

    // check moving down
    const foundBelow = content.findCompatibleWithExistingEntity(entity, newStage)
    return foundBelow == nil || foundBelow == entity
  }

  function lastStageChangeWillIntersect(entity: ProjectEntity, newStage: StageNumber | nil): boolean {
    const { lastStage } = entity
    // moving down is ok
    if (lastStage == nil || (newStage != nil && newStage < lastStage)) return true

    // check moving up
    const foundAbove = content.findCompatibleWithExistingEntity(entity, lastStage + 1)
    return foundAbove == nil || (newStage != nil && foundAbove.firstStage > newStage)
  }

  function checkCanSetFirstStage(entity: ProjectEntity, stage: StageNumber): StageMoveResult {
    if (entity.isPersistent() && stage != 1) return StageMoveResult.EntityIsPersistent
    if (entity.isSettingsRemnant || entity.firstStage == stage) return StageMoveResult.NoChange
    if (entity.isMovable()) return StageMoveResult.Updated
    if (entity.lastStage && stage > entity.lastStage) return StageMoveResult.CannotMovePastLastStage

    if (!firstStageChangeWillIntersect(entity, stage)) {
      return StageMoveResult.IntersectsAnotherEntity
    }
    return StageMoveResult.Updated
  }

  function trySetFirstStage(entity: ProjectEntity, stage: StageNumber): StageMoveResult {
    const result = checkCanSetFirstStage(entity, stage)
    if (result == StageMoveResult.Updated) {
      const oldFirstStage = entity.firstStage
      const stageToUpdate = min(oldFirstStage, stage)
      const oldLastStage = entity.lastStage
      entity._asMut().setFirstStageUnchecked(stage)
      if (entity.isMovable() && stage < oldFirstStage) {
        updateWorldEntitiesOnLastStageChanged(entity, oldLastStage)
      }
      updateWorldEntities(entity, stageToUpdate)
    }
    return result
  }

  function checkCanSetLastStage(entity: ProjectEntity, stage: StageNumber | nil): StageMoveResult {
    if (entity.isPersistent()) return StageMoveResult.EntityIsPersistent
    if (entity.isSettingsRemnant || entity.isMovable()) return StageMoveResult.NoChange
    const oldLastStage = entity.lastStage
    if (oldLastStage == stage) return StageMoveResult.NoChange
    // check firstStage <= lastStage
    if (stage != nil && stage < entity.firstStage) return StageMoveResult.CannotMoveBeforeFirstStage

    if (!lastStageChangeWillIntersect(entity, stage)) {
      return StageMoveResult.IntersectsAnotherEntity
    }

    return StageMoveResult.Updated
  }

  function trySetLastStage(entity: ProjectEntity, stage: StageNumber | nil): StageMoveResult {
    const result = checkCanSetLastStage(entity, stage)
    if (result == StageMoveResult.Updated) {
      const oldLastStage = entity.lastStage
      entity._asMut().setLastStageUnchecked(stage)
      updateWorldEntitiesOnLastStageChanged(entity, oldLastStage)
    }
    return result
  }

  function resetProp<T extends Entity>(entity: ProjectEntity<T>, stageNumber: StageNumber, prop: keyof T): boolean {
    const moved = entity._asMut().resetProp(stageNumber, prop)
    if (moved) updateWorldEntities(entity, stageNumber)
    return moved
  }

  function movePropDown<T extends Entity>(entity: ProjectEntity<T>, stageNumber: StageNumber, prop: keyof T): boolean {
    const movedStage = entity._asMut().movePropDown(stageNumber, prop)
    if (movedStage) {
      updateWorldEntities(entity, movedStage)
      return true
    }
    return false
  }

  function resetAllProps(entity: ProjectEntity, stageNumber: StageNumber): boolean {
    const moved = entity._asMut().resetValue(stageNumber)
    if (moved) updateWorldEntities(entity, stageNumber)
    return moved
  }

  function moveAllPropsDown(entity: ProjectEntity, stageNumber: StageNumber): boolean {
    const movedStage = entity._asMut().moveValueDown(stageNumber)
    if (movedStage) {
      updateWorldEntities(entity, movedStage)
      return true
    }
    return false
  }

  function resetVehicleLocation(entity: MovableProjectEntity): void {
    const stage = entity.firstStage
    const luaEntity = wp.getWorldEntity(entity, stage)
    if (!luaEntity) {
      refreshWorldEntityAtStage(entity, stage)
      return
    }

    const train = luaEntity.train
    if (train) {
      const projectEntities = train.carriages.map((e) => content.findCompatibleWithLuaEntity(e, nil, stage)!)
      for (const entity of projectEntities) wp.destroyAllWorldOrPreviewEntities(entity)
      for (const entity of projectEntities) rebuildWorldEntityAtStage(entity, stage)
    } else {
      rebuildWorldEntityAtStage(entity, stage)
    }
  }

  function setVehicleLocationHere(entity: MovableProjectEntity): void {
    const stage = entity.firstStage
    const luaEntity = wp.getWorldEntity(entity, stage)
    if (!luaEntity) return

    const train = luaEntity.train
    if (train) {
      setTrainLocationHere(train, stage)
    } else {
      content.changeEntityPosition(entity, luaEntity.position)
      rebuildWorldEntityAtStage(entity, stage)
    }
  }

  function setTrainLocationHere(train: LuaTrain, stage: StageNumber) {
    const entities = train.carriages

    for (const luaEntity of entities) {
      const projectEntity = content.findCompatibleWithLuaEntity(luaEntity, nil, stage)
      if (projectEntity) {
        content.changeEntityPosition(projectEntity, luaEntity.position)
        assume<ProjectEntity<TrainEntity>>(projectEntity)
        projectEntity._asMut().setPropAtStage(projectEntity.firstStage, "orientation", luaEntity.orientation)
        rebuildWorldEntityAtStage(projectEntity, stage)
      } else {
        // add
        addNewEntity(luaEntity, stage)
      }
    }
  }

  function setTileAtStage(position: Position, stage: StageNumber, value: string | nil): void {
    let tile = content.tiles.get(position.x, position.y)

    if (!tile && value != nil) {
      tile = createProjectTile()
      content.setTile(position, tile)
    }

    if (!tile) return

    const nextStage = tile.setTileAtStage(stage, value)

    const wasEmpty = tile.isEmpty()
    if (wasEmpty) {
      content.deleteTile(position)
    }

    const collision = updateTilesInRange(position, stage, wasEmpty ? nil : nextStage)

    if (collision) {
      if (wasEmpty) {
        tile = createProjectTile()
        content.setTile(position, tile)
      }
      tile.setTileAtStage(collision.stage, collision.actualValue)
    }
  }

  function removeTile(position: Position): boolean {
    const result = content.deleteTile(position)
    if (result) {
      updateTilesInRange(position, 1, nil)
    }
    return result
  }

  function scanProjectForExistingTiles(): void {
    const bbox = content.computeBoundingBox()
    const tilesToUpdateArray: Array<[Position, ProjectTile]> = []
    const tilesToUpdateSet = new LuaSet<ProjectTile>()

    for (const stage of $range(1, project.settings.stageCount())) {
      const surface = project.surfaces.getSurface(stage)!
      const tiles = surface.find_tiles_filtered({
        area: bbox,
        name: Object.keys(getPrototypeInfo().blueprintableTiles),
      })

      for (const tile of tiles) {
        const position = tile.position
        let projectTile = content.tiles.get(position.x, position.y)

        if (!projectTile) {
          projectTile = createProjectTile()
          content.setTile(position, projectTile)
        }

        projectTile.setTileAtStage(stage, tile.name)
        if (!tilesToUpdateSet.has(projectTile)) {
          tilesToUpdateArray.push([position, projectTile])
          tilesToUpdateSet.add(projectTile)
        }
      }
    }

    for (const [position, tile] of tilesToUpdateArray) {
      updateTilesInRange(position, tile.getFirstStage(), tile.getLastStage())
    }
  }
}
