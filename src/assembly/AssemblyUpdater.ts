/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of 100% Blueprint Planning.
 *
 * 100% Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * 100% Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with 100% Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { L_Game, Prototypes } from "../constants"
import { AssemblyEntity, StageNumber } from "../entity/AssemblyEntity"
import { fixEmptyControlBehavior, hasControlBehaviorSet } from "../entity/empty-control-behavior"
import { BasicEntityInfo } from "../entity/Entity"
import { isRollingStockType, shouldCheckEntityExactlyForMatch } from "../entity/entity-info"
import { EntityHandler, EntitySaver } from "../entity/EntityHandler"
import { WireHandler, WireSaver } from "../entity/WireHandler"
import { assertNever } from "../lib"
import { Position } from "../lib/geometry"
import { L_Interaction } from "../locale"
import { AssemblyData } from "./AssemblyDef"
import { createAssemblyUpdater2, UpdateEntityResult } from "./AssemblyUpdater2"
import { AssemblyMoveEntityResult, WorldUpdater } from "./WorldUpdater"
import min = math.min

/**
 * Updates assembly in response to world changes.
 *
 * @noSelf
 */
export interface AssemblyUpdater {
  /** Handles when an entity is created. */
  onEntityCreated(assembly: AssemblyData, stage: StageNumber, entity: LuaEntity, byPlayer: PlayerIndex | nil): void
  /** Handles when an entity is removed. */
  onEntityDeleted(
    assembly: AssemblyData,
    stage: StageNumber,
    entity: BasicEntityInfo,
    byPlayer: PlayerIndex | nil,
  ): void
  /**
   * Handles when an entity has its properties updated.
   * Does not handle wires.
   * If previousDirection is specified, also checks for rotation.
   *
   * Returns: `false` if a previous entity was not found (and may have been added).
   */
  onEntityPotentiallyUpdated(
    assembly: AssemblyData,
    stage: StageNumber,
    entity: LuaEntity,
    previousDirection: defines.direction | nil,
    byPlayer: PlayerIndex | nil,
  ): false | nil

  /** Handles when an entity is rotated by player. */
  onEntityRotated(
    assembly: AssemblyData,
    stage: StageNumber,
    entity: LuaEntity,
    previousDirection: defines.direction,
    byPlayer: PlayerIndex | nil,
  ): void

  /** Handles possible circuit wires changes of an entity. */
  onCircuitWiresPotentiallyUpdated(
    assembly: AssemblyData,
    stage: StageNumber,
    entity: LuaEntity,
    byPlayer: PlayerIndex | nil,
  ): void

  /**
   * Handles upgrade planner.
   * Performs the requested upgrade, also handles rotation via upgrade.
   */
  onEntityMarkedForUpgrade(
    assembly: AssemblyData,
    stage: StageNumber,
    entity: LuaEntity,
    byPlayer: PlayerIndex | nil,
  ): void

  /** When a cleanup tool has been used on an entity. */
  onCleanupToolUsed(assembly: AssemblyData, stage: StageNumber, proxyEntity: LuaEntity): void
  /** Similar to above; does not remove settings remnants */
  tryFixEntity(assembly: AssemblyData, stage: StageNumber, proxyEntity: LuaEntity): void

  onEntityForceDeleted(assembly: AssemblyData, stage: StageNumber, proxyEntity: LuaEntity): void
  /** Either: entity died, or reverse select with cleanup tool */
  onEntityDied(assembly: AssemblyData, stage: StageNumber, entity: BasicEntityInfo): void
  /** User activated. */
  onMoveEntityToStage(assembly: AssemblyData, stage: StageNumber, entity: LuaEntity, byPlayer: PlayerIndex): void
  moveEntityToStage(
    assembly: AssemblyData,
    stage: StageNumber,
    assemblyEntity: AssemblyEntity,
    byPlayer: PlayerIndex,
  ): void

  onEntityMoved(
    assembly: AssemblyData,
    stage: StageNumber,
    entity: LuaEntity,
    oldPosition: Position,
    byPlayer: PlayerIndex | nil,
  ): void
}

/**
 * @noSelf
 */
export interface WorldNotifier {
  createNotification(
    entity: { position: Position; surface?: LuaSurface } | nil,
    playerIndex: PlayerIndex | nil,
    message: LocalisedString,
    errorSound: boolean,
  ): void
}

export function createAssemblyUpdater(
  worldUpdater: WorldUpdater,
  entitySaver: EntitySaver,
  wireSaver: WireSaver,
  notifier: WorldNotifier,
): AssemblyUpdater {
  const au2 = createAssemblyUpdater2(worldUpdater, entitySaver, wireSaver)
  // ^ for refactoring purposes only
  const { deleteAllEntities, updateWorldEntities } = worldUpdater
  const { saveEntity } = entitySaver
  const { saveWireConnections } = wireSaver
  const { createNotification } = notifier

  function onEntityCreated(
    assembly: AssemblyData,
    stage: StageNumber,
    entity: LuaEntity,
    byPlayer: PlayerIndex | nil,
  ): AssemblyEntity | nil {
    const { content } = assembly

    const entityName = entity.name
    const existing = shouldCheckEntityExactlyForMatch(entityName)
      ? content.findCompatible(entity, nil)
      : content.findCompatibleAnyDirection(entityName, entity.position) // if it doesn't overlap, find in any direction to avoid issues

    if (!existing) {
      return au2.addNewEntity(assembly, stage, entity)
    }

    existing.replaceWorldEntity(stage, entity)

    if (existing.isSettingsRemnant) {
      au2.reviveSettingsRemnant(assembly, stage, existing)
    } else if (stage >= existing.firstStage) {
      au2.refreshEntityAtStage(assembly, stage, existing)
    } else {
      onPreviewReplaced(assembly, stage, existing, entity, byPlayer)
    }
    return existing
  }

  function onPreviewReplaced(
    assembly: AssemblyData,
    stage: StageNumber,
    entity: AssemblyEntity,
    luaEntity: LuaEntity,
    byPlayer: PlayerIndex | nil,
  ): void {
    const oldStage = assert(au2.moveEntityOnPreviewReplace(assembly, stage, entity))
    createNotification(
      luaEntity,
      byPlayer,
      [L_Interaction.EntityMovedFromStage, assembly.getStageName(oldStage)],
      false,
    )
  }

  function onEntityDeleted(
    assembly: AssemblyData,
    stage: StageNumber,
    entity: BasicEntityInfo,
    byPlayer: PlayerIndex | nil,
  ): void {
    const existing = assembly.content.findCompatible(entity, nil)
    if (!existing) return
    const existingStage = existing.firstStage

    if (existingStage !== stage) {
      if (existingStage < stage) {
        au2.disallowEntityDeletion(assembly, stage, existing)
      }
      // else: stage > existingStage; bug, ignore
      return
    }

    const oldStage = au2.moveEntityToOldStage(assembly, existing)
    if (oldStage) {
      createNotification(
        entity,
        byPlayer,
        [L_Interaction.EntityMovedBackToStage, assembly.getStageName(oldStage)],
        false,
      )
    } else {
      au2.deleteEntityOrCreateSettingsRemnant(assembly, existing)
    }
  }

  function onEntityDied(assembly: AssemblyData, stage: StageNumber, entity: BasicEntityInfo): void {
    const existing = assembly.content.findCompatible(entity, nil)
    if (existing) {
      au2.clearEntityAtStage(assembly, stage, existing)
    }
  }

  /** Also asserts that stage > entity's first stage. */
  function getCompatibleOrAdd(
    assembly: AssemblyData,
    entity: LuaEntity,
    stage: StageNumber,
    previousDirection: defines.direction | nil,
    byPlayer: PlayerIndex | nil,
  ): AssemblyEntity | nil {
    const compatible = assembly.content.findCompatible(entity, previousDirection)
    if (compatible && stage >= compatible.firstStage) {
      compatible.replaceWorldEntity(stage, entity) // just in case
    } else {
      onEntityCreated(assembly, stage, entity, byPlayer)
      return nil
    }
    return compatible
  }

  function updateEntityFromWorld(assembly: AssemblyData, existing: AssemblyEntity, stage: StageNumber): boolean {
    const entity = assert(existing.getWorldEntity(stage))
    const [newValue, direction] = saveEntity(entity)
    assert(newValue, "could not save value on existing entity")
    assert(direction === existing.getDirection(), "direction mismatch on saved entity")
    const hasDiff = existing.adjustValueAtStage(stage, newValue)
    return hasDiff
  }
  function notifyIfError(result: UpdateEntityResult, entity: LuaEntity, byPlayer: PlayerIndex | nil) {
    if (result === "no-change" || result === "updated") return
    if (result === "cannot-rotate") {
      createNotification(entity, byPlayer, [L_Game.CantBeRotated], true)
    } else if (result === "cannot-flip-multi-pair-underground") {
      createNotification(entity, byPlayer, [L_Interaction.CannotFlipUndergroundDueToMultiplePairs], true)
    } else if (result === "cannot-upgrade-multi-pair-underground") {
      createNotification(entity, byPlayer, [L_Interaction.CannotUpgradeUndergroundDueToMultiplePairs], true)
    } else if (result === "cannot-create-pair-upgrade") {
      createNotification(entity, byPlayer, [L_Interaction.CannotCreateUndergroundUpgradeIfNotInSameStage], true)
    } else if (result === "cannot-upgrade-changed-pair") {
      createNotification(entity, byPlayer, [L_Interaction.CannotUpgradeUndergroundChangedPair], true)
    } else {
      assertNever(result)
    }
  }

  function onEntityPotentiallyUpdated(
    assembly: AssemblyData,
    stage: StageNumber,
    entity: LuaEntity,
    previousDirection: defines.direction | nil,
    byPlayer: PlayerIndex | nil,
  ): false | nil {
    const existing = getCompatibleOrAdd(assembly, entity, stage, previousDirection, byPlayer)
    if (!existing) return false

    const result = au2.tryUpdateEntityFromWorld(assembly, stage, existing, entity)
    notifyIfError(result, entity, byPlayer)
  }

  function onEntityRotated(
    assembly: AssemblyData,
    stage: StageNumber,
    entity: LuaEntity,
    previousDirection: defines.direction,
    byPlayer: PlayerIndex | nil,
  ): void {
    const existing = getCompatibleOrAdd(assembly, entity, stage, previousDirection, byPlayer)
    if (!existing) return
    const result = au2.tryRotateEntityFromWorld(assembly, stage, existing, entity)
    notifyIfError(result, entity, byPlayer)
    return
  }

  function onEntityMarkedForUpgrade(
    assembly: AssemblyData,
    stage: StageNumber,
    entity: LuaEntity,
    byPlayer: PlayerIndex | nil,
  ): void {
    const existing = getCompatibleOrAdd(assembly, entity, stage, nil, byPlayer)
    if (!existing) return

    const result = au2.tryUpgradeEntityFromWorld(assembly, stage, existing, entity)
    notifyIfError(result, entity, byPlayer)
    if (entity.valid) entity.cancel_upgrade(entity.force)
  }

  function onCircuitWiresPotentiallyUpdated(
    assembly: AssemblyData,
    stage: StageNumber,
    entity: LuaEntity,
    byPlayer: PlayerIndex | nil,
  ): void {
    const existing = getCompatibleOrAdd(assembly, entity, stage, nil, byPlayer)
    if (!existing) return
    const [connectionsChanged, maxConnectionsExceeded] = saveWireConnections(assembly.content, existing, stage)
    if (maxConnectionsExceeded) {
      createNotification(entity, byPlayer, [L_Interaction.MaxConnectionsReachedInAnotherStage], true)
    }
    if (!connectionsChanged) return

    const circuitConnections = assembly.content.getCircuitConnections(existing)
    if (circuitConnections) {
      checkDefaultControlBehavior(assembly, existing, stage)
      for (const [otherEntity] of circuitConnections) {
        checkDefaultControlBehavior(assembly, otherEntity, stage)
      }
    }
    updateWorldEntities(assembly, existing, existing.firstStage)
  }
  function checkDefaultControlBehavior(assembly: AssemblyData, entity: AssemblyEntity, stage: StageNumber): void {
    if (!hasControlBehaviorSet(entity, stage)) {
      fixEmptyControlBehavior(entity)
      updateEntityFromWorld(assembly, entity, stage)
    }
  }

  function getEntityIfIsSelectablePreview(
    entity: LuaEntity,
    stage: StageNumber,
    assembly: AssemblyData,
  ): AssemblyEntity | nil {
    const entityName = entity.name
    if (!entityName.startsWith(Prototypes.PreviewEntityPrefix)) return nil
    const actualName = entityName.substring(Prototypes.PreviewEntityPrefix.length)

    let result: AssemblyEntity | nil
    if (isRollingStockType(actualName)) {
      result = assembly.content.findCompatibleAnyDirection(actualName, entity.position)
    } else {
      result = assembly.content.findCompatibleByName(actualName, entity.position, entity.direction)
    }
    if (!result) return nil
    if (stage >= result.firstStage || result.isSettingsRemnant) return result
  }

  function onCleanupToolUsed(assembly: AssemblyData, stage: StageNumber, proxyEntity: LuaEntity): void {
    tryFixEntity(assembly, stage, proxyEntity, true)
  }

  function tryFixEntity(
    assembly: AssemblyData,
    stage: StageNumber,
    proxyEntity: LuaEntity,
    deleteSettingsRemnants: boolean,
  ) {
    const existing = getEntityIfIsSelectablePreview(proxyEntity, stage, assembly)
    if (!existing) return
    if (!existing.isSettingsRemnant) {
      // this is an error entity, try revive
      if (stage < existing.firstStage) return
      updateWorldEntities(assembly, existing, stage, nil)
    } else if (deleteSettingsRemnants) {
      // settings remnant, remove
      assembly.content.delete(existing)
      deleteAllEntities(existing)
    }
  }

  function onEntityForceDeleted(assembly: AssemblyData, stage: StageNumber, proxyEntity: LuaEntity): void {
    const existing = getEntityIfIsSelectablePreview(proxyEntity, stage, assembly)
    if (!existing) return
    assembly.content.delete(existing)
    deleteAllEntities(existing)
  }

  function getEntityFromPreviewEntity(
    entityOrPreviewEntity: LuaEntity,
    stage: StageNumber,
    assembly: AssemblyData,
  ): AssemblyEntity | nil {
    const name = entityOrPreviewEntity.name
    if (name.startsWith(Prototypes.PreviewEntityPrefix)) {
      return assembly.content.findCompatibleByName(
        name.substring(Prototypes.PreviewEntityPrefix.length),
        entityOrPreviewEntity.position,
        entityOrPreviewEntity.direction,
      )
    }
    return assembly.content.findCompatible(entityOrPreviewEntity, nil)
  }

  function onMoveEntityToStage(
    assembly: AssemblyData,
    stage: StageNumber,
    entityOrPreviewEntity: LuaEntity,
    byPlayer: PlayerIndex,
  ): void {
    const existing = getEntityFromPreviewEntity(entityOrPreviewEntity, stage, assembly)
    if (!existing) return
    moveEntityToStage(assembly, stage, existing, byPlayer)
  }
  function moveEntityToStage(
    assembly: AssemblyData,
    stage: StageNumber,
    existing: AssemblyEntity,
    byPlayer: PlayerIndex,
  ) {
    if (existing.isSettingsRemnant) {
      au2.reviveSettingsRemnant(assembly, stage, existing)
      return
    }
    const oldStage = existing.firstStage

    if (oldStage === stage) {
      createNotification(existing, byPlayer, [L_Interaction.AlreadyAtFirstStage], true)
      return
    }

    if (existing.isUndergroundBelt()) {
      if (existing.getNameAtStage(stage) !== existing.firstValue.name) {
        createNotification(existing, byPlayer, [L_Interaction.CannotMoveUndergroundBeltWithUpgrade], true)
        return
      }
    }

    // move
    existing.moveToStage(stage, false)
    updateWorldEntities(assembly, existing, min(oldStage, stage))
    createNotification(existing, byPlayer, [L_Interaction.EntityMovedFromStage, assembly.getStageName(oldStage)], false)
  }

  function getCompatibleAtPositionOrAdd(
    assembly: AssemblyData,
    stage: StageNumber,
    entity: LuaEntity,
    oldPosition: Position,
    byPlayer: PlayerIndex | nil,
  ): AssemblyEntity | nil {
    const existing = assembly.content.findExactAtPosition(entity, stage, oldPosition)
    if (existing) return existing
    onEntityCreated(assembly, stage, entity, byPlayer)
    return nil
  }

  function onEntityMoved(
    assembly: AssemblyData,
    stage: StageNumber,
    entity: LuaEntity,
    oldPosition: Position,
    byPlayer: PlayerIndex | nil,
  ): void {
    const existing = getCompatibleAtPositionOrAdd(assembly, stage, entity, oldPosition, byPlayer)
    if (!existing) return
    assert(!existing.isSettingsRemnant && !existing.isUndergroundBelt(), "cannot move this entity")
    const result = worldUpdater.tryMoveOtherEntities(assembly, stage, existing)
    const message = moveResultMessage[result]
    if (message === nil) return
    createNotification(entity, byPlayer, [message, ["entity-name." + entity.name]], true)
  }

  const moveResultMessage: Record<AssemblyMoveEntityResult, L_Interaction | nil> = {
    success: nil,
    "connected-entities-missing": L_Interaction.ConnectedEntitiesMissing,
    "entities-missing": L_Interaction.EntitiesMissing,
    overlap: L_Interaction.NoRoomInAnotherStage,
    "could-not-teleport": L_Interaction.CantBeTeleportedInAnotherStage,
    "not-first-stage": L_Interaction.CannotMove,
    "wires-cannot-reach": L_Interaction.WiresMaxedInAnotherStage,
  }

  return {
    onEntityCreated,
    onEntityDeleted,
    onEntityPotentiallyUpdated,
    onEntityRotated,
    onCircuitWiresPotentiallyUpdated,
    onEntityMarkedForUpgrade,
    onCleanupToolUsed,
    tryFixEntity(assembly: AssemblyData, stage: StageNumber, proxyEntity: LuaEntity): void {
      tryFixEntity(assembly, stage, proxyEntity, false)
    },
    onEntityForceDeleted,
    onEntityDied,
    onMoveEntityToStage,
    moveEntityToStage,
    onEntityMoved,
  }
}

const WorldNotifier: WorldNotifier = {
  createNotification(
    at:
      | {
          position: Position
          surface?: LuaSurface
        }
      | nil,
    playerIndex: PlayerIndex | nil,
    message: LocalisedString,
    playSound: boolean,
  ): void {
    const player = playerIndex ? game.get_player(playerIndex) : nil
    if (player) {
      if (at) {
        player.create_local_flying_text({
          text: message,
          position: at.position,
        })
      } else {
        player.create_local_flying_text({
          text: message,
          create_at_cursor: true,
        })
      }
      if (playSound) player.play_sound({ path: "utility/cannot_build" })
    } else if (at && at.surface && at.surface.valid) {
      at.surface.create_entity({
        name: "flying-text",
        position: at.position,
        text: message,
      })
    }
  },
}

export const AssemblyUpdater: AssemblyUpdater = createAssemblyUpdater(
  WorldUpdater,
  EntityHandler,
  WireHandler,
  WorldNotifier,
)
