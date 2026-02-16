// Copyright (c) 2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { LuaPlayer, PlayerIndex } from "factorio:runtime"
import expect, { mock, MockNoSelf } from "tstl-expect"
import {
  _simulateTagRedo,
  _simulateTagUndo,
  _simulateUndo,
  pushTagGroupUndo,
  pushTagUndo,
  registerGroupUndoAction,
  TagUndoHandler,
  UndoHandler,
} from "../../project/actions"

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

interface TestTagData {
  value: string
}

describe("tag-based undo/redo", () => {
  let undoFn: MockNoSelf<(player: LuaPlayer, data: TestTagData) => TestTagData | nil>
  let redoFn: MockNoSelf<(player: LuaPlayer, data: TestTagData) => TestTagData | nil>

  const testHandler = TagUndoHandler<TestTagData>(
    "<tag undo test>",
    (player, data) => undoFn(player, data),
    (player, data) => redoFn(player, data),
  )

  before_each(() => {
    undoFn = mock.fnNoSelf()
    redoFn = mock.fnNoSelf()
    undoFn.invokes((_, data) => ({ value: `redo:${data.value}` }))
    redoFn.invokes((_, data) => ({ value: `undo:${data.value}` }))
  })

  test("registers handler and creates anchor with correct tags", () => {
    const player = game.players[1]
    const action = testHandler.createAction({ value: "test" })
    pushTagUndo(player, player.surface, action)

    const stack = player.undo_redo_stack
    expect(stack.get_undo_item_count()).toBeGreaterThan(0)
    const items = stack.get_undo_item(1)
    let foundTag = false
    for (const i of $range(1, items.length)) {
      const tag = stack.get_undo_tag(1, i, "bp100:undo")
      if (tag != nil) {
        foundTag = true
        const tagData = tag as unknown as { handler: string; data: TestTagData }
        expect(tagData.handler).toBe("<tag undo test>")
        expect(tagData.data.value).toBe("test")
      }
    }
    expect(foundTag).toBe(true)
  })

  test("_simulateTagUndo dispatches to undo handler with correct data", () => {
    const player = game.players[1]
    pushTagUndo(player, player.surface, testHandler.createAction({ value: "hello" }))

    _simulateTagUndo(player)

    expect(undoFn).toHaveBeenCalledTimes(1)
    const [, callData] = undoFn.calls[0]
    expect(callData.value).toBe("hello")
  })

  test("_simulateTagUndo enables redo; _simulateTagRedo dispatches to redo handler", () => {
    const player = game.players[1]
    pushTagUndo(player, player.surface, testHandler.createAction({ value: "original" }))

    _simulateTagUndo(player)

    expect(undoFn).toHaveBeenCalledTimes(1)

    _simulateTagRedo(player)

    expect(redoFn).toHaveBeenCalledTimes(1)
    const [, redoCallData] = redoFn.calls[0]
    expect(redoCallData.value).toBe("redo:original")
  })

  test("round-trip: register -> undo -> redo -> undo", () => {
    const player = game.players[1]
    pushTagUndo(player, player.surface, testHandler.createAction({ value: "rt" }))

    _simulateTagUndo(player)
    expect(undoFn).toHaveBeenCalledTimes(1)

    _simulateTagRedo(player)
    expect(redoFn).toHaveBeenCalledTimes(1)

    _simulateTagUndo(player)
    expect(undoFn).toHaveBeenCalledTimes(2)
  })

  test("undo handler returning nil skips redo tag", () => {
    undoFn.invokes(() => nil)
    const player = game.players[1]
    pushTagUndo(player, player.surface, testHandler.createAction({ value: "no-redo" }))

    _simulateTagUndo(player)

    expect(undoFn).toHaveBeenCalledTimes(1)
    expect(player.undo_redo_stack.get_redo_item_count()).toBe(0)
  })

  test("group undo: multiple actions undone together", () => {
    const player = game.players[1]
    const actions = [
      testHandler.createAction({ value: "a" }),
      testHandler.createAction({ value: "b" }),
      testHandler.createAction({ value: "c" }),
    ]
    pushTagGroupUndo(player, player.surface, actions)

    _simulateTagUndo(player)

    expect(undoFn).toHaveBeenCalledTimes(3)
  })

  test("group redo: multiple actions redone together", () => {
    const player = game.players[1]
    const actions = [testHandler.createAction({ value: "x" }), testHandler.createAction({ value: "y" })]
    pushTagGroupUndo(player, player.surface, actions)

    _simulateTagUndo(player)
    _simulateTagRedo(player)

    expect(redoFn).toHaveBeenCalledTimes(2)
  })

  test("group round-trip: register group -> undo -> redo", () => {
    const player = game.players[1]
    const actions = [testHandler.createAction({ value: "p" }), testHandler.createAction({ value: "q" })]
    pushTagGroupUndo(player, player.surface, actions)

    _simulateTagUndo(player)
    expect(undoFn).toHaveBeenCalledTimes(2)

    _simulateTagRedo(player)
    expect(redoFn).toHaveBeenCalledTimes(2)

    _simulateTagUndo(player)
    expect(undoFn).toHaveBeenCalledTimes(4)
  })
})
