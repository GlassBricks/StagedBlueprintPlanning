// Copyright (c) 2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Color, ColorArray, LocalisedString, LuaSurface, PlayerIndex } from "factorio:runtime"
import { L_Game } from "../../constants"
import { ProjectEntity } from "../../entity/ProjectEntity"
import { assertNever } from "../../lib"
import { Position } from "../../lib/geometry"
import { L_Interaction } from "../../locale"
import { EntityUpdateResult, StageMoveResult } from "./undo-records"

export function createNotification(
  entity: ProjectEntity,
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
}
export function createIndicator(
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
}

export function notifyIfUpdateError(
  result: EntityUpdateResult,
  entity: ProjectEntity,
  byPlayer: PlayerIndex | nil,
): void {
  if (result == "no-change" || result == "updated") return
  if (result == "cannot-rotate") {
    createNotification(entity, byPlayer, [L_Game.CantBeRotated], true)
  } else if (result == "cannot-upgrade-changed-pair") {
    createNotification(entity, byPlayer, [L_Interaction.CannotUpgradeUndergroundChangedPair], true)
  } else {
    assertNever(result)
  }
}

export function notifyIfMoveError(result: StageMoveResult, entity: ProjectEntity, byPlayer: PlayerIndex | nil): void {
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
