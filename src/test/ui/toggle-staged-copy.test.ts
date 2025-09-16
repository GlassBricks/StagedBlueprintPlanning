// Copyright (c) 2024 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

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
