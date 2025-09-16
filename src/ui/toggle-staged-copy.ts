// Copyright (c) 2024 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { CustomInputs, Prototypes } from "../constants"
import { Events } from "../lib"

const typeMapping: Record<string, string> = {
  "copy-paste-tool": Prototypes.StagedCopyTool,
  "cut-paste-tool": Prototypes.StagedCutTool,
  [Prototypes.StagedCopyTool]: "copy-paste-tool",
  [Prototypes.StagedCutTool]: "cut-paste-tool",
}

Events.on(CustomInputs.ToggleStagedCopy, (e) => {
  const player = game.get_player(e.player_index)!
  const cursorStack = player.cursor_stack
  if (!cursorStack?.valid || !cursorStack.valid_for_read) return
  const currentItem = cursorStack.name
  const newName = typeMapping[currentItem]
  if (newName != nil) cursorStack.set_stack(newName)
})
