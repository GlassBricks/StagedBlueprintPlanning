/*
 * Copyright (c) 2024 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { LuaPlayer } from "factorio:runtime"
import { takeStageBlueprint } from "../blueprints/blueprint-creation"
import { L_Interaction } from "../locale"
import { playerCurrentStage } from "./player-current-stage"

export function createStageBlueprint(player: LuaPlayer): void {
  const stage = playerCurrentStage(player.index).get()
  if (!stage) return
  if (!player || !player.clear_cursor()) return
  const stack = player.cursor_stack
  if (!stack) return
  const successful = takeStageBlueprint(stage, stack)
  if (!successful) {
    player.create_local_flying_text({
      text: [L_Interaction.BlueprintEmpty],
      create_at_cursor: true,
    })
    return
  }
}
