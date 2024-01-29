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
