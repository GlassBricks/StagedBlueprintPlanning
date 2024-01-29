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

import expect from "tstl-expect"
import { CustomInputs, Prototypes } from "../../constants"
import { Events } from "../../lib"
import { getPlayer } from "../../lib/test/misc"

test.each([
  ["copy-paste-tool", Prototypes.StagedCopyTool],
  ["cut-paste-tool", Prototypes.StagedCutTool],
  [Prototypes.StagedCopyTool, "copy-paste-tool"],
  [Prototypes.StagedCutTool, "cut-paste-tool"],
  ["blueprint", "blueprint"],
])("using toggle staged copy from %s to %s", (from, to) => {
  const player = getPlayer()
  const cursorStack = player.cursor_stack!
  cursorStack.set_stack(from)
  Events.raiseFakeEvent(CustomInputs.ToggleStagedCopy, { player_index: player.index })
  expect(cursorStack.name).toBe(to)
})
