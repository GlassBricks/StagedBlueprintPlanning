// Copyright (c) 2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Color, ColorArray, LocalisedString, LuaSurface, PlayerIndex } from "factorio:runtime"
import { ProjectEntity } from "../entity/ProjectEntity"
import { Position } from "../lib/geometry"

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

export const _mockable = true
