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

import expect, { mock, MockNoSelf } from "tstl-expect"
import { UndoHandler } from "../../assembly/undo"
import { Prototypes } from "../../constants"

let fn: MockNoSelf<(playerIndex: PlayerIndex, data: string) => void>
const registerTestUndo = UndoHandler("<undo test>", (player, data: string) => {
  fn?.(player.index, data)
})
before_each(() => {
  fn = mock.fnNoSelf()
})

function simulateUndo(player: LuaPlayer, index: number) {
  player.cursor_stack!.set_stack(Prototypes.UndoReference)
  player.build_from_cursor({
    position: [index, 0],
  })
}

test("can run undo action", () => {
  const player = game.players[1]
  const index = registerTestUndo(player, "test data")

  simulateUndo(player, index)

  expect(fn).toHaveBeenCalledWith(1, "test data")
})

test("can run multiple undo actions", () => {
  const player = game.players[1]
  const index1 = registerTestUndo(player, "test data 1")
  const index2 = registerTestUndo(player, "test data 2")

  simulateUndo(player, index2)
  simulateUndo(player, index1)

  expect(fn).nthCalledWith(1, 1, "test data 2")
  expect(fn).nthCalledWith(2, 1, "test data 1")
})
