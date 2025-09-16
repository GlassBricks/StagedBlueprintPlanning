// Copyright (c) 2024 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

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
