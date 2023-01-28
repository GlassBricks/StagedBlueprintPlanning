/*
 * Copyright (c) 2023 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { AssemblyEntity } from "../entity/AssemblyEntity"
import { Position } from "../lib/geometry"

export function createNotification(
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
