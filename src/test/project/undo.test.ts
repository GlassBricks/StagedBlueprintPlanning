// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { LuaPlayer } from "factorio:runtime"
import expect, { mock, MockNoSelf } from "tstl-expect"
import { _simulateRedo, _simulateUndo, pushGroupUndo, pushUndo, UndoHandler } from "../../project/actions"

interface TestTagData {
  value: string
}

let undoFn: MockNoSelf<(player: LuaPlayer, data: TestTagData) => TestTagData | nil>
let redoFn: MockNoSelf<(player: LuaPlayer, data: TestTagData) => TestTagData | nil>

const testHandler = UndoHandler<TestTagData>(
  "<tag undo test>",
  (player, data) => undoFn(player, data),
  (player, data) => redoFn(player, data),
)

function clearUndoRedoStack(player: LuaPlayer) {
  while (player.undo_redo_stack.get_undo_item_count() > 0) {
    player.undo_redo_stack.remove_undo_item(1)
  }
  while (player.undo_redo_stack.get_redo_item_count() > 0) {
    player.undo_redo_stack.remove_redo_item(1)
  }
}

before_each(() => {
  clearUndoRedoStack(game.players[1])
  undoFn = mock.fnNoSelf()
  redoFn = mock.fnNoSelf()
  undoFn.invokes((_, data) => ({ value: `redo:${data.value}` }))
  redoFn.invokes((_, data) => ({ value: `undo:${data.value}` }))
})

test("registers handler and creates anchor with correct tags", () => {
  const player = game.players[1]
  const action = testHandler.createAction({ value: "test" })
  pushUndo(player, player.surface, action)

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

test("_simulateUndo dispatches to undo handler with correct data", () => {
  const player = game.players[1]
  pushUndo(player, player.surface, testHandler.createAction({ value: "hello" }))

  _simulateUndo(player)

  expect(undoFn).toHaveBeenCalledTimes(1)
  const [, callData] = undoFn.calls[0]
  expect(callData.value).toBe("hello")
})

test("_simulateUndo enables redo; _simulateRedo dispatches to redo handler", () => {
  const player = game.players[1]
  pushUndo(player, player.surface, testHandler.createAction({ value: "original" }))

  _simulateUndo(player)

  expect(undoFn).toHaveBeenCalledTimes(1)

  _simulateRedo(player)

  expect(redoFn).toHaveBeenCalledTimes(1)
  const [, redoCallData] = redoFn.calls[0]
  expect(redoCallData.value).toBe("redo:original")
})

test("round-trip: register -> undo -> redo -> undo", () => {
  const player = game.players[1]
  pushUndo(player, player.surface, testHandler.createAction({ value: "rt" }))

  _simulateUndo(player)
  expect(undoFn).toHaveBeenCalledTimes(1)

  _simulateRedo(player)
  expect(redoFn).toHaveBeenCalledTimes(1)

  _simulateUndo(player)
  expect(undoFn).toHaveBeenCalledTimes(2)
})

test("undo handler returning nil skips redo tag", () => {
  undoFn.invokes(() => nil)
  const player = game.players[1]
  pushUndo(player, player.surface, testHandler.createAction({ value: "no-redo" }))

  _simulateUndo(player)

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
  pushGroupUndo(player, player.surface, actions)

  _simulateUndo(player)

  expect(undoFn).toHaveBeenCalledTimes(3)
})

test("group redo: multiple actions redone together", () => {
  const player = game.players[1]
  const actions = [testHandler.createAction({ value: "x" }), testHandler.createAction({ value: "y" })]
  pushGroupUndo(player, player.surface, actions)

  _simulateUndo(player)
  _simulateRedo(player)

  expect(redoFn).toHaveBeenCalledTimes(2)
})

test("group round-trip: register group -> undo -> redo", () => {
  const player = game.players[1]
  const actions = [testHandler.createAction({ value: "p" }), testHandler.createAction({ value: "q" })]
  pushGroupUndo(player, player.surface, actions)

  _simulateUndo(player)
  expect(undoFn).toHaveBeenCalledTimes(2)

  _simulateRedo(player)
  expect(redoFn).toHaveBeenCalledTimes(2)

  _simulateUndo(player)
  expect(undoFn).toHaveBeenCalledTimes(4)
})
