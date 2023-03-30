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
import { BasicEntityInfo } from "../entity/Entity"
import { shouldCheckEntityExactlyForMatch } from "../entity/entity-info"
import { assertNever } from "../lib"
import { Position } from "../lib/geometry"
import { L_Interaction } from "../locale"
import {
  addNewEntity,
  deleteEntityOrCreateSettingsRemnant,
  EntityRotateResult,
  EntityUpdateResult,
  forceDeleteEntity,
  moveEntityOnPreviewReplaced,
  moveEntityToStage,
  reviveSettingsRemnant,
  tryApplyUpgradeTarget,
  tryRotateEntityToMatchWorld,
  tryUpdateEntityFromWorld,
  updateWiresFromWorld,
} from "./assembly-updates"
import { Assembly } from "./AssemblyDef"
import { createIndicator, createNotification } from "./notifications"
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
): void {
  const oldStage = entity.firstStage
  createNotification(entity, byPlayer, [L_Interaction.EntityMovedFromStage, assembly.getStageName(oldStage)], false)
  assert(moveEntityOnPreviewReplaced(assembly, entity, stage))
}

function onEntityOverbuilt(
  assembly: Assembly,
  existingMatch: AssemblyEntity,
  luaEntity: LuaEntity,
  stage: StageNumber,
  byPlayer: PlayerIndex | nil,
) {
  existingMatch.replaceWorldEntity(stage, luaEntity)
  if (existingMatch.isSettingsRemnant) {
    reviveSettingsRemnant(assembly, existingMatch, stage)
  } else if (stage >= existingMatch.firstStage) {
    refreshWorldEntityAtStage(assembly, existingMatch, stage)
  } else {
    onPreviewReplaced(assembly, existingMatch, stage, byPlayer)
  }
}

function disallowOverbuildDifferentDirection(
  assembly: Assembly,
  existingMatch: AssemblyEntity,
  entity: LuaEntity,
  byPlayer: PlayerIndex | nil,
) {
  entity.destroy()
  if (byPlayer) {
    createNotification(existingMatch, byPlayer, [L_Interaction.CannotBuildDifferentDirection], false)
  }
}

export function onEntityCreated(
  assembly: Assembly,
  entity: LuaEntity,
  stage: StageNumber,
  byPlayer: PlayerIndex | nil,
  knownBpValue?: BlueprintEntity,
): AssemblyEntity | nil {
  const { content } = assembly

  const existing = content.findCompatibleWithLuaEntity(entity, nil, stage)

  if (existing) {
    onEntityOverbuilt(assembly, existing, entity, stage, byPlayer)
    return existing
  }

  const entityName = entity.name
  if (!shouldCheckEntityExactlyForMatch(entityName)) {
    const existingDifferentDirection = content.findCompatibleByProps(entityName, entity.position, nil, stage)
    if (existingDifferentDirection) {
      disallowOverbuildDifferentDirection(assembly, existingDifferentDirection, entity, byPlayer)
      return nil
    }
  }

  return addNewEntity(assembly, entity, stage, knownBpValue)
}

/** Also asserts that stage > entity's first stage. */
function getCompatibleEntityOrAdd(
  assembly: Assembly,
  entity: LuaEntity,
  stage: StageNumber,
  previousDirection: defines.direction | nil,
  byPlayer: PlayerIndex | nil,
  knownBpValue?: BlueprintEntity,
): LuaMultiReturn<[AssemblyEntity, true] | [AssemblyEntity | nil, false]> {
  const compatible = assembly.content.findCompatibleWithLuaEntity(entity, previousDirection, stage)
  if (!compatible || stage < compatible.firstStage) {
    const result = onEntityCreated(assembly, entity, stage, byPlayer, knownBpValue)
    return $multi(result, false as const)
  }
  compatible.replaceWorldEntity(stage, entity) // just in case
  return $multi(compatible, true as const)
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

function createCannotMoveUpgradedUndergroundNotification(entity: AssemblyEntity, byPlayer: PlayerIndex): void {
  createNotification(entity, byPlayer, [L_Interaction.CannotMoveUndergroundBeltWithUpgrade], true)
}
export function onEntityDeleted(
  assembly: Assembly,
  entity: BasicEntityInfo,
  stage: StageNumber,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _byPlayer: PlayerIndex | nil,
): void {
  const existing = assembly.content.findCompatibleWithLuaEntity(entity, nil, stage)
  if (!existing) return
  const existingStage = existing.firstStage

  if (existingStage != stage) {
    if (existingStage < stage) {
      rebuildWorldEntityAtStage(assembly, existing, stage)
    }
    // else: stage > existingStage; bug, ignore
    return
  }

  deleteEntityOrCreateSettingsRemnant(assembly, existing)
}

/**
 * Handles when an entity has its properties updated.
 * Does not handle wires.
 * If previousDirection is specified, also checks for rotation.
 *
 * @return
 */
export function onEntityPossiblyUpdated(
  assembly: Assembly,
  entity: LuaEntity,
  stage: StageNumber,
  previousDirection: defines.direction | nil,
  byPlayer: PlayerIndex | nil,
  knownBpValue?: BlueprintEntity,
): [AssemblyEntity | nil, boolean] {
  const [existing, found] = getCompatibleEntityOrAdd(assembly, entity, stage, previousDirection, byPlayer, knownBpValue)
  if (!found) return [existing, false]

  const result = tryUpdateEntityFromWorld(assembly, existing, stage, knownBpValue)
  notifyIfError(result, existing, byPlayer)
  return [existing, true]
}
export function onEntityRotated(
  assembly: Assembly,
  entity: LuaEntity,
  stage: StageNumber,
  previousDirection: defines.direction,
  byPlayer: PlayerIndex | nil,
): void {
  const [existing, found] = getCompatibleEntityOrAdd(assembly, entity, stage, previousDirection, byPlayer)
  if (!found) return
  const result = tryRotateEntityToMatchWorld(assembly, existing, stage)
  notifyIfError(result, existing, byPlayer)
}
export function onUndergroundBeltDragRotated(
  assembly: Assembly,
  entity: LuaEntity,
  stage: StageNumber,
  byPlayer: PlayerIndex | nil,
): void {
  const existing = assembly.content.findCompatibleWithLuaEntity(entity, nil, stage)
  if (!existing || !existing.isUndergroundBelt()) return
  assert(entity.rotate())
  const result = tryRotateEntityToMatchWorld(assembly, existing, stage)
  notifyIfError(result, existing, byPlayer)
}
export function onCircuitWiresPossiblyUpdated(
  assembly: Assembly,
  entity: LuaEntity,
  stage: StageNumber,
  byPlayer: PlayerIndex | nil,
): void {
  const [existing, found] = getCompatibleEntityOrAdd(assembly, entity, stage, nil, byPlayer)
  if (!found) return
  const result = updateWiresFromWorld(assembly, existing, stage)
  if (result == "max-connections-exceeded") {
    createNotification(existing, byPlayer, [L_Interaction.MaxConnectionsReachedInAnotherStage], true)
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
  const [existing, found] = getCompatibleEntityOrAdd(assembly, entity, stage, nil, byPlayer)
  if (!found) return

  const result = tryApplyUpgradeTarget(assembly, existing, stage)
  notifyIfError(result, existing, byPlayer)
  if (entity.valid) entity.cancel_upgrade(entity.force)
}
export function onCleanupToolUsed(assembly: Assembly, entity: LuaEntity, stage: StageNumber): void {
  onTryFixEntity(assembly, entity, stage, true)
}
export function onEntityForceDeleteUsed(assembly: Assembly, entity: LuaEntity, stage: StageNumber): void {
  const existing = assembly.content.findCompatibleFromLuaEntityOrPreview(entity, stage)
  if (!existing) return
  forceDeleteEntity(assembly, existing)
}
export function onEntityDied(assembly: Assembly, entity: BasicEntityInfo, stage: StageNumber): void {
  const existing = assembly.content.findCompatibleWithLuaEntity(entity, nil, stage)
  if (existing) {
    clearWorldEntityAtStage(assembly, existing, stage)
  }
}
export function onMoveEntityToStageCustomInput(
  assembly: Assembly,
  entityOrPreviewEntity: LuaEntity,
  stage: StageNumber,
  byPlayer: PlayerIndex,
): void {
  const existing = assembly.content.findCompatibleFromLuaEntityOrPreview(entityOrPreviewEntity, stage)
  if (!existing || existing.isSettingsRemnant) return
  const oldStage = existing.firstStage
  const result = moveEntityToStage(assembly, existing, stage)
  if (result == "updated") {
    createNotification(existing, byPlayer, [L_Interaction.EntityMovedFromStage, assembly.getStageName(oldStage)], false)
  } else if (result == "no-change") {
    createNotification(existing, byPlayer, [L_Interaction.AlreadyAtFirstStage], true)
  } else if (result == "cannot-move-upgraded-underground") {
    createNotification(existing, byPlayer, [L_Interaction.CannotMoveUndergroundBeltWithUpgrade], true)
  } else {
    assertNever(result)
  }
}
export function onSendToStageUsed(
  assembly: Assembly,
  entity: LuaEntity,
  fromStage: StageNumber,
  toStage: StageNumber,
  byPlayer: PlayerIndex,
): void {
  if (fromStage == toStage) return
  const existing = assembly.content.findExact(entity, entity.position, fromStage)
  if (!existing || existing.firstStage != fromStage || existing.isSettingsRemnant) return
  const result = moveEntityToStage(assembly, existing, toStage)
  if (result == "updated") {
    if (toStage < fromStage) createIndicator(existing, byPlayer, "<<", Colors.Orange)
    return
  }
  if (result == "cannot-move-upgraded-underground") {
    createCannotMoveUpgradedUndergroundNotification(existing, byPlayer)
  } else if (result == "no-change") {
    error(`Did not expect result ${result} when sending entity to stage`)
  } else {
    assertNever(result)
  }
}
export function onBringToStageUsed(
  assembly: Assembly,
  entity: LuaEntity,
  stage: StageNumber,
  byPlayer: PlayerIndex,
): void {
  const existing = assembly.content.findCompatibleFromLuaEntityOrPreview(entity, stage)
  if (!existing || existing.isSettingsRemnant) return
  const oldStage = existing.firstStage
  if (oldStage == stage) return
  const result = moveEntityToStage(assembly, existing, stage)
  if (result == "updated") {
    if (oldStage < stage) createIndicator(existing, byPlayer, ">>", Colors.Blueish)
    return
  }
  if (result == "cannot-move-upgraded-underground") {
    createCannotMoveUpgradedUndergroundNotification(existing, byPlayer)
  } else if (result == "no-change" || result == "settings-remnant-revived") {
    error(`Did not expect result ${result} from moveEntityToStage`)
  } else {
    assertNever(result)
  }
}
export function onEntityDollied(
  assembly: Assembly,
  entity: LuaEntity,
  stage: StageNumber,
  oldPosition: Position,
  byPlayer: PlayerIndex | nil,
): void {
  const existing = getCompatibleAtPositionOrAdd(assembly, entity, stage, oldPosition, byPlayer)
  if (!existing) return
  assert(!existing.isSettingsRemnant && !existing.isUndergroundBelt(), "cannot move this entity")
  const result = tryDollyEntities(assembly, existing, stage)
  const message = moveResultMessage[result]
  if (message != nil) {
    createNotification(existing, byPlayer, [message, ["entity-name." + entity.name]], true)
  }
}

export const _mockable = true
