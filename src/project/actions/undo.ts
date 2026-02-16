// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { AnyBasic, LuaEntity, LuaPlayer, LuaSurface, PlayerIndex, UndoRedoAction } from "factorio:runtime"
import { Prototypes } from "../../constants"
import { ProtectedEvents } from "../../lib"

const TAG_NAME = "bp100:undo"

type UndoFn<T extends AnyBasic> = (this: void, player: LuaPlayer, data: T) => T | nil
type RedoFn<T extends AnyBasic> = (this: void, player: LuaPlayer, data: T) => T | nil

export interface UndoAction<T extends AnyBasic = AnyBasic> {
  readonly handler: string
  readonly data: T
}

/** @noSelf */
export interface UndoHandler<T extends AnyBasic> {
  createAction(data: T): UndoAction<T>
}

interface HandlerEntry {
  undo: UndoFn<any>
  redo: RedoFn<any>
}

const undoHandlers: Record<string, HandlerEntry> = {}

export function UndoHandler<T extends AnyBasic>(name: string, undoFn: UndoFn<T>, redoFn: RedoFn<T>): UndoHandler<T> {
  if (name in undoHandlers) error(`Undo handler already registered: ${name}`)
  undoHandlers[name] = { undo: undoFn, redo: redoFn }
  return {
    createAction: (data) => ({ handler: name, data }),
  }
}

interface UndoGroupAction {
  readonly _group: true
  readonly actions: UndoAction[]
}

function createAnchorUndoEntry(player: LuaPlayer, surface: LuaSurface): void {
  const ghost = surface.create_entity({
    name: "entity-ghost",
    inner_name: Prototypes.UndoReference,
    position: [0, 1],
  })
  if (!ghost || !player.mine_entity(ghost, true)) {
    error("Failed to create undo anchor")
  }
}

export function pushUndo(player: LuaPlayer, surface: LuaSurface, action: UndoAction): void {
  createAnchorUndoEntry(player, surface)
  const stack = player.undo_redo_stack
  const actions = stack.get_undo_item(1)
  stack.set_undo_tag(1, actions.length, TAG_NAME, action as unknown as AnyBasic)
}

export function pushGroupUndo(player: LuaPlayer, surface: LuaSurface, actions: UndoAction[]): void {
  if (actions.length == 0) return
  if (actions.length == 1) return pushUndo(player, surface, actions[0])
  createAnchorUndoEntry(player, surface)
  const stack = player.undo_redo_stack
  const stackActions = stack.get_undo_item(1)
  const groupAction: UndoGroupAction = { _group: true, actions }
  stack.set_undo_tag(1, stackActions.length, TAG_NAME, groupAction as unknown as AnyBasic)
}

function extractActions(action: UndoRedoAction): UndoAction[] | nil {
  const tag = action.tags?.[TAG_NAME] as (UndoAction | UndoGroupAction) | nil
  if (!tag) return nil
  return "_group" in tag ? tag.actions : [tag]
}

function dispatchActions(player: LuaPlayer, undoActions: UndoAction[], mode: "undo" | "redo"): UndoAction[] {
  const resultActions: UndoAction[] = []
  for (const tag of undoActions) {
    const entry = undoHandlers[tag.handler]
    if (!entry) {
      log(`${mode} handler not found: ${tag.handler}`)
      continue
    }
    const resultData = entry[mode](player, tag.data)
    if (resultData != nil) {
      resultActions.push({ handler: tag.handler, data: resultData })
    }
  }
  return resultActions
}

function packTag(actions: UndoAction[]): AnyBasic {
  const tag: UndoGroupAction | UndoAction = actions.length == 1 ? actions[0] : { _group: true, actions }
  return tag as unknown as AnyBasic
}

ProtectedEvents.on_undo_applied((e) => {
  const player = game.get_player(e.player_index)!
  const stack = player.undo_redo_stack
  for (const i of $range(1, e.actions.length)) {
    const undoActions = extractActions(e.actions[i - 1])
    if (!undoActions) continue
    const redoActions = dispatchActions(player, undoActions, "undo")
    if (redoActions.length > 0) {
      stack.set_redo_tag(1, i, TAG_NAME, packTag(redoActions))
    }
  }
})

ProtectedEvents.on_redo_applied((e) => {
  const player = game.get_player(e.player_index)!
  const stack = player.undo_redo_stack
  for (const i of $range(1, e.actions.length)) {
    const redoActions = extractActions(e.actions[i - 1])
    if (!redoActions) continue
    const undoActions = dispatchActions(player, redoActions, "redo")
    if (undoActions.length > 0) {
      stack.set_undo_tag(1, i, TAG_NAME, packTag(undoActions))
    }
  }
})

// Backward compat: when Factorio undoes/redoes an anchor entity (or old-style undo reference),
// it rebuilds the ghost. Destroy it silently.
export function onUndoReferenceBuilt(this: void, _playerIndex: PlayerIndex, entity: LuaEntity): void {
  entity.destroy()
}

// === Test simulation helpers ===

const simulatedRedoStack = new LuaMap<PlayerIndex, UndoAction[][]>()

export function _simulateUndo(player: LuaPlayer): void {
  const stack = player.undo_redo_stack
  if (stack.get_undo_item_count() == 0) error("No undo items on stack")
  const actions = stack.get_undo_item(1)
  const allRedoActions: UndoAction[] = []
  for (const action of actions) {
    const undoActions = extractActions(action)
    if (!undoActions) continue
    allRedoActions.push(...dispatchActions(player, undoActions, "undo"))
  }
  stack.remove_undo_item(1)
  if (allRedoActions.length > 0) {
    const playerRedoStack = simulatedRedoStack.get(player.index) ?? []
    playerRedoStack.push(allRedoActions)
    simulatedRedoStack.set(player.index, playerRedoStack)
  }
}

export function _simulateRedo(player: LuaPlayer): void {
  const playerRedoStack = simulatedRedoStack.get(player.index)
  if (!playerRedoStack || playerRedoStack.length == 0) error("No redo items on simulated stack")
  const redoActions = playerRedoStack.pop()!
  if (playerRedoStack.length == 0) simulatedRedoStack.delete(player.index)
  const undoActions = dispatchActions(player, redoActions, "redo")
  if (undoActions.length > 0) {
    pushGroupUndo(player, player.surface, undoActions)
  }
}
