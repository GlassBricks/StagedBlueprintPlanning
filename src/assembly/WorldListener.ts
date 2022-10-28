/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { L_Game, Prototypes } from "../constants"
import { AssemblyEntity, StageNumber } from "../entity/AssemblyEntity"
import { BasicEntityInfo } from "../entity/Entity"
import { isRollingStockType, shouldCheckEntityExactlyForMatch } from "../entity/entity-info"
import { assertNever } from "../lib"
import { Position } from "../lib/geometry"
import { L_Interaction } from "../locale"
import { Assembly } from "./AssemblyDef"
import { AssemblyUpdater, EntityUpdateResult } from "./AssemblyUpdater"
import { AssemblyEntityDollyResult } from "./WorldUpdater"

/**
 * Listens to changes in the world and updates the assembly accordingly.
 *
 * See also: event-listener.ts
 *
 * @noSelf
 */
export interface WorldListener {
  /** Handles when an entity is created. */
  onEntityCreated(assembly: Assembly, entity: LuaEntity, stage: StageNumber, byPlayer: PlayerIndex | nil): void
  /** Handles when an entity is removed. */
  onEntityDeleted(assembly: Assembly, entity: BasicEntityInfo, stage: StageNumber, byPlayer: PlayerIndex | nil): void
  /**
   * Handles when an entity has its properties updated.
   * Does not handle wires.
   * If previousDirection is specified, also checks for rotation.
   *
   * Returns: `false` if a previous entity was not found (and may have been added).
   */
  onEntityPotentiallyUpdated(
    assembly: Assembly,
    entity: LuaEntity,
    stage: StageNumber,
    previousDirection: defines.direction | nil,
    byPlayer: PlayerIndex | nil,
  ): false | nil

  /** Handles when an entity is rotated by player. */
  onEntityRotated(
    assembly: Assembly,
    entity: LuaEntity,
    stage: StageNumber,
    previousDirection: defines.direction,
    byPlayer: PlayerIndex | nil,
  ): void

  /** Handles possible circuit wires changes of an entity. */
  onCircuitWiresPotentiallyUpdated(
    assembly: Assembly,
    entity: LuaEntity,
    stage: StageNumber,
    byPlayer: PlayerIndex | nil,
  ): void

  /**
   * Handles upgrade planner.
   * Performs the requested upgrade, also handles rotation via upgrade.
   */
  onEntityMarkedForUpgrade(assembly: Assembly, entity: LuaEntity, stage: StageNumber, byPlayer: PlayerIndex | nil): void

  /** When a cleanup tool has been used on an entity. */
  onCleanupToolUsed(assembly: Assembly, entity: LuaEntity, stage: StageNumber): void
  /** Similar to above; does not remove settings remnants */
  tryFixEntity(assembly: Assembly, entity: LuaEntity, stage: StageNumber): void

  onEntityForceDeleted(assembly: Assembly, entity: LuaEntity, stage: StageNumber): void
  /** Either: entity died, or reverse select with cleanup tool */
  onEntityDied(assembly: Assembly, entity: BasicEntityInfo, stage: StageNumber): void
  /** User activated. */
  onMoveEntityToStage(assembly: Assembly, entity: LuaEntity, stage: StageNumber, byPlayer: PlayerIndex): void
  onEntityMoved(
    assembly: Assembly,
    entity: LuaEntity,
    stage: StageNumber,
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

export function createWorldListener(assemblyUpdater: AssemblyUpdater, notifier: WorldNotifier): WorldListener {
  const {
    addNewEntity,
    clearEntityAtStage,
    deleteEntityOrCreateSettingsRemnant,
    forbidEntityDeletion,
    forceDeleteEntity,
    moveEntityOnPreviewReplace,
    moveEntityToStage,
    refreshEntityAllStages,
    refreshEntityAtStage,
    reviveSettingsRemnant,
    tryDollyEntity,
    tryRotateEntityToMatchWorld,
    tryUpdateEntityFromWorld,
    tryApplyUpgradeTarget,
    updateWiresFromWorld,
  } = assemblyUpdater
  // ^ for refactoring purposes only
  const { createNotification } = notifier

  function onEntityCreated(
    assembly: Assembly,
    entity: LuaEntity,
    stage: StageNumber,
    byPlayer: PlayerIndex | nil,
  ): AssemblyEntity | nil {
    const { content } = assembly

    const entityName = entity.name
    const existing = shouldCheckEntityExactlyForMatch(entityName)
      ? content.findCompatible(entity, nil)
      : content.findCompatibleAnyDirection(entityName, entity.position) // if it doesn't overlap, find in any direction to avoid issues

    if (!existing) {
      return addNewEntity(assembly, entity, stage)
    }

    existing.replaceWorldEntity(stage, entity)

    if (existing.isSettingsRemnant) {
      reviveSettingsRemnant(assembly, existing, stage)
    } else if (stage >= existing.firstStage) {
      refreshEntityAtStage(assembly, existing, stage)
    } else {
      onPreviewReplaced(assembly, stage, existing, entity, byPlayer)
    }
    return existing
  }

  function onPreviewReplaced(
    assembly: Assembly,
    stage: StageNumber,
    entity: AssemblyEntity,
    luaEntity: LuaEntity,
    byPlayer: PlayerIndex | nil,
  ): void {
    const oldStage = assert(moveEntityOnPreviewReplace(assembly, entity, stage))
    createNotification(
      luaEntity,
      byPlayer,
      [L_Interaction.EntityMovedFromStage, assembly.getStageName(oldStage)],
      false,
    )
  }

  /** Also asserts that stage > entity's first stage. */
  function getCompatibleEntityOrAdd(
    assembly: Assembly,
    entity: LuaEntity,
    stage: StageNumber,
    previousDirection: defines.direction | nil,
    byPlayer: PlayerIndex | nil,
  ): AssemblyEntity | nil {
    const compatible = assembly.content.findCompatible(entity, previousDirection)
    if (compatible && stage >= compatible.firstStage) {
      compatible.replaceWorldEntity(stage, entity) // just in case
    } else {
      onEntityCreated(assembly, entity, stage, byPlayer)
      return nil
    }
    return compatible
  }

  function notifyIfError(result: EntityUpdateResult, entity: LuaEntity, byPlayer: PlayerIndex | nil) {
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

  function getEntityFromPreview(entity: LuaEntity, stage: StageNumber, assembly: Assembly): AssemblyEntity | nil {
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

  function getEntityFromEntityOrPreview(
    entityOrPreviewEntity: LuaEntity,
    stage: StageNumber,
    assembly: Assembly,
  ): AssemblyEntity | nil {
    return (
      getEntityFromPreview(entityOrPreviewEntity, stage, assembly) ??
      assembly.content.findCompatible(entityOrPreviewEntity, nil)
    )
  }

  function tryFixEntity(
    assembly: Assembly,
    stage: StageNumber,
    previewEntity: LuaEntity,
    deleteSettingsRemnants: boolean,
  ) {
    const existing = getEntityFromPreview(previewEntity, stage, assembly)
    if (!existing) return
    if (existing.isSettingsRemnant) {
      if (deleteSettingsRemnants) {
        // settings remnant, remove
        forceDeleteEntity(assembly, existing)
      }
    } else {
      // this is an error entity, try fix
      if (stage < existing.firstStage) return
      refreshEntityAllStages(assembly, existing)
    }
  }

  function getCompatibleAtPositionOrAdd(
    assembly: Assembly,
    stage: StageNumber,
    entity: LuaEntity,
    oldPosition: Position,
    byPlayer: PlayerIndex | nil,
  ): AssemblyEntity | nil {
    const existing = assembly.content.findExactAtPosition(entity, stage, oldPosition)
    if (existing) return existing
    onEntityCreated(assembly, entity, stage, byPlayer)
    return nil
  }

  const moveResultMessage: Record<AssemblyEntityDollyResult, L_Interaction | nil> = {
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
    onEntityDeleted(assembly: Assembly, entity: BasicEntityInfo, stage: StageNumber): void {
      const existing = assembly.content.findCompatible(entity, nil)
      if (!existing) return
      const existingStage = existing.firstStage

      if (existingStage !== stage) {
        if (existingStage < stage) {
          forbidEntityDeletion(assembly, existing, stage)
        }
        // else: stage > existingStage; bug, ignore
        return
      }

      deleteEntityOrCreateSettingsRemnant(assembly, existing)
    },
    onEntityPotentiallyUpdated(
      assembly: Assembly,
      entity: LuaEntity,
      stage: StageNumber,
      previousDirection: defines.direction | nil,
      byPlayer: PlayerIndex | nil,
    ): false | nil {
      const existing = getCompatibleEntityOrAdd(assembly, entity, stage, previousDirection, byPlayer)
      if (!existing) return false

      const result = tryUpdateEntityFromWorld(assembly, existing, stage)
      notifyIfError(result, entity, byPlayer)
    },
    onEntityRotated(
      assembly: Assembly,
      entity: LuaEntity,
      stage: StageNumber,
      previousDirection: defines.direction,
      byPlayer: PlayerIndex | nil,
    ): void {
      const existing = getCompatibleEntityOrAdd(assembly, entity, stage, previousDirection, byPlayer)
      if (!existing) return
      const result = tryRotateEntityToMatchWorld(assembly, existing, stage)
      notifyIfError(result, entity, byPlayer)
    },
    onCircuitWiresPotentiallyUpdated(
      assembly: Assembly,
      entity: LuaEntity,
      stage: StageNumber,
      byPlayer: PlayerIndex | nil,
    ): void {
      const existing = getCompatibleEntityOrAdd(assembly, entity, stage, nil, byPlayer)
      if (!existing) return
      const result = updateWiresFromWorld(assembly, existing, stage)
      if (result === "max-connections-exceeded") {
        createNotification(entity, byPlayer, [L_Interaction.MaxConnectionsReachedInAnotherStage], true)
      } else if (result !== "updated" && result !== "no-change") {
        assertNever(result)
      }
    },
    onEntityMarkedForUpgrade(
      assembly: Assembly,
      entity: LuaEntity,
      stage: StageNumber,
      byPlayer: PlayerIndex | nil,
    ): void {
      const existing = getCompatibleEntityOrAdd(assembly, entity, stage, nil, byPlayer)
      if (!existing) return

      const result = tryApplyUpgradeTarget(assembly, existing, stage)
      notifyIfError(result, entity, byPlayer)
      if (entity.valid) entity.cancel_upgrade(entity.force)
    },
    onCleanupToolUsed(assembly: Assembly, entity: LuaEntity, stage: StageNumber): void {
      tryFixEntity(assembly, stage, entity, true)
    },
    tryFixEntity(assembly: Assembly, entity: LuaEntity, stage: StageNumber): void {
      tryFixEntity(assembly, stage, entity, false)
    },
    onEntityForceDeleted(assembly: Assembly, entity: LuaEntity, stage: StageNumber): void {
      const existing = getEntityFromPreview(entity, stage, assembly)
      if (!existing) return
      forceDeleteEntity(assembly, existing)
    },
    onEntityDied(assembly: Assembly, entity: BasicEntityInfo, stage: StageNumber): void {
      const existing = assembly.content.findCompatible(entity, nil)
      if (existing) {
        clearEntityAtStage(assembly, existing, stage)
      }
    },
    onMoveEntityToStage(
      assembly: Assembly,
      entityOrPreviewEntity: LuaEntity,
      stage: StageNumber,
      byPlayer: PlayerIndex,
    ): void {
      const existing = getEntityFromEntityOrPreview(entityOrPreviewEntity, stage, assembly)
      if (!existing) return
      const oldStage = existing.firstStage
      const result = moveEntityToStage(assembly, existing, stage)
      if (result === "updated") {
        createNotification(
          existing,
          byPlayer,
          [L_Interaction.EntityMovedFromStage, assembly.getStageName(oldStage)],
          false,
        )
      } else if (result === "no-change") {
        createNotification(existing, byPlayer, [L_Interaction.AlreadyAtFirstStage], true)
      } else if (result === "cannot-move-upgraded-underground") {
        createNotification(existing, byPlayer, [L_Interaction.CannotMoveUndergroundBeltWithUpgrade], true)
      } else if (result !== "settings-remnant-revived") {
        assertNever(result)
      }
    },
    onEntityMoved(
      assembly: Assembly,
      entity: LuaEntity,
      stage: StageNumber,
      oldPosition: Position,
      byPlayer: PlayerIndex | nil,
    ): void {
      const existing = getCompatibleAtPositionOrAdd(assembly, stage, entity, oldPosition, byPlayer)
      if (!existing) return
      assert(!existing.isSettingsRemnant && !existing.isUndergroundBelt(), "cannot move this entity")
      const result = tryDollyEntity(assembly, existing, stage)
      const message = moveResultMessage[result]
      if (message !== nil) {
        createNotification(entity, byPlayer, [message, ["entity-name." + entity.name]], true)
      }
    },
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

export const WorldListener: WorldListener = createWorldListener(AssemblyUpdater, WorldNotifier)
