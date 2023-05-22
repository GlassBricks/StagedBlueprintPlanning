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

import { Colors, L_Game } from "../constants"
import { AssemblyEntity, StageNumber } from "../entity/AssemblyEntity"
import { LuaEntityInfo } from "../entity/Entity"
import { allowOverlapDifferentDirection } from "../entity/entity-prototype-info"
import { assertNever, deepCompare } from "../lib"
import { Position } from "../lib/geometry"
import { L_Interaction } from "../locale"
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
} from "./assembly-updates"
import { Assembly } from "./AssemblyDef"
import { createIndicator, createNotification } from "./notifications"
import { registerUndoAction, UndoAction, UndoHandler } from "./undo"
import {
  AssemblyEntityDollyResult,
  clearWorldEntityAtStage,
  rebuildWorldEntityAtStage,
  refreshAllWorldEntities,
  refreshWorldEntityAtStage,
  tryDollyEntities,
} from "./world-entity-updates"

function onPreviewReplaced(
  assembly: Assembly,
  entity: AssemblyEntity,
  stage: StageNumber,
  byPlayer: PlayerIndex | nil,
): UndoAction | nil {
  const oldStage = entity.firstStage
  if (trySetFirstStage(assembly, entity, stage) != StageMoveResult.Updated) {
    // something went wrong, replace the entity
    rebuildWorldEntityAtStage(assembly, entity, stage)
    return
  }

  createNotification(entity, byPlayer, [L_Interaction.EntityMovedFromStage, assembly.getStageName(oldStage)], false)
  return byPlayer && undoManualStageMove.createAction(byPlayer, { assembly, entity, oldStage })
}

function onEntityOverbuilt(
  assembly: Assembly,
  asmEntity: AssemblyEntity,
  luaEntity: LuaEntity,
  stage: StageNumber,
  byPlayer: PlayerIndex | nil,
): UndoAction | nil {
  asmEntity.replaceWorldEntity(stage, luaEntity)
  if (asmEntity.isSettingsRemnant) {
    userRevivedSettingsRemnant(assembly, asmEntity, stage, byPlayer)
    // no undo action
  } else if (stage >= asmEntity.firstStage) {
    refreshWorldEntityAtStage(assembly, asmEntity, stage)
    // no undo action
  } else {
    return onPreviewReplaced(assembly, asmEntity, stage, byPlayer)
  }
}

export function onEntityCreated(
  assembly: Assembly,
  entity: LuaEntity,
  stage: StageNumber,
  byPlayer: PlayerIndex | nil,
): UndoAction | nil {
  const asmEntity = assembly.content.findCompatibleWithLuaEntity(entity, nil, stage)

  if (asmEntity) {
    return onEntityOverbuilt(assembly, asmEntity, entity, stage, byPlayer)
  }
  return newEntityAdded(assembly, entity, stage, byPlayer)
}

function newEntityAdded(
  assembly: Assembly,
  entity: LuaEntity,
  stage: StageNumber,
  byPlayer: PlayerIndex | nil,
  knownBpValue?: BlueprintEntity,
): UndoAction | nil {
  const entityType = entity.type

  if (!allowOverlapDifferentDirection.has(entityType) && entity.supports_direction) {
    const existingDifferentDirection = assembly.content.findCompatibleByProps(entity.name, entity.position, nil, stage)
    if (existingDifferentDirection) {
      entity.destroy()
      createNotification(existingDifferentDirection, byPlayer, [L_Interaction.CannotBuildDifferentDirection], false)
      return
    }
  }

  addNewEntity(assembly, entity, stage, knownBpValue)

  // possibly more undo actions in the future
}

/** Also asserts that stage > entity's first stage. */
function getCompatibleEntityOrAdd(
  assembly: Assembly,
  entity: LuaEntity,
  stage: StageNumber,
  previousDirection: defines.direction | nil,
  byPlayer: PlayerIndex | nil,
  knownBpValue?: BlueprintEntity,
): AssemblyEntity | nil {
  const compatible = assembly.content.findCompatibleWithLuaEntity(entity, previousDirection, stage)

  if (!compatible) {
    newEntityAdded(assembly, entity, stage, byPlayer, knownBpValue)
    return nil
  }
  if (stage < compatible.firstStage) {
    onEntityOverbuilt(assembly, compatible, entity, stage, byPlayer)
    return nil
  }

  compatible.replaceWorldEntity(stage, entity) // just in case
  return compatible
}

function notifyIfError(
  result: EntityUpdateResult | EntityRotateResult,
  entity: AssemblyEntity,
  byPlayer: PlayerIndex | nil,
) {
  if (result == "no-change" || result == "updated") return
  if (result == "cannot-rotate") {
    createNotification(entity, byPlayer, [L_Game.CantBeRotated], true)
  } else if (result == "cannot-flip-multi-pair-underground") {
    createNotification(entity, byPlayer, [L_Interaction.CannotFlipUndergroundDueToMultiplePairs], true)
  } else if (result == "cannot-upgrade-multi-pair-underground") {
    createNotification(entity, byPlayer, [L_Interaction.CannotUpgradeUndergroundDueToMultiplePairs], true)
  } else if (result == "cannot-create-pair-upgrade") {
    createNotification(entity, byPlayer, [L_Interaction.CannotCreateUndergroundUpgradeIfNotInSameStage], true)
  } else if (result == "cannot-upgrade-changed-pair") {
    createNotification(entity, byPlayer, [L_Interaction.CannotUpgradeUndergroundChangedPair], true)
  } else {
    assertNever(result)
  }
}

export function onTryFixEntity(
  assembly: Assembly,
  previewEntity: LuaEntity,
  stage: StageNumber,
  deleteSettingsRemnants?: boolean,
): void {
  const existing = assembly.content.findCompatibleFromPreview(previewEntity, stage)
  if (!existing) return
  if (existing.isSettingsRemnant) {
    if (deleteSettingsRemnants) {
      // settings remnant, remove
      forceDeleteEntity(assembly, existing)
    }
  } else {
    // this is an error entity, try fix
    if (stage < existing.firstStage) return
    refreshAllWorldEntities(assembly, existing)
  }
}

function getCompatibleAtPositionOrAdd(
  assembly: Assembly,
  entity: LuaEntity,
  stage: StageNumber,
  oldPosition: Position,
  byPlayer: PlayerIndex | nil,
): AssemblyEntity | nil {
  const existing = assembly.content.findExact(entity, oldPosition, stage)
  if (existing) return existing
  onEntityCreated(assembly, entity, stage, byPlayer)
  return nil
}

const moveResultMessage: Record<AssemblyEntityDollyResult, L_Interaction | nil> = {
  success: nil,
  "connected-entities-missing": L_Interaction.ConnectedEntitiesMissing,
  "entities-missing": L_Interaction.EntitiesMissing,
  overlap: L_Interaction.NoRoomInAnotherStage,
  "could-not-teleport": L_Interaction.CannotBeTeleportedInAnotherStage,
  "cannot-move": L_Interaction.CannotMove,
  "wires-cannot-reach": L_Interaction.WiresMaxedInAnotherStage,
}

export function onEntityDeleted(
  assembly: Assembly,
  entity: LuaEntityInfo,
  stage: StageNumber,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _byPlayer: PlayerIndex | nil,
): void {
  const asmEntity = assembly.content.findCompatibleWithLuaEntity(entity, nil, stage)
  if (!asmEntity) return
  const firstStage = asmEntity.firstStage

  if (firstStage != stage) {
    if (firstStage < stage) {
      rebuildWorldEntityAtStage(assembly, asmEntity, stage)
    }
    // else: stage > existingStage; bug, ignore
    return
  }

  deleteEntityOrCreateSettingsRemnant(assembly, asmEntity)
}

/**
 * Handles when an entity has its properties updated.
 * Does not handle wires.
 * If previousDirection is specified, this also checks for rotation.
 *
 * @return the updated entity, or nil if a compatible entity was not found.
 */
export function onEntityPossiblyUpdated(
  assembly: Assembly,
  entity: LuaEntity,
  stage: StageNumber,
  previousDirection: defines.direction | nil,
  byPlayer: PlayerIndex | nil,
  knownBpValue?: BlueprintEntity,
): AssemblyEntity | nil {
  const asmEntity = getCompatibleEntityOrAdd(assembly, entity, stage, previousDirection, byPlayer, knownBpValue)
  if (!asmEntity) return

  const result = tryUpdateEntityFromWorld(assembly, asmEntity, stage, knownBpValue)
  notifyIfError(result, asmEntity, byPlayer)
  return asmEntity
}
export function onEntityRotated(
  assembly: Assembly,
  entity: LuaEntity,
  stage: StageNumber,
  previousDirection: defines.direction,
  byPlayer: PlayerIndex | nil,
): void {
  const asmEntity = getCompatibleEntityOrAdd(assembly, entity, stage, previousDirection, byPlayer)
  if (!asmEntity) return
  const result = tryRotateEntityToMatchWorld(assembly, asmEntity, stage)
  notifyIfError(result, asmEntity, byPlayer)
}
export function onUndergroundBeltDragRotated(
  assembly: Assembly,
  entity: LuaEntity,
  stage: StageNumber,
  byPlayer: PlayerIndex | nil,
): void {
  const asmEntity = assembly.content.findCompatibleWithLuaEntity(entity, nil, stage)
  if (!asmEntity || !asmEntity.isUndergroundBelt()) return
  assert(entity.rotate())
  const result = tryRotateEntityToMatchWorld(assembly, asmEntity, stage)
  notifyIfError(result, asmEntity, byPlayer)
}
export function onWiresPossiblyUpdated(
  assembly: Assembly,
  entity: LuaEntity,
  stage: StageNumber,
  byPlayer: PlayerIndex | nil,
): void {
  const asmEntity = getCompatibleEntityOrAdd(assembly, entity, stage, nil, byPlayer)
  if (!asmEntity) return
  const result = updateWiresFromWorld(assembly, asmEntity, stage)
  if (result == "max-connections-exceeded") {
    createNotification(asmEntity, byPlayer, [L_Interaction.MaxConnectionsReachedInAnotherStage], true)
  } else if (result != "updated" && result != "no-change") {
    assertNever(result)
  }
}
export function onEntityMarkedForUpgrade(
  assembly: Assembly,
  entity: LuaEntity,
  stage: StageNumber,
  byPlayer: PlayerIndex | nil,
): void {
  const asmEntity = getCompatibleEntityOrAdd(assembly, entity, stage, nil, byPlayer)
  if (!asmEntity) return

  const result = tryApplyUpgradeTarget(assembly, asmEntity, stage)
  notifyIfError(result, asmEntity, byPlayer)
  if (entity.valid) entity.cancel_upgrade(entity.force)
}
export function onCleanupToolUsed(assembly: Assembly, entity: LuaEntity, stage: StageNumber): void {
  onTryFixEntity(assembly, entity, stage, true)
}
export function onEntityForceDeleteUsed(assembly: Assembly, entity: LuaEntity, stage: StageNumber): boolean {
  const asmEntity = assembly.content.findCompatibleFromLuaEntityOrPreview(entity, stage)
  if (asmEntity) {
    forceDeleteEntity(assembly, asmEntity)
    return true
  }
  return false
}
export function onEntityDied(assembly: Assembly, entity: LuaEntityInfo, stage: StageNumber): void {
  const asmEntity = assembly.content.findCompatibleWithLuaEntity(entity, nil, stage)
  if (asmEntity) {
    clearWorldEntityAtStage(assembly, asmEntity, stage)
  }
}

function notifyIfMoveError(result: StageMoveResult, entity: AssemblyEntity, byPlayer: PlayerIndex | nil) {
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
  assembly: Assembly,
  entity: AssemblyEntity,
  stage: StageNumber,
  byPlayer: PlayerIndex | nil,
): void {
  const result = tryReviveSettingsRemnant(assembly, entity, stage)
  if (result != "updated" && result != "no-change") {
    notifyIfMoveError(result, entity, byPlayer)
    refreshWorldEntityAtStage(assembly, entity, stage)
  }
}

interface AssemblyEntityRecord {
  assembly: Assembly
  entity: AssemblyEntity
}

interface StageChangeRecord extends AssemblyEntityRecord {
  oldStage: StageNumber
}

function findCompatibleEntityForUndo(assembly: Assembly, entity: AssemblyEntity): AssemblyEntity | nil {
  if (!assembly.valid) return nil

  if (!assembly.content.has(entity)) {
    const matching = assembly.content.findCompatibleWithExistingEntity(entity, entity.firstStage)
    if (!matching || entity.firstStage != matching.firstStage || !deepCompare(entity.firstValue, matching.firstValue))
      return nil
    return matching
  }
  return entity
}

const undoManualStageMove = UndoHandler("stage move", (player, { assembly, entity, oldStage }: StageChangeRecord) => {
  const actualEntity = findCompatibleEntityForUndo(assembly, entity)
  if (actualEntity) {
    userTryMoveEntityToStage(assembly, actualEntity, oldStage, player.index, true)
  }
})

function userTryMoveEntityToStage(
  assembly: Assembly,
  entity: AssemblyEntity,
  stage: StageNumber,
  byPlayer: PlayerIndex,
  returned?: boolean,
): boolean {
  const oldStage = entity.firstStage
  const result = trySetFirstStage(assembly, entity, stage)
  if (result == "updated") {
    if (returned) {
      createNotification(entity, byPlayer, [L_Interaction.EntityMovedBackToStage, assembly.getStageName(stage)], false)
    } else {
      createNotification(entity, byPlayer, [L_Interaction.EntityMovedFromStage, assembly.getStageName(oldStage)], false)
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
  assembly: Assembly,
  entityOrPreviewEntity: LuaEntity,
  stage: StageNumber,
  byPlayer: PlayerIndex,
): UndoAction | nil {
  const entity = assembly.content.findCompatibleFromLuaEntityOrPreview(entityOrPreviewEntity, stage)
  if (!entity || entity.isSettingsRemnant) return
  return userTryMoveEntityToStageWithUndo(assembly, entity, stage, byPlayer)
}

function userTryMoveEntityToStageWithUndo(
  assembly: Assembly,
  entity: AssemblyEntity,
  stage: StageNumber,
  byPlayer: PlayerIndex,
): UndoAction | nil {
  const oldStage = entity.firstStage
  if (userTryMoveEntityToStage(assembly, entity, stage, byPlayer)) {
    return undoManualStageMove.createAction(byPlayer, { assembly, entity, oldStage })
  }
}

export function userMoveEntityToStageWithUndo(
  assembly: Assembly,
  entity: AssemblyEntity,
  stage: StageNumber,
  byPlayer: PlayerIndex,
): void {
  const undoAction = userTryMoveEntityToStageWithUndo(assembly, entity, stage, byPlayer)
  if (undoAction) {
    registerUndoAction(undoAction)
  }
}

const undoSendToStage = UndoHandler("send to stage", (player, { assembly, entity, oldStage }: StageChangeRecord) => {
  const actualEntity = findCompatibleEntityForUndo(assembly, entity)
  if (actualEntity) {
    userBringEntityToStage(assembly, actualEntity, oldStage, player.index)
  }
})

const undoBringToStage = UndoHandler("bring to stage", (player, { assembly, entity, oldStage }: StageChangeRecord) => {
  const actualEntity = findCompatibleEntityForUndo(assembly, entity)
  if (actualEntity) {
    userSendEntityToStage(assembly, actualEntity, actualEntity.firstStage, oldStage, player.index)
  }
})

function userSendEntityToStage(
  assembly: Assembly,
  asmEntity: AssemblyEntity,
  fromStage: StageNumber,
  toStage: StageNumber,
  byPlayer: PlayerIndex,
): boolean {
  const result = trySetFirstStage(assembly, asmEntity, toStage)
  if (result != "updated") {
    notifyIfMoveError(result, asmEntity, byPlayer)
    return false
  }
  if (toStage < fromStage) createIndicator(asmEntity, byPlayer, "<<", Colors.Orange)
  return true
}

export function onSendToStageUsed(
  assembly: Assembly,
  entity: LuaEntity,
  fromStage: StageNumber,
  toStage: StageNumber,
  byPlayer: PlayerIndex,
): UndoAction | nil {
  if (fromStage == toStage) return
  const asmEntity = assembly.content.findExact(entity, entity.position, fromStage)
  if (!asmEntity || asmEntity.firstStage != fromStage || asmEntity.isSettingsRemnant) return

  if (userSendEntityToStage(assembly, asmEntity, fromStage, toStage, byPlayer)) {
    return undoSendToStage.createAction(byPlayer, { assembly, entity: asmEntity, oldStage: fromStage })
  }
}

function userBringEntityToStage(
  assembly: Assembly,
  asmEntity: AssemblyEntity,
  stage: StageNumber,
  byPlayer: PlayerIndex,
): boolean {
  const oldStage = asmEntity.firstStage
  if (oldStage == stage) return false
  const result = trySetFirstStage(assembly, asmEntity, stage)
  if (result != "updated") {
    notifyIfMoveError(result, asmEntity, byPlayer)
    return false
  }

  if (oldStage < stage) createIndicator(asmEntity, byPlayer, ">>", Colors.Blueish)
  return true
}

export function onBringToStageUsed(
  assembly: Assembly,
  entity: LuaEntity,
  stage: StageNumber,
  byPlayer: PlayerIndex,
): UndoAction | nil {
  const asmEntity = assembly.content.findCompatibleFromLuaEntityOrPreview(entity, stage)
  if (!asmEntity || asmEntity.isSettingsRemnant) return
  const oldStage = asmEntity.firstStage
  if (userBringEntityToStage(assembly, asmEntity, stage, byPlayer)) {
    return undoBringToStage.createAction(byPlayer, { assembly, entity: asmEntity, oldStage })
  }
}

export function onBringDownToStageUsed(
  assembly: Assembly,
  entity: LuaEntity,
  stage: StageNumber,
  byPlayer: PlayerIndex,
): UndoAction | nil {
  const asmEntity = assembly.content.findCompatibleFromLuaEntityOrPreview(entity, stage)
  if (!asmEntity || asmEntity.isSettingsRemnant) return
  if (asmEntity.firstStage <= stage) return
  const oldStage = asmEntity.firstStage
  if (userBringEntityToStage(assembly, asmEntity, stage, byPlayer)) {
    return undoBringToStage.createAction(byPlayer, { assembly, entity: asmEntity, oldStage })
  }
}

interface LastStageChangeRecord extends AssemblyEntityRecord {
  oldLastStage: StageNumber | nil
}

const lastStageChangeUndo = UndoHandler(
  "last stage change",
  (player, { assembly, entity, oldLastStage }: LastStageChangeRecord) => {
    const actualEntity = findCompatibleEntityForUndo(assembly, entity)
    if (actualEntity) {
      userTrySetLastStage(assembly, actualEntity, oldLastStage, player.index)
    }
  },
)

export function onStageDeleteUsed(
  assembly: Assembly,
  entity: LuaEntity,
  stage: StageNumber,
  byPlayer: PlayerIndex,
): UndoAction | nil {
  const asmEntity = assembly.content.findCompatibleFromLuaEntityOrPreview(entity, stage)
  if (!asmEntity || asmEntity.isSettingsRemnant) return
  const newLastStage = stage - 1
  const oldLastStage = asmEntity.lastStage
  if (userTrySetLastStage(assembly, asmEntity, newLastStage, byPlayer)) {
    return lastStageChangeUndo.createAction(byPlayer, { assembly, entity: asmEntity, oldLastStage })
  }
}

const stageDeleteCancelUndo = lastStageChangeUndo

function userTrySetLastStageWithUndo(
  assembly: Assembly,
  asmEntity: AssemblyEntity,
  stage: StageNumber | nil,
  byPlayer: PlayerIndex,
): UndoAction | nil {
  const oldStage = asmEntity.lastStage
  if (userTrySetLastStage(assembly, asmEntity, stage, byPlayer)) {
    return stageDeleteCancelUndo.createAction(byPlayer, { assembly, entity: asmEntity, oldLastStage: oldStage })
  }
}

export function userSetLastStageWithUndo(
  assembly: Assembly,
  asmEntity: AssemblyEntity,
  newLastStage: StageNumber | nil,
  byPlayer: PlayerIndex,
): void {
  const undoAction = userTrySetLastStageWithUndo(assembly, asmEntity, newLastStage, byPlayer)
  if (undoAction) registerUndoAction(undoAction)
}

export function onStageDeleteCancelUsed(
  assembly: Assembly,
  entity: LuaEntity,
  stage: StageNumber,
  byPlayer: PlayerIndex,
): UndoAction | nil {
  const asmEntity = assembly.content.findCompatibleFromLuaEntityOrPreview(entity, stage)
  if (!asmEntity || asmEntity.isSettingsRemnant || asmEntity.lastStage != stage) return
  return userTrySetLastStageWithUndo(assembly, asmEntity, nil, byPlayer)
}

function userTrySetLastStage(
  assembly: Assembly,
  asmEntity: AssemblyEntity,
  newLastStage: StageNumber | nil,
  byPlayer: PlayerIndex | nil,
): boolean {
  const result = trySetLastStage(assembly, asmEntity, newLastStage)
  notifyIfMoveError(result, asmEntity, byPlayer)
  return result == StageMoveResult.Updated
}

export function onEntityDollied(
  assembly: Assembly,
  entity: LuaEntity,
  stage: StageNumber,
  oldPosition: Position,
  byPlayer: PlayerIndex | nil,
): void {
  const asmEntity = getCompatibleAtPositionOrAdd(assembly, entity, stage, oldPosition, byPlayer)
  if (!asmEntity) return
  assert(!asmEntity.isSettingsRemnant && !asmEntity.isUndergroundBelt(), "cannot move this entity")
  const result = tryDollyEntities(assembly, asmEntity, stage)
  const message = moveResultMessage[result]
  if (message != nil) {
    createNotification(asmEntity, byPlayer, [message, ["entity-name." + entity.name]], true)
  }
}

export const _mockable = true
