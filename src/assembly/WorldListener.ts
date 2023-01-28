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
import { Assembly } from "./AssemblyDef"
import {
  addNewEntity,
  deleteEntityOrCreateSettingsRemnant,
  EntityUpdateResult,
  forceDeleteEntity,
  moveEntityOnPreviewReplace,
  moveEntityToStage,
  reviveSettingsRemnant,
  tryApplyUpgradeTarget,
  tryRotateEntityToMatchWorld,
  tryUpdateEntityFromWorld,
  updateWiresFromWorld,
} from "./AssemblyUpdater"
import {
  AssemblyEntityDollyResult,
  clearWorldEntity,
  refreshEntityAllStages,
  refreshWorldEntityAtStage,
  replaceWorldEntityAtStage,
  tryDollyEntities,
} from "./WorldUpdater"

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
  onEntityPossiblyUpdated(
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

  onUndergroundBeltDragRotated(
    assembly: Assembly,
    entity: LuaEntity,
    stage: StageNumber,
    byPlayer: PlayerIndex | nil,
  ): void

  /** Handles possible circuit wires changes of an entity. */
  onCircuitWiresPossiblyUpdated(
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

  onEntityForceDeleteUsed(assembly: Assembly, entity: LuaEntity): void
  /** Either: entity died, or reverse select with cleanup tool */
  onEntityDied(assembly: Assembly, entity: BasicEntityInfo, stage: StageNumber): void
  /** User activated. */
  onMoveEntityToStageCustomInput(assembly: Assembly, entity: LuaEntity, stage: StageNumber, byPlayer: PlayerIndex): void

  /** Only moves if stage matches the fromStage */
  onSendToStageUsed(
    assembly: Assembly,
    entity: LuaEntity,
    fromStage: StageNumber,
    toStage: StageNumber,
    byPlayer: PlayerIndex,
  ): void

  /** For alt-selecting with stage-move tool: does not move settings remnants, only notifies on error */
  onBringToStageUsed(assembly: Assembly, entity: LuaEntity, stage: StageNumber, byPlayer: PlayerIndex): void

  onEntityDollied(
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
    entity: AssemblyEntity,
    playerIndex: PlayerIndex | nil,
    message: LocalisedString,
    errorSound: boolean,
  ): void
  createIndicator(entity: AssemblyEntity, playerIndex: PlayerIndex | nil, text: string, color: Color | ColorArray): void
}

export function createWorldListener(notifier: WorldNotifier): WorldListener {
  // ^ for refactoring purposes only
  const { createNotification, createIndicator } = notifier

  function onPreviewReplaced(
    assembly: Assembly,
    stage: StageNumber,
    entity: AssemblyEntity,
    byPlayer: PlayerIndex | nil,
  ): void {
    const oldStage = entity.firstStage
    createNotification(entity, byPlayer, [L_Interaction.EntityMovedFromStage, assembly.getStageName(oldStage)], false)
    assert(moveEntityOnPreviewReplace(assembly, entity, stage))
  }
  function onEntityOverbuilt(
    existingMatch: AssemblyEntity,
    stage: number,
    entity: LuaEntity,
    assembly: Assembly,
    byPlayer: PlayerIndex | nil,
  ) {
    existingMatch.replaceWorldEntity(stage, entity)
    if (existingMatch.isSettingsRemnant) {
      reviveSettingsRemnant(assembly, existingMatch, stage)
    } else if (stage >= existingMatch.firstStage) {
      refreshWorldEntityAtStage(assembly, existingMatch, stage)
    } else {
      onPreviewReplaced(assembly, stage, existingMatch, byPlayer)
    }
  }

  function disallowOverbuildDifferentDirection(
    existingMatch: AssemblyEntity,
    entity: LuaEntity,
    assembly: Assembly,
    byPlayer: PlayerIndex | nil,
  ) {
    entity.destroy()
    if (byPlayer) {
      createNotification(existingMatch, byPlayer, [L_Interaction.CannotBuildDifferentDirection], false)
    }
  }

  function onEntityCreated(
    assembly: Assembly,
    entity: LuaEntity,
    stage: StageNumber,
    byPlayer: PlayerIndex | nil,
  ): AssemblyEntity | nil {
    const { content } = assembly

    const existing = content.findCompatibleWithLuaEntity(entity, nil)

    if (existing) {
      onEntityOverbuilt(existing, stage, entity, assembly, byPlayer)
      return existing
    }

    const entityName = entity.name
    if (!shouldCheckEntityExactlyForMatch(entityName)) {
      const existingDifferentDirection = content.findCompatibleAnyDirection(entityName, entity.position)
      if (existingDifferentDirection) {
        disallowOverbuildDifferentDirection(existingDifferentDirection, entity, assembly, byPlayer)
        return nil
      }
    }

    return addNewEntity(assembly, entity, stage)
  }

  /** Also asserts that stage > entity's first stage. */
  function getCompatibleEntityOrAdd(
    assembly: Assembly,
    entity: LuaEntity,
    stage: StageNumber,
    previousDirection: defines.direction | nil,
    byPlayer: PlayerIndex | nil,
  ): AssemblyEntity | nil {
    const compatible = assembly.content.findCompatibleWithLuaEntity(entity, previousDirection)
    if (compatible && stage >= compatible.firstStage) {
      compatible.replaceWorldEntity(stage, entity) // just in case
    } else {
      onEntityCreated(assembly, entity, stage, byPlayer)
      return nil
    }
    return compatible
  }

  function notifyIfError(result: EntityUpdateResult, entity: AssemblyEntity, byPlayer: PlayerIndex | nil) {
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

  function tryFixEntity(
    assembly: Assembly,
    stage: StageNumber,
    previewEntity: LuaEntity,
    deleteSettingsRemnants: boolean,
  ) {
    const existing = assembly.content.findCompatibleFromPreview(previewEntity)
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
    "could-not-teleport": L_Interaction.CannotBeTeleportedInAnotherStage,
    "cannot-move": L_Interaction.CannotMove,
    "wires-cannot-reach": L_Interaction.WiresMaxedInAnotherStage,
  }

  function createCannotMoveUpgradedUndergroundNotification(entity: AssemblyEntity, byPlayer: PlayerIndex): void {
    createNotification(entity, byPlayer, [L_Interaction.CannotMoveUndergroundBeltWithUpgrade], true)
  }
  return {
    onEntityCreated,
    onEntityDeleted(assembly: Assembly, entity: BasicEntityInfo, stage: StageNumber): void {
      const existing = assembly.content.findCompatibleWithLuaEntity(entity, nil)
      if (!existing) return
      const existingStage = existing.firstStage

      if (existingStage != stage) {
        if (existingStage < stage) {
          replaceWorldEntityAtStage(assembly, existing, stage)
        }
        // else: stage > existingStage; bug, ignore
        return
      }

      deleteEntityOrCreateSettingsRemnant(assembly, existing)
    },
    onEntityPossiblyUpdated(
      assembly: Assembly,
      entity: LuaEntity,
      stage: StageNumber,
      previousDirection: defines.direction | nil,
      byPlayer: PlayerIndex | nil,
    ): false | nil {
      const existing = getCompatibleEntityOrAdd(assembly, entity, stage, previousDirection, byPlayer)
      if (!existing) return false

      const result = tryUpdateEntityFromWorld(assembly, existing, stage)
      notifyIfError(result, existing, byPlayer)
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
      notifyIfError(result, existing, byPlayer)
    },
    onUndergroundBeltDragRotated(
      assembly: Assembly,
      entity: LuaEntity,
      stage: StageNumber,
      byPlayer: PlayerIndex | nil,
    ): void {
      const existing = assembly.content.findCompatibleWithLuaEntity(entity, nil)
      if (!existing || !existing.isUndergroundBelt()) return
      assert(entity.rotate())
      const result = tryRotateEntityToMatchWorld(assembly, existing, stage)
      notifyIfError(result, existing, byPlayer)
    },
    onCircuitWiresPossiblyUpdated(
      assembly: Assembly,
      entity: LuaEntity,
      stage: StageNumber,
      byPlayer: PlayerIndex | nil,
    ): void {
      const existing = getCompatibleEntityOrAdd(assembly, entity, stage, nil, byPlayer)
      if (!existing) return
      const result = updateWiresFromWorld(assembly, existing, stage)
      if (result == "max-connections-exceeded") {
        createNotification(existing, byPlayer, [L_Interaction.MaxConnectionsReachedInAnotherStage], true)
      } else if (result != "updated" && result != "no-change") {
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
      notifyIfError(result, existing, byPlayer)
      if (entity.valid) entity.cancel_upgrade(entity.force)
    },
    onCleanupToolUsed(assembly: Assembly, entity: LuaEntity, stage: StageNumber): void {
      tryFixEntity(assembly, stage, entity, true)
    },
    tryFixEntity(assembly: Assembly, entity: LuaEntity, stage: StageNumber): void {
      tryFixEntity(assembly, stage, entity, false)
    },
    onEntityForceDeleteUsed(assembly: Assembly, entity: LuaEntity): void {
      const existing = assembly.content.findCompatibleFromLuaEntityOrPreview(entity)
      if (!existing) return
      forceDeleteEntity(assembly, existing)
    },
    onEntityDied(assembly: Assembly, entity: BasicEntityInfo, stage: StageNumber): void {
      const existing = assembly.content.findCompatibleWithLuaEntity(entity, nil)
      if (existing) {
        clearWorldEntity(assembly, existing, stage)
      }
    },
    onMoveEntityToStageCustomInput(
      assembly: Assembly,
      entityOrPreviewEntity: LuaEntity,
      stage: StageNumber,
      byPlayer: PlayerIndex,
    ): void {
      const existing = assembly.content.findCompatibleFromLuaEntityOrPreview(entityOrPreviewEntity)
      if (!existing || existing.isSettingsRemnant) return
      const oldStage = existing.firstStage
      const result = moveEntityToStage(assembly, existing, stage)
      if (result == "updated") {
        createNotification(
          existing,
          byPlayer,
          [L_Interaction.EntityMovedFromStage, assembly.getStageName(oldStage)],
          false,
        )
      } else if (result == "no-change") {
        createNotification(existing, byPlayer, [L_Interaction.AlreadyAtFirstStage], true)
      } else if (result == "cannot-move-upgraded-underground") {
        createNotification(existing, byPlayer, [L_Interaction.CannotMoveUndergroundBeltWithUpgrade], true)
      } else {
        assertNever(result)
      }
    },
    onSendToStageUsed(
      assembly: Assembly,
      entity: LuaEntity,
      fromStage: StageNumber,
      toStage: StageNumber,
      byPlayer: PlayerIndex,
    ): void {
      if (fromStage == toStage) return
      const existing = assembly.content.findExactAtPosition(entity, fromStage, entity.position)
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
    },
    onBringToStageUsed(assembly: Assembly, entity: LuaEntity, stage: StageNumber, byPlayer: PlayerIndex): void {
      const existing = assembly.content.findCompatibleFromLuaEntityOrPreview(entity)
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
    },
    onEntityDollied(
      assembly: Assembly,
      entity: LuaEntity,
      stage: StageNumber,
      oldPosition: Position,
      byPlayer: PlayerIndex | nil,
    ): void {
      const existing = getCompatibleAtPositionOrAdd(assembly, stage, entity, oldPosition, byPlayer)
      if (!existing) return
      assert(!existing.isSettingsRemnant && !existing.isUndergroundBelt(), "cannot move this entity")
      const result = tryDollyEntities(assembly, existing, stage)
      const message = moveResultMessage[result]
      if (message != nil) {
        createNotification(existing, byPlayer, [message, ["entity-name." + entity.name]], true)
      }
    },
  }
}

const WorldNotifier: WorldNotifier = {
  createNotification(
    entity: AssemblyEntity,
    playerIndex: PlayerIndex | nil,
    message: LocalisedString,
    errorSound: boolean,
  ): void {
    const player = playerIndex && game.get_player(playerIndex)
    if (!player) return
    player.create_local_flying_text({
      text: message,
      position: entity.position,
    })
    if (errorSound) player.play_sound({ path: "utility/cannot_build" })
  },
  createIndicator(
    entity: { position: Position; surface?: LuaSurface },
    playerIndex: PlayerIndex | nil,
    text: string,
    color: Color | ColorArray,
  ): void {
    const player = playerIndex && game.get_player(playerIndex)
    if (!player) return

    const { x, y } = entity.position
    player.create_local_flying_text({
      text,
      color,
      position: { x, y: y - 0.5 },
      speed: 0.2,
      time_to_live: 60,
    })
  },
}

export const WorldListener: WorldListener = createWorldListener(WorldNotifier)
