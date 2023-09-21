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

import { BlueprintEntity, LuaEntity, PlayerIndex } from "factorio:runtime"
import { Colors, L_Game } from "../constants"
import { LuaEntityInfo } from "../entity/Entity"
import { allowOverlapDifferentDirection } from "../entity/entity-prototype-info"
import { ProjectEntity, StageNumber } from "../entity/ProjectEntity"
import { assertNever, deepCompare } from "../lib"
import { Position } from "../lib/geometry"
import { L_Interaction } from "../locale"
import { createIndicator, createNotification } from "./notifications"
import {
  addNewEntity,
  deleteEntityOrCreateSettingsRemnant,
  EntityRotateResult,
  EntityUpdateResult,
  forceDeleteEntity,
  StageMoveResult,
  tryApplyUpgradeTarget,
  tryReviveSettingsRemnant,
  tryRotateEntityToMatchWorld,
  trySetFirstStage,
  trySetLastStage,
  tryUpdateEntityFromWorld,
  updateWiresFromWorld,
} from "./project-updates"
import { Project } from "./ProjectDef"
import { registerUndoAction, UndoAction, UndoHandler } from "./undo"
import {
  clearWorldEntityAtStage,
  ProjectEntityDollyResult,
  rebuildWorldEntityAtStage,
  refreshAllWorldEntities,
  refreshWorldEntityAtStage,
  tryDollyEntities,
} from "./world-entity-updates"

function onPreviewReplaced(
  project: Project,
  entity: ProjectEntity,
  stage: StageNumber,
  byPlayer: PlayerIndex | nil,
): UndoAction | nil {
  const oldStage = entity.firstStage
  if (trySetFirstStage(project, entity, stage) != StageMoveResult.Updated) {
    // something went wrong, replace the entity
    rebuildWorldEntityAtStage(project, entity, stage)
    return
  }

  createNotification(entity, byPlayer, [L_Interaction.EntityMovedFromStage, project.getStageName(oldStage)], false)
  return byPlayer && undoManualStageMove.createAction(byPlayer, { project, entity, oldStage })
}

function onEntityOverbuilt(
  project: Project,
  projectEntity: ProjectEntity,
  luaEntity: LuaEntity,
  stage: StageNumber,
  byPlayer: PlayerIndex | nil,
): UndoAction | nil {
  projectEntity.replaceWorldEntity(stage, luaEntity)
  if (projectEntity.isSettingsRemnant) {
    userRevivedSettingsRemnant(project, projectEntity, stage, byPlayer)
    // no undo action
  } else if (stage >= projectEntity.firstStage) {
    refreshWorldEntityAtStage(project, projectEntity, stage)
    // no undo action
  } else {
    return onPreviewReplaced(project, projectEntity, stage, byPlayer)
  }
}

export function onEntityCreated(
  project: Project,
  entity: LuaEntity,
  stage: StageNumber,
  byPlayer: PlayerIndex | nil,
): UndoAction | nil {
  const projectEntity = project.content.findCompatibleWithLuaEntity(entity, nil, stage)

  if (projectEntity) {
    return onEntityOverbuilt(project, projectEntity, entity, stage, byPlayer)
  }
  return tryAddNewEntity(project, entity, stage, byPlayer)
}

function tryAddNewEntity(
  project: Project,
  entity: LuaEntity,
  stage: StageNumber,
  byPlayer: PlayerIndex | nil,
  knownBpValue?: BlueprintEntity,
): UndoAction | nil {
  if (!allowOverlapDifferentDirection.has(entity.type) && entity.supports_direction) {
    const existingDifferentDirection = project.content.findCompatibleByProps(entity.name, entity.position, nil, stage)
    if (existingDifferentDirection) {
      entity.destroy()
      createNotification(existingDifferentDirection, byPlayer, [L_Interaction.CannotBuildDifferentDirection], false)
      return
    }
  }

  addNewEntity(project, entity, stage, knownBpValue)

  // possibly more undo actions in the future
}

/** Also asserts that stage > entity's first stage. */
function getCompatibleEntityOrAdd(
  project: Project,
  entity: LuaEntity,
  stage: StageNumber,
  previousDirection: defines.direction | nil,
  byPlayer: PlayerIndex | nil,
  knownBpValue?: BlueprintEntity,
): ProjectEntity | nil {
  const compatible = project.content.findCompatibleWithLuaEntity(entity, previousDirection, stage)

  if (!compatible) {
    tryAddNewEntity(project, entity, stage, byPlayer, knownBpValue)
    return nil
  }
  if (stage < compatible.firstStage) {
    onEntityOverbuilt(project, compatible, entity, stage, byPlayer)
    return nil
  }

  compatible.replaceWorldEntity(stage, entity) // just in case
  return compatible
}

function notifyIfError(
  result: EntityUpdateResult | EntityRotateResult,
  entity: ProjectEntity,
  byPlayer: PlayerIndex | nil,
) {
  if (result == "no-change" || result == "updated") return
  if (result == "cannot-rotate") {
    createNotification(entity, byPlayer, [L_Game.CantBeRotated], true)
  } else if (result == "cannot-create-pair-upgrade") {
    createNotification(entity, byPlayer, [L_Interaction.CannotCreateUndergroundUpgradeIfNotInSameStage], true)
  } else if (result == "cannot-upgrade-changed-pair") {
    createNotification(entity, byPlayer, [L_Interaction.CannotUpgradeUndergroundChangedPair], true)
  } else {
    assertNever(result)
  }
}

export function onTryFixEntity(
  project: Project,
  previewEntity: LuaEntity,
  stage: StageNumber,
  deleteSettingsRemnants?: boolean,
): void {
  const existing = project.content.findCompatibleFromPreview(previewEntity, stage)
  if (!existing) return
  if (existing.isSettingsRemnant) {
    if (deleteSettingsRemnants) {
      // settings remnant, remove
      forceDeleteEntity(project, existing)
    }
  } else {
    // this is an error entity, try fix
    if (stage < existing.firstStage) return
    refreshAllWorldEntities(project, existing)
  }
}

function getCompatibleAtPositionOrAdd(
  project: Project,
  entity: LuaEntity,
  stage: StageNumber,
  oldPosition: Position,
  byPlayer: PlayerIndex | nil,
): ProjectEntity | nil {
  const existing = project.content.findExact(entity, oldPosition, stage)
  if (existing) return existing
  onEntityCreated(project, entity, stage, byPlayer)
  return nil
}

const moveResultMessage: Record<ProjectEntityDollyResult, L_Interaction | nil> = {
  success: nil,
  "connected-entities-missing": L_Interaction.ConnectedEntitiesMissing,
  "entities-missing": L_Interaction.EntitiesMissing,
  overlap: L_Interaction.NoRoomInAnotherStage,
  "could-not-teleport": L_Interaction.CannotBeTeleportedInAnotherStage,
  "cannot-move": L_Interaction.CannotMove,
  "wires-cannot-reach": L_Interaction.WiresMaxedInAnotherStage,
}

export function onEntityDeleted(
  project: Project,
  entity: LuaEntityInfo,
  stage: StageNumber,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _byPlayer: PlayerIndex | nil,
): void {
  const projectEntity = project.content.findCompatibleWithLuaEntity(entity, nil, stage)
  if (!projectEntity) return
  const firstStage = projectEntity.firstStage

  if (firstStage != stage) {
    if (firstStage < stage) {
      rebuildWorldEntityAtStage(project, projectEntity, stage)
    }
    // else: stage > existingStage; bug, ignore
    return
  }

  deleteEntityOrCreateSettingsRemnant(project, projectEntity)
}

/**
 * Handles when an entity has its properties updated.
 * Does not handle wires.
 * If previousDirection is specified, this also checks for rotation.
 *
 * @return the updated entity, or nil if a compatible entity was not found.
 */
export function onEntityPossiblyUpdated(
  project: Project,
  entity: LuaEntity,
  stage: StageNumber,
  previousDirection: defines.direction | nil,
  byPlayer: PlayerIndex | nil,
  knownBpValue?: BlueprintEntity,
): ProjectEntity | nil {
  const projectEntity = getCompatibleEntityOrAdd(project, entity, stage, previousDirection, byPlayer, knownBpValue)
  if (!projectEntity) return

  const result = tryUpdateEntityFromWorld(project, projectEntity, stage, knownBpValue)
  notifyIfError(result, projectEntity, byPlayer)
  return projectEntity
}
export function onEntityRotated(
  project: Project,
  entity: LuaEntity,
  stage: StageNumber,
  previousDirection: defines.direction,
  byPlayer: PlayerIndex | nil,
): void {
  const projectEntity = getCompatibleEntityOrAdd(project, entity, stage, previousDirection, byPlayer)
  if (!projectEntity) return
  const result = tryRotateEntityToMatchWorld(project, projectEntity, stage)
  notifyIfError(result, projectEntity, byPlayer)
}
export function onUndergroundBeltDragRotated(
  project: Project,
  entity: LuaEntity,
  stage: StageNumber,
  byPlayer: PlayerIndex | nil,
): void {
  const projectEntity = project.content.findCompatibleWithLuaEntity(entity, nil, stage)
  if (!projectEntity || !projectEntity.isUndergroundBelt()) return
  assert(entity.rotate())
  const result = tryRotateEntityToMatchWorld(project, projectEntity, stage)
  notifyIfError(result, projectEntity, byPlayer)
}
export function onWiresPossiblyUpdated(
  project: Project,
  entity: LuaEntity,
  stage: StageNumber,
  byPlayer: PlayerIndex | nil,
): void {
  const projectEntity = getCompatibleEntityOrAdd(project, entity, stage, nil, byPlayer)
  if (!projectEntity) return
  const result = updateWiresFromWorld(project, projectEntity, stage)
  if (result == "max-connections-exceeded") {
    createNotification(projectEntity, byPlayer, [L_Interaction.MaxConnectionsReachedInAnotherStage], true)
  } else if (result != "updated" && result != "no-change") {
    assertNever(result)
  }
}
export function onEntityMarkedForUpgrade(
  project: Project,
  entity: LuaEntity,
  stage: StageNumber,
  byPlayer: PlayerIndex | nil,
): void {
  const projectEntity = getCompatibleEntityOrAdd(project, entity, stage, nil, byPlayer)
  if (!projectEntity) return

  const result = tryApplyUpgradeTarget(project, projectEntity, stage)
  notifyIfError(result, projectEntity, byPlayer)
  if (entity.valid) entity.cancel_upgrade(entity.force)
}
export function onCleanupToolUsed(project: Project, entity: LuaEntity, stage: StageNumber): void {
  onTryFixEntity(project, entity, stage, true)
}
export function onEntityForceDeleteUsed(project: Project, entity: LuaEntity, stage: StageNumber): boolean {
  const projectEntity = project.content.findCompatibleFromLuaEntityOrPreview(entity, stage)
  if (projectEntity) {
    forceDeleteEntity(project, projectEntity)
    return true
  }
  return false
}
export function onEntityDied(project: Project, entity: LuaEntityInfo, stage: StageNumber): void {
  const projectEntity = project.content.findCompatibleWithLuaEntity(entity, nil, stage)
  if (projectEntity) {
    clearWorldEntityAtStage(project, projectEntity, stage)
  }
}

function notifyIfMoveError(result: StageMoveResult, entity: ProjectEntity, byPlayer: PlayerIndex | nil) {
  if (result == StageMoveResult.Updated || result == StageMoveResult.NoChange) return

  if (result == StageMoveResult.CannotMoveUpgradedUnderground) {
    createNotification(entity, byPlayer, [L_Interaction.CannotMoveUndergroundBeltWithUpgrade], true)
  } else if (result == StageMoveResult.CannotMovePastLastStage) {
    createNotification(entity, byPlayer, [L_Interaction.CannotMovePastLastStage], true)
  } else if (result == StageMoveResult.CannotMoveBeforeFirstStage) {
    createNotification(entity, byPlayer, [L_Interaction.CannotDeleteBeforeFirstStage], true)
  } else if (result == StageMoveResult.IntersectsAnotherEntity) {
    createNotification(entity, byPlayer, [L_Interaction.MoveWillIntersectAnotherEntity], true)
  } else {
    assertNever(result)
  }
}

export function userRevivedSettingsRemnant(
  project: Project,
  entity: ProjectEntity,
  stage: StageNumber,
  byPlayer: PlayerIndex | nil,
): void {
  const result = tryReviveSettingsRemnant(project, entity, stage)
  if (result != "updated" && result != "no-change") {
    notifyIfMoveError(result, entity, byPlayer)
    refreshWorldEntityAtStage(project, entity, stage)
  }
}

interface ProjectEntityRecord {
  project: Project
  entity: ProjectEntity
}

interface StageChangeRecord extends ProjectEntityRecord {
  oldStage: StageNumber
}

function findCompatibleEntityForUndo(project: Project, entity: ProjectEntity): ProjectEntity | nil {
  if (!project.valid) return nil

  if (!project.content.has(entity)) {
    const matching = project.content.findCompatibleWithExistingEntity(entity, entity.firstStage)
    if (!matching || entity.firstStage != matching.firstStage || !deepCompare(entity.firstValue, matching.firstValue))
      return nil
    return matching
  }
  return entity
}

const undoManualStageMove = UndoHandler("stage move", (player, { project, entity, oldStage }: StageChangeRecord) => {
  const actualEntity = findCompatibleEntityForUndo(project, entity)
  if (actualEntity) {
    userTryMoveEntityToStage(project, actualEntity, oldStage, player.index, true)
  }
})

function userTryMoveEntityToStage(
  project: Project,
  entity: ProjectEntity,
  stage: StageNumber,
  byPlayer: PlayerIndex,
  returned?: boolean,
): boolean {
  const oldStage = entity.firstStage
  const result = trySetFirstStage(project, entity, stage)
  if (result == "updated") {
    if (returned) {
      createNotification(entity, byPlayer, [L_Interaction.EntityMovedBackToStage, project.getStageName(stage)], false)
    } else {
      createNotification(entity, byPlayer, [L_Interaction.EntityMovedFromStage, project.getStageName(oldStage)], false)
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

export function onMoveEntityToStageCustomInput(
  project: Project,
  entityOrPreviewEntity: LuaEntity,
  stage: StageNumber,
  byPlayer: PlayerIndex,
): UndoAction | nil {
  const entity = project.content.findCompatibleFromLuaEntityOrPreview(entityOrPreviewEntity, stage)
  if (!entity || entity.isSettingsRemnant) return
  return userTryMoveEntityToStageWithUndo(project, entity, stage, byPlayer)
}

function userTryMoveEntityToStageWithUndo(
  project: Project,
  entity: ProjectEntity,
  stage: StageNumber,
  byPlayer: PlayerIndex,
): UndoAction | nil {
  const oldStage = entity.firstStage
  if (userTryMoveEntityToStage(project, entity, stage, byPlayer)) {
    return undoManualStageMove.createAction(byPlayer, { project, entity, oldStage })
  }
}

export function userMoveEntityToStageWithUndo(
  project: Project,
  entity: ProjectEntity,
  stage: StageNumber,
  byPlayer: PlayerIndex,
): void {
  const undoAction = userTryMoveEntityToStageWithUndo(project, entity, stage, byPlayer)
  if (undoAction) {
    registerUndoAction(undoAction)
  }
}

const undoSendToStage = UndoHandler("send to stage", (player, { project, entity, oldStage }: StageChangeRecord) => {
  const actualEntity = findCompatibleEntityForUndo(project, entity)
  if (actualEntity) {
    userBringEntityToStage(project, actualEntity, oldStage, player.index)
  }
})

const undoBringToStage = UndoHandler("bring to stage", (player, { project, entity, oldStage }: StageChangeRecord) => {
  const actualEntity = findCompatibleEntityForUndo(project, entity)
  if (actualEntity) {
    userSendEntityToStage(project, actualEntity, actualEntity.firstStage, oldStage, player.index)
  }
})

function userSendEntityToStage(
  project: Project,
  projectEntity: ProjectEntity,
  fromStage: StageNumber,
  toStage: StageNumber,
  byPlayer: PlayerIndex,
): boolean {
  const result = trySetFirstStage(project, projectEntity, toStage)
  if (result != "updated") {
    notifyIfMoveError(result, projectEntity, byPlayer)
    return false
  }
  if (toStage < fromStage) createIndicator(projectEntity, byPlayer, "<<", Colors.Orange)
  return true
}

export function onSendToStageUsed(
  project: Project,
  entity: LuaEntity,
  fromStage: StageNumber,
  toStage: StageNumber,
  byPlayer: PlayerIndex,
): UndoAction | nil {
  if (fromStage == toStage) return
  const projectEntity = project.content.findExact(entity, entity.position, fromStage)
  if (!projectEntity || projectEntity.firstStage != fromStage || projectEntity.isSettingsRemnant) return

  if (userSendEntityToStage(project, projectEntity, fromStage, toStage, byPlayer)) {
    return undoSendToStage.createAction(byPlayer, { project, entity: projectEntity, oldStage: fromStage })
  }
}

function userBringEntityToStage(
  project: Project,
  projectEntity: ProjectEntity,
  stage: StageNumber,
  byPlayer: PlayerIndex,
): boolean {
  const oldStage = projectEntity.firstStage
  if (oldStage == stage) return false
  const result = trySetFirstStage(project, projectEntity, stage)
  if (result != "updated") {
    notifyIfMoveError(result, projectEntity, byPlayer)
    return false
  }

  if (oldStage < stage) createIndicator(projectEntity, byPlayer, ">>", Colors.Blueish)
  return true
}

export function onBringToStageUsed(
  project: Project,
  entity: LuaEntity,
  stage: StageNumber,
  byPlayer: PlayerIndex,
): UndoAction | nil {
  const projectEntity = project.content.findCompatibleFromLuaEntityOrPreview(entity, stage)
  if (!projectEntity || projectEntity.isSettingsRemnant) return
  const oldStage = projectEntity.firstStage
  if (userBringEntityToStage(project, projectEntity, stage, byPlayer)) {
    return undoBringToStage.createAction(byPlayer, { project, entity: projectEntity, oldStage })
  }
}

export function onBringDownToStageUsed(
  project: Project,
  entity: LuaEntity,
  stage: StageNumber,
  byPlayer: PlayerIndex,
): UndoAction | nil {
  const projectEntity = project.content.findCompatibleFromLuaEntityOrPreview(entity, stage)
  if (!projectEntity || projectEntity.isSettingsRemnant) return
  if (projectEntity.firstStage <= stage) return
  const oldStage = projectEntity.firstStage
  if (userBringEntityToStage(project, projectEntity, stage, byPlayer)) {
    return undoBringToStage.createAction(byPlayer, { project, entity: projectEntity, oldStage })
  }
}

interface LastStageChangeRecord extends ProjectEntityRecord {
  oldLastStage: StageNumber | nil
}

const lastStageChangeUndo = UndoHandler(
  "last stage change",
  (player, { project, entity, oldLastStage }: LastStageChangeRecord) => {
    const actualEntity = findCompatibleEntityForUndo(project, entity)
    if (actualEntity) {
      userTrySetLastStage(project, actualEntity, oldLastStage, player.index)
    }
  },
)

export function onStageDeleteUsed(
  project: Project,
  entity: LuaEntity,
  stage: StageNumber,
  byPlayer: PlayerIndex,
): UndoAction | nil {
  const projectEntity = project.content.findCompatibleFromLuaEntityOrPreview(entity, stage)
  if (!projectEntity || projectEntity.isSettingsRemnant) return
  const newLastStage = stage - 1
  const oldLastStage = projectEntity.lastStage
  if (userTrySetLastStage(project, projectEntity, newLastStage, byPlayer)) {
    return lastStageChangeUndo.createAction(byPlayer, { project, entity: projectEntity, oldLastStage })
  }
}

const stageDeleteCancelUndo = lastStageChangeUndo

function userTrySetLastStageWithUndo(
  project: Project,
  projectEntity: ProjectEntity,
  stage: StageNumber | nil,
  byPlayer: PlayerIndex,
): UndoAction | nil {
  const oldStage = projectEntity.lastStage
  if (userTrySetLastStage(project, projectEntity, stage, byPlayer)) {
    return stageDeleteCancelUndo.createAction(byPlayer, { project, entity: projectEntity, oldLastStage: oldStage })
  }
}

export function userSetLastStageWithUndo(
  project: Project,
  projectEntity: ProjectEntity,
  newLastStage: StageNumber | nil,
  byPlayer: PlayerIndex,
): void {
  const undoAction = userTrySetLastStageWithUndo(project, projectEntity, newLastStage, byPlayer)
  if (undoAction) registerUndoAction(undoAction)
}

export function onStageDeleteCancelUsed(
  project: Project,
  entity: LuaEntity,
  stage: StageNumber,
  byPlayer: PlayerIndex,
): UndoAction | nil {
  const projectEntity = project.content.findCompatibleFromLuaEntityOrPreview(entity, stage)
  if (!projectEntity || projectEntity.isSettingsRemnant || projectEntity.lastStage != stage) return
  return userTrySetLastStageWithUndo(project, projectEntity, nil, byPlayer)
}

function userTrySetLastStage(
  project: Project,
  projectEntity: ProjectEntity,
  newLastStage: StageNumber | nil,
  byPlayer: PlayerIndex | nil,
): boolean {
  const result = trySetLastStage(project, projectEntity, newLastStage)
  notifyIfMoveError(result, projectEntity, byPlayer)
  return result == StageMoveResult.Updated
}

export function onEntityDollied(
  project: Project,
  entity: LuaEntity,
  stage: StageNumber,
  oldPosition: Position,
  byPlayer: PlayerIndex | nil,
): void {
  const projectEntity = getCompatibleAtPositionOrAdd(project, entity, stage, oldPosition, byPlayer)
  if (!projectEntity) return
  assert(!projectEntity.isSettingsRemnant && !projectEntity.isUndergroundBelt(), "cannot move this entity")
  const result = tryDollyEntities(project, projectEntity, stage)
  const message = moveResultMessage[result]
  if (message != nil) {
    createNotification(projectEntity, byPlayer, [message, ["entity-name." + entity.name]], true)
  }
}

export const _mockable = true
