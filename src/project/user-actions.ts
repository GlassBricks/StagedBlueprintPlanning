// Copyright (c) 2022-2025 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { BlueprintEntity, LuaEntity, nil, PlayerIndex } from "factorio:runtime"
import { Colors, L_Game, Settings } from "../constants"
import { LuaEntityInfo } from "../entity/Entity"
import { ProjectEntity, StageNumber } from "../entity/ProjectEntity"
import { allowOverlapDifferentDirection, getPrototypeInfo } from "../entity/prototype-info"
import { findUndergroundPair } from "../entity/underground-belt"
import { StageInfoExport } from "../import-export/entity"
import { assertNever, deepCompare } from "../lib"
import { Position } from "../lib/geometry"
import { L_Interaction } from "../locale"
import { createIndicator, createNotification } from "./notifications"
import { EntityUpdateResult, ProjectUpdates, StageMoveResult } from "./project-updates"

import { Project, UserProject } from "./ProjectDef"
import { prepareArea } from "./surfaces"
import { registerUndoAction, UndoAction, UndoHandler } from "./undo"
import { WorldUpdates } from "./world-updates"

/**
 * Entry point for actions that can be performed on a project, from user input.
 *
 * @noSelf
 */
export interface UserActions {
  onEntityCreated(entity: LuaEntity, stage: StageNumber, byPlayer: PlayerIndex | nil): UndoAction | nil
  onEntityDeleted(entity: LuaEntityInfo, stage: StageNumber): void
  onEntityPossiblyUpdated(
    entity: LuaEntity,
    stage: StageNumber,
    previousDirection: defines.direction | nil,
    byPlayer: PlayerIndex | nil,
    knownBpValue?: BlueprintEntity,
  ): ProjectEntity | nil

  onEntityRotated(
    entity: LuaEntity,
    stage: StageNumber,
    previousDirection: defines.direction,
    byPlayer: PlayerIndex | nil,
  ): void
  onUndergroundBeltDragRotated(entity: LuaEntity, stage: StageNumber, byPlayer: PlayerIndex): void
  onWiresPossiblyUpdated(entity: LuaEntity, stage: StageNumber, byPlayer: PlayerIndex | nil): void
  onEntityMarkedForUpgrade(entity: LuaEntity, stage: StageNumber, byPlayer: PlayerIndex | nil): void

  onCleanupToolUsed(entity: LuaEntity, stage: StageNumber): void
  onTryFixEntity(previewEntity: LuaEntity, stage: StageNumber, deleteSettingsRemnants?: boolean): void
  onChunkGeneratedForEntity(previewEntity: LuaEntity, stage: StageNumber): void
  onEntityForceDeleteUsed(entity: LuaEntity, stage: StageNumber, byPlayer: PlayerIndex): UndoAction | nil

  onEntityDied(entity: LuaEntityInfo, stage: StageNumber): void

  onStageDeleteUsed(entity: LuaEntity, stage: StageNumber, byPlayer: PlayerIndex): UndoAction | nil
  onStageDeleteReverseUsed(entity: LuaEntity, stage: StageNumber, byPlayer: PlayerIndex): UndoAction | nil
  onStageDeleteCancelUsed(entity: LuaEntity, stage: StageNumber, byPlayer: PlayerIndex): UndoAction | nil
  onBringToStageUsed(entity: LuaEntity, stage: StageNumber, byPlayer: PlayerIndex): UndoAction | nil
  onBringDownToStageUsed(entity: LuaEntity, stage: StageNumber, byPlayer: PlayerIndex): UndoAction | nil
  onSendToStageUsed(
    entity: LuaEntity,
    fromStage: StageNumber,
    toStage: StageNumber,
    onlyIfMatchesFirstStage: boolean,
    byPlayer: PlayerIndex,
  ): UndoAction | nil
  onMoveEntityToStageCustomInput(entity: LuaEntity, stage: StageNumber, byPlayer: PlayerIndex): UndoAction | nil

  onSurfaceCleared(stage: StageNumber): void

  userRevivedSettingsRemnant(entity: ProjectEntity, stage: StageNumber, byPlayer: PlayerIndex | nil): void
  userMoveEntityToStageWithUndo(entity: ProjectEntity, stage: StageNumber, byPlayer: PlayerIndex): void
  userSetLastStageWithUndo(projectEntity: ProjectEntity, newLastStage: StageNumber | nil, byPlayer: PlayerIndex): void
  userBringEntityToStage(projectEntity: ProjectEntity, stage: StageNumber, byPlayer: PlayerIndex): boolean
  userSendEntityToStage(
    projectEntity: ProjectEntity,
    fromStage: StageNumber,
    toStage: StageNumber,
    byPlayer: PlayerIndex,
  ): boolean

  onTileBuilt(position: Position, value: string, stage: StageNumber): void
  onTileMined(position: Position, stage: StageNumber): void
}

/** @noSelf */
interface InternalUserActions extends UserActions {
  findCompatibleEntityForUndo(entity: ProjectEntity): ProjectEntity | nil
  userTryMoveEntityToStage(
    entity: ProjectEntity,
    stage: StageNumber,
    byPlayer: PlayerIndex,
    returned?: boolean,
  ): boolean
  userTrySetLastStage(
    projectEntity: ProjectEntity,
    newLastStage: StageNumber | nil,
    byPlayer: PlayerIndex | nil,
  ): boolean
}

interface ProjectEntityRecord {
  project: Project
  entity: ProjectEntity
}

interface StageChangeRecord extends ProjectEntityRecord {
  oldStage: StageNumber
}

interface InternalProject extends UserProject {
  actions: InternalUserActions
}

const undoDeleteEntity = UndoHandler<ProjectEntityRecord>("delete entity", (_, { project, entity }) => {
  const updates = (project as InternalProject).updates
  updates.readdDeletedEntity(entity)
})

const undoManualStageMove = UndoHandler<StageChangeRecord>("stage move", (player, { project, entity, oldStage }) => {
  const actions = (project as InternalProject).actions
  const actualEntity = actions.findCompatibleEntityForUndo(entity)
  if (actualEntity) {
    actions.userTryMoveEntityToStage(actualEntity, oldStage, player.index, true)
  }
})

const undoSendToStage = UndoHandler<StageChangeRecord>("send to stage", (player, { project, entity, oldStage }) => {
  const actions = (project as InternalProject).actions
  const actualEntity = actions.findCompatibleEntityForUndo(entity)
  if (actualEntity) {
    actions.userBringEntityToStage(actualEntity, oldStage, player.index)
  }
})

const undoBringToStage = UndoHandler<StageChangeRecord>("bring to stage", (player, { project, entity, oldStage }) => {
  const actions = (project as InternalProject).actions
  const actualEntity = actions.findCompatibleEntityForUndo(entity)
  if (actualEntity) {
    actions.userSendEntityToStage(actualEntity, actualEntity.firstStage, oldStage, player.index)
  }
})

interface LastStageChangeRecord extends ProjectEntityRecord {
  oldLastStage: StageNumber | nil
}

const lastStageChangeUndo = UndoHandler(
  "last stage change",
  (player, { project, entity, oldLastStage }: LastStageChangeRecord) => {
    const actions = (project as InternalProject).actions
    const actualEntity = actions.findCompatibleEntityForUndo(entity)
    if (actualEntity) {
      actions.userTrySetLastStage(actualEntity, oldLastStage, player.index)
    }
  },
)

export function UserActions(project: Project, projectUpdates: ProjectUpdates, WorldUpdates: WorldUpdates): UserActions {
  const content = project.content
  const {
    addNewEntity,
    maybeDeleteProjectEntity,
    forceDeleteEntity,
    tryUpdateEntityFromWorld,
    tryUpgradeEntityFromWorld,
    tryReviveSettingsRemnant,
    tryRotateEntityFromWorld,
    trySetFirstStage,
    trySetLastStage,
    setValueFromStagedInfo,
    updateWiresFromWorld,
    setTileAtStage,
  } = projectUpdates

  const {
    clearWorldEntityAtStage,
    rebuildWorldEntityAtStage,
    refreshAllWorldEntities,
    refreshWorldEntityAtStage,
    updateAllHighlights,
  } = WorldUpdates

  const { blueprintableTiles } = getPrototypeInfo()

  const result: InternalUserActions = {
    onEntityCreated,
    onEntityDeleted,
    onEntityPossiblyUpdated,
    onEntityRotated,
    onUndergroundBeltDragRotated,
    onWiresPossiblyUpdated,
    onEntityMarkedForUpgrade,
    onCleanupToolUsed,
    onTryFixEntity,
    onChunkGeneratedForEntity,
    onEntityForceDeleteUsed,
    onEntityDied,
    onStageDeleteUsed,
    onStageDeleteReverseUsed,
    onStageDeleteCancelUsed,
    onBringToStageUsed,
    onBringDownToStageUsed,
    onSendToStageUsed,
    onMoveEntityToStageCustomInput,
    onSurfaceCleared,
    userRevivedSettingsRemnant,
    userMoveEntityToStageWithUndo,
    userSetLastStageWithUndo,
    userBringEntityToStage,
    userSendEntityToStage,
    userTryMoveEntityToStage,
    findCompatibleEntityForUndo,
    userTrySetLastStage,
    onTileBuilt,
    onTileMined,
  }
  return result

  function onPreviewReplaced(entity: ProjectEntity, stage: StageNumber, byPlayer: PlayerIndex | nil): UndoAction | nil {
    const oldStage = entity.firstStage
    if (trySetFirstStage(entity, stage) != StageMoveResult.Updated) {
      // something went wrong, replace the entity
      rebuildWorldEntityAtStage(entity, stage)
      return
    }

    createNotification(entity, byPlayer, [L_Interaction.EntityMovedFromStage, project.getStageName(oldStage)], false)
    return byPlayer && undoManualStageMove.createAction(byPlayer, { project, entity, oldStage })
  }

  function onEntityOverbuilt(
    projectEntity: ProjectEntity,
    luaEntity: LuaEntity,
    stage: StageNumber,
    byPlayer: PlayerIndex | nil,
  ): UndoAction | nil {
    projectEntity.replaceWorldEntity(stage, luaEntity)
    if (projectEntity.isSettingsRemnant) {
      userRevivedSettingsRemnant(projectEntity, stage, byPlayer)
      return nil
    } else if (stage >= projectEntity.firstStage) {
      refreshWorldEntityAtStage(projectEntity, stage)
      return nil
    } else {
      return onPreviewReplaced(projectEntity, stage, byPlayer)
    }
  }

  function onEntityCreated(entity: LuaEntity, stage: StageNumber, byPlayer: PlayerIndex | nil): UndoAction | nil {
    const projectEntity = content.findCompatibleWithLuaEntity(entity, nil, stage)

    if (projectEntity) {
      return onEntityOverbuilt(projectEntity, entity, stage, byPlayer)
    }
    return tryAddNewEntity(entity, stage, byPlayer)
  }

  function tryAddNewEntity(
    entity: LuaEntity,
    stage: StageNumber,
    byPlayer: PlayerIndex | nil,
    knownBpValue?: BlueprintEntity,
  ): UndoAction | nil {
    if (!allowOverlapDifferentDirection.has(entity.type) && entity.supports_direction) {
      const existingDifferentDirection = content.findCompatibleEntity(entity.name, entity.position, nil, stage)
      if (existingDifferentDirection) {
        entity.destroy()
        createNotification(existingDifferentDirection, byPlayer, [L_Interaction.CannotBuildDifferentDirection], false)
        return
      }
    }

    addNewEntity(entity, stage, knownBpValue)

    // possibly more undo actions in the future
  }

  /** Also asserts that stage > entity's first stage. */
  function getCompatibleAtCurrentStageOrAdd(
    worldEntity: LuaEntity,
    stage: StageNumber,
    previousDirection: defines.direction | nil,
    byPlayer: PlayerIndex | nil,
    knownBpValue?: BlueprintEntity,
  ): ProjectEntity | nil {
    const compatible = content.findCompatibleWithLuaEntity(worldEntity, previousDirection, stage)

    if (!compatible) {
      tryAddNewEntity(worldEntity, stage, byPlayer, knownBpValue)
      return nil
    }
    if (stage < compatible.firstStage) {
      onEntityOverbuilt(compatible, worldEntity, stage, byPlayer)
      return nil
    }

    compatible.replaceWorldEntity(stage, worldEntity)
    return compatible
  }

  function notifyIfUpdateError(result: EntityUpdateResult, entity: ProjectEntity, byPlayer: PlayerIndex | nil) {
    if (result == "no-change" || result == "updated") return
    if (result == "cannot-rotate") {
      createNotification(entity, byPlayer, [L_Game.CantBeRotated], true)
    } else if (result == "cannot-upgrade-changed-pair") {
      createNotification(entity, byPlayer, [L_Interaction.CannotUpgradeUndergroundChangedPair], true)
    } else {
      assertNever(result)
    }
  }

  function onTryFixEntity(previewEntity: LuaEntity, stage: StageNumber, deleteSettingsRemnants?: boolean): void {
    const existing = content.findCompatibleFromPreviewOrLuaEntity(previewEntity, stage)
    if (!existing) return
    if (existing.isSettingsRemnant) {
      if (deleteSettingsRemnants) {
        // settings remnant, remove
        forceDeleteEntity(existing)
      }
    } else if (existing.hasErrorAt(stage)) {
      refreshAllWorldEntities(existing)
    }
  }
  function onChunkGeneratedForEntity(previewEntity: LuaEntity, stage: StageNumber): void {
    const existing = content.findCompatibleFromPreviewOrLuaEntity(previewEntity, stage)
    if (!existing || existing.isSettingsRemnant) return
    refreshWorldEntityAtStage(existing, stage)
  }

  function onEntityDeleted(entity: LuaEntityInfo, stage: StageNumber): void {
    const projectEntity = content.findCompatibleWithLuaEntity(entity, nil, stage)
    if (projectEntity) maybeDeleteProjectEntity(projectEntity, stage)
  }

  function handlePasteValue(
    entity: LuaEntity,
    stage: StageNumber,
    previousDirection: defines.direction | nil,
    byPlayer: PlayerIndex | nil,
    knownBpValue: BlueprintEntity,
    stagedInfo: StageInfoExport,
  ): ProjectEntity | nil {
    const compatible = content.findCompatibleWithLuaEntity(entity, previousDirection, stage)
    if (!compatible) {
      tryAddNewEntity(entity, stage, byPlayer, knownBpValue)
      return nil
    }
    if (compatible.isSettingsRemnant) {
      // just delete it
      forceDeleteEntity(compatible)
      tryAddNewEntity(entity, stage, byPlayer, knownBpValue)
      return nil
    }

    // this line is important, in case we just pasted over a preview
    compatible.replaceWorldEntity(stage, entity)

    const result = setValueFromStagedInfo(compatible, knownBpValue, stagedInfo)
    notifyIfMoveError(result, compatible, byPlayer)
    return compatible
  }

  /**
   * Handles when an entity has its properties updated.
   * Does not handle wires.
   * If previousDirection is specified, this also checks for rotation.
   *
   * @return the updated entity, or nil if a compatible entity was not found.
   */
  function onEntityPossiblyUpdated(
    entity: LuaEntity,
    stage: StageNumber,
    previousDirection: defines.direction | nil,
    byPlayer: PlayerIndex | nil,
    knownBpValue?: BlueprintEntity,
  ): ProjectEntity | nil {
    const stagedInfo = knownBpValue?.tags?.bp100 as StageInfoExport | nil
    if (stagedInfo) {
      return handlePasteValue(entity, stage, previousDirection, byPlayer, knownBpValue!, stagedInfo)
    }

    const projectEntity = getCompatibleAtCurrentStageOrAdd(entity, stage, previousDirection, byPlayer, knownBpValue)
    if (!projectEntity) return

    const result = tryUpdateEntityFromWorld(projectEntity, stage, knownBpValue)
    notifyIfUpdateError(result, projectEntity, byPlayer)
    return projectEntity
  }

  function handleRotate(
    worldEntity: LuaEntity,
    projectEntity: ProjectEntity,
    stage: StageNumber,
    byPlayer: PlayerIndex | nil,
  ) {
    const result = tryRotateEntityFromWorld(projectEntity, stage)
    notifyIfUpdateError(result, projectEntity, byPlayer)

    if (projectEntity.isUndergroundBelt()) {
      const worldPair = worldEntity.neighbours as LuaEntity | nil
      if (!worldPair) return
      const pairEntity = getCompatibleAtCurrentStageOrAdd(worldPair, stage, nil, byPlayer)
      if (!pairEntity) return
      const expectedPair = findUndergroundPair(content, projectEntity, stage)
      if (pairEntity != expectedPair) {
        updateAllHighlights(pairEntity)
      }
    }
  }

  function onEntityRotated(
    entity: LuaEntity,
    stage: StageNumber,
    previousDirection: defines.direction,
    byPlayer: PlayerIndex | nil,
  ): void {
    const projectEntity = getCompatibleAtCurrentStageOrAdd(entity, stage, previousDirection, byPlayer)
    if (projectEntity) {
      handleRotate(entity, projectEntity, stage, byPlayer)
    }
  }
  function onUndergroundBeltDragRotated(entity: LuaEntity, stage: StageNumber, byPlayer: PlayerIndex | nil): void {
    const projectEntity = content.findCompatibleWithLuaEntity(entity, nil, stage)
    if (!projectEntity || !projectEntity.isUndergroundBelt()) return
    if (!entity.rotate()) return
    handleRotate(entity, projectEntity, stage, byPlayer)
  }

  function onWiresPossiblyUpdated(entity: LuaEntity, stage: StageNumber, byPlayer: PlayerIndex | nil): void {
    const projectEntity = getCompatibleAtCurrentStageOrAdd(entity, stage, nil, byPlayer)
    if (!projectEntity) return
    const result = updateWiresFromWorld(projectEntity, stage)
    if (result != "updated" && result != "no-change") {
      assertNever(result)
    }
  }
  function onEntityMarkedForUpgrade(entity: LuaEntity, stage: StageNumber, byPlayer: PlayerIndex | nil): void {
    const projectEntity = getCompatibleAtCurrentStageOrAdd(entity, stage, nil, byPlayer)
    if (!projectEntity) return

    const result = tryUpgradeEntityFromWorld(projectEntity, stage)
    notifyIfUpdateError(result, projectEntity, byPlayer)
    if (entity.valid) entity.cancel_upgrade(entity.force)
  }
  function onCleanupToolUsed(entity: LuaEntity, stage: StageNumber): void {
    onTryFixEntity(entity, stage, true)
  }
  function onEntityForceDeleteUsed(entity: LuaEntity, stage: StageNumber, byPlayer: PlayerIndex): UndoAction | nil {
    const projectEntity = content.findCompatibleFromPreviewOrLuaEntity(entity, stage)
    if (projectEntity) {
      forceDeleteEntity(projectEntity)
      return undoDeleteEntity.createAction(byPlayer, { project, entity: projectEntity })
    }
    return nil
  }
  function onEntityDied(entity: LuaEntityInfo, stage: StageNumber): void {
    const projectEntity = content.findCompatibleWithLuaEntity(entity, nil, stage)
    if (projectEntity) {
      clearWorldEntityAtStage(projectEntity, stage)
    }
  }

  function notifyIfMoveError(result: StageMoveResult, entity: ProjectEntity, byPlayer: PlayerIndex | nil) {
    if (
      result == StageMoveResult.Updated ||
      result == StageMoveResult.NoChange ||
      result == StageMoveResult.EntityIsPersistent
    )
      return

    if (result == StageMoveResult.CannotMovePastLastStage) {
      createNotification(entity, byPlayer, [L_Interaction.CannotMovePastLastStage], true)
    } else if (result == StageMoveResult.CannotMoveBeforeFirstStage) {
      createNotification(entity, byPlayer, [L_Interaction.CannotDeleteBeforeFirstStage], true)
    } else if (result == StageMoveResult.IntersectsAnotherEntity) {
      createNotification(entity, byPlayer, [L_Interaction.MoveWillIntersectAnotherEntity], true)
    } else {
      assertNever(result)
    }
  }

  function userRevivedSettingsRemnant(entity: ProjectEntity, stage: StageNumber, byPlayer: PlayerIndex | nil): void {
    const result = tryReviveSettingsRemnant(entity, stage)
    if (result != "updated" && result != "no-change") {
      notifyIfMoveError(result, entity, byPlayer)
      refreshWorldEntityAtStage(entity, stage)
    }
  }

  function findCompatibleEntityForUndo(entity: ProjectEntity): ProjectEntity | nil {
    if (!project.valid) return nil

    if (!content.hasEntity(entity)) {
      const matching = content.findCompatibleWithExistingEntity(entity, entity.firstStage)
      if (!matching || entity.firstStage != matching.firstStage || !deepCompare(entity.firstValue, matching.firstValue))
        return nil
      return matching
    }
    return entity
  }

  function userTryMoveEntityToStage(
    entity: ProjectEntity,
    stage: StageNumber,
    byPlayer: PlayerIndex,
    returned?: boolean,
  ): boolean {
    const oldStage = entity.firstStage
    const result = trySetFirstStage(entity, stage)
    if (result == "updated") {
      if (returned) {
        createNotification(entity, byPlayer, [L_Interaction.EntityMovedBackToStage, project.getStageName(stage)], false)
      } else {
        createNotification(
          entity,
          byPlayer,
          [L_Interaction.EntityMovedFromStage, project.getStageName(oldStage)],
          false,
        )
      }
      return true
    }

    if (result == "no-change") {
      createNotification(entity, byPlayer, [L_Interaction.AlreadyAtFirstStage], true)
    } else {
      notifyIfMoveError(result, entity, byPlayer)
    }
    return false
  }

  function onMoveEntityToStageCustomInput(
    entityOrPreviewEntity: LuaEntity,
    stage: StageNumber,
    byPlayer: PlayerIndex,
  ): UndoAction | nil {
    const entity = content.findCompatibleFromPreviewOrLuaEntity(entityOrPreviewEntity, stage)
    if (!entity || entity.isSettingsRemnant) return
    return userTryMoveEntityToStageWithUndo(entity, stage, byPlayer)
  }

  function userTryMoveEntityToStageWithUndo(
    entity: ProjectEntity,
    stage: StageNumber,
    byPlayer: PlayerIndex,
  ): UndoAction | nil {
    const oldStage = entity.firstStage
    if (userTryMoveEntityToStage(entity, stage, byPlayer)) {
      return undoManualStageMove.createAction(byPlayer, { project, entity, oldStage })
    }
  }

  function userMoveEntityToStageWithUndo(entity: ProjectEntity, stage: StageNumber, byPlayer: PlayerIndex): void {
    const undoAction = userTryMoveEntityToStageWithUndo(entity, stage, byPlayer)
    if (undoAction) {
      registerUndoAction(undoAction)
    }
  }

  function userSendEntityToStage(
    projectEntity: ProjectEntity,
    fromStage: StageNumber,
    toStage: StageNumber,
    byPlayer: PlayerIndex,
  ): boolean {
    const result = trySetFirstStage(projectEntity, toStage)
    if (result != "updated") {
      notifyIfMoveError(result, projectEntity, byPlayer)
      return false
    }
    if (toStage < fromStage) createIndicator(projectEntity, byPlayer, "<<", Colors.Orange)
    return true
  }

  function onSendToStageUsed(
    entity: LuaEntity,
    fromStage: StageNumber,
    toStage: StageNumber,
    onlyIfMatchesFirstStage: boolean,
    byPlayer: PlayerIndex,
  ): UndoAction | nil {
    if (fromStage == toStage) return
    const projectEntity = content.findEntityExact(entity, entity.position, fromStage)
    if (
      !projectEntity ||
      projectEntity.isSettingsRemnant ||
      (onlyIfMatchesFirstStage && projectEntity.firstStage != fromStage)
    )
      return

    if (userSendEntityToStage(projectEntity, fromStage, toStage, byPlayer)) {
      return undoSendToStage.createAction(byPlayer, { project, entity: projectEntity, oldStage: fromStage })
    }
  }

  function userBringEntityToStage(projectEntity: ProjectEntity, stage: StageNumber, byPlayer: PlayerIndex): boolean {
    const oldStage = projectEntity.firstStage
    if (oldStage == stage) return false
    const result = trySetFirstStage(projectEntity, stage)
    if (result != "updated") {
      notifyIfMoveError(result, projectEntity, byPlayer)
      return false
    }

    if (oldStage < stage) createIndicator(projectEntity, byPlayer, ">>", Colors.Blueish)
    return true
  }

  function onBringToStageUsed(entity: LuaEntity, stage: StageNumber, byPlayer: PlayerIndex): UndoAction | nil {
    const projectEntity = content.findCompatibleFromPreviewOrLuaEntity(entity, stage)
    if (!projectEntity || projectEntity.isSettingsRemnant) return
    const oldStage = projectEntity.firstStage
    if (userBringEntityToStage(projectEntity, stage, byPlayer)) {
      return undoBringToStage.createAction(byPlayer, { project, entity: projectEntity, oldStage })
    }
  }

  function onBringDownToStageUsed(entity: LuaEntity, stage: StageNumber, byPlayer: PlayerIndex): UndoAction | nil {
    const projectEntity = content.findCompatibleFromPreviewOrLuaEntity(entity, stage)
    if (!projectEntity || projectEntity.isSettingsRemnant) return
    if (projectEntity.firstStage <= stage) return
    const oldStage = projectEntity.firstStage
    if (userBringEntityToStage(projectEntity, stage, byPlayer)) {
      return undoBringToStage.createAction(byPlayer, { project, entity: projectEntity, oldStage })
    }
  }

  function handleStageDelete(
    entity: LuaEntity,
    stage: StageNumber,
    byPlayer: PlayerIndex,
    isReverse: boolean,
  ): UndoAction | nil {
    const projectEntity = content.findCompatibleFromPreviewOrLuaEntity(entity, stage)
    if (!projectEntity || projectEntity.isSettingsRemnant) return
    const player = game.get_player(byPlayer)
    const useNextStage = !!player?.mod_settings[Settings.DeleteAtNextStage]?.value != isReverse
    const newLastStage = useNextStage ? stage : stage - 1
    const oldLastStage = projectEntity.lastStage
    if (userTrySetLastStage(projectEntity, newLastStage, byPlayer)) {
      return lastStageChangeUndo.createAction(byPlayer, { project, entity: projectEntity, oldLastStage })
    }
  }

  function onStageDeleteUsed(entity: LuaEntity, stage: StageNumber, byPlayer: PlayerIndex): UndoAction | nil {
    return handleStageDelete(entity, stage, byPlayer, false)
  }

  function onStageDeleteReverseUsed(entity: LuaEntity, stage: StageNumber, byPlayer: PlayerIndex): UndoAction | nil {
    return handleStageDelete(entity, stage, byPlayer, true)
  }

  function userTrySetLastStageWithUndo(
    projectEntity: ProjectEntity,
    stage: StageNumber | nil,
    byPlayer: PlayerIndex,
  ): UndoAction | nil {
    const oldStage = projectEntity.lastStage
    if (userTrySetLastStage(projectEntity, stage, byPlayer)) {
      return lastStageChangeUndo.createAction(byPlayer, { project, entity: projectEntity, oldLastStage: oldStage })
    }
  }

  function userSetLastStageWithUndo(
    projectEntity: ProjectEntity,
    newLastStage: StageNumber | nil,
    byPlayer: PlayerIndex,
  ): void {
    const undoAction = userTrySetLastStageWithUndo(projectEntity, newLastStage, byPlayer)
    if (undoAction) registerUndoAction(undoAction)
  }

  function onStageDeleteCancelUsed(entity: LuaEntity, stage: StageNumber, byPlayer: PlayerIndex): UndoAction | nil {
    const projectEntity = content.findCompatibleFromPreviewOrLuaEntity(entity, stage)
    if (!projectEntity || projectEntity.isSettingsRemnant || projectEntity.lastStage != stage) return
    return userTrySetLastStageWithUndo(projectEntity, nil, byPlayer)
  }

  function userTrySetLastStage(
    projectEntity: ProjectEntity,
    newLastStage: StageNumber | nil,
    byPlayer: PlayerIndex | nil,
  ): boolean {
    const result = trySetLastStage(projectEntity, newLastStage)
    notifyIfMoveError(result, projectEntity, byPlayer)
    return result == StageMoveResult.Updated
  }

  function onSurfaceCleared(stage: StageNumber): void {
    const area = content.computeBoundingBox()
    for (const entity of content.allEntities()) {
      clearWorldEntityAtStage(entity, stage)
    }
    if (area) prepareArea(project.getSurface(stage)!, area)
  }

  function onTileBuilt(position: Position, name: string, stage: StageNumber): void {
    if (!blueprintableTiles.has(name)) {
      setTileAtStage(position, stage, nil)
      return
    }
    setTileAtStage(position, stage, name)
  }

  function onTileMined(position: Position, stage: StageNumber): void {
    setTileAtStage(position, stage, nil)
  }
}
