// Copyright (c) 2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { PlayerIndex } from "factorio:runtime"
import expect, { mock, MockNoSelf } from "tstl-expect"
import { registerGroupUndoAction, UndoHandler, _simulateUndo } from "../../project/actions"

let fn: MockNoSelf<(playerIndex: PlayerIndex, data: string) => void>
const TestUndo = UndoHandler("<undo test>", (player, data: string) => {
  fn?.(player.index, data)
})
before_each(() => {
  fn = mock.fnNoSelf()
})

test("can run undo action", () => {
  const player = game.players[1]
  TestUndo.register(player, "test data")

  _simulateUndo(player)

  expect(fn).toHaveBeenCalledWith(1, "test data")
})

test("can run multiple undo actions", () => {
  const player = game.players[1]
  const index1 = TestUndo.register(player, "test data 1")
  const index2 = TestUndo.register(player, "test data 2")

  _simulateUndo(player, index2)
  _simulateUndo(player, index1)

  expect(fn).toHaveBeenNthCalledWith(1, 1, "test data 2")
  expect(fn).toHaveBeenNthCalledWith(2, 1, "test data 1")
})

test("can register future undo actions", () => {
  const player = game.players[1]
  TestUndo.registerLater(player, "test data")
  after_ticks(10, () => {
    _simulateUndo(player)

    expect(fn).toHaveBeenCalledWith(1, "test data")
  })
})

test("group undo actions", () => {
  const player = game.players[1]
  const index1 = TestUndo.createAction(player.index, "test data 1")
  const index2 = TestUndo.createAction(player.index, "test data 2")

  registerGroupUndoAction([index1, index2])

  _simulateUndo(player)

  expect(fn).toHaveBeenNthCalledWith(1, 1, "test data 2")
  expect(fn).toHaveBeenNthCalledWith(2, 1, "test data 1")
})
