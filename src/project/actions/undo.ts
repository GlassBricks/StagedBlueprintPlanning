// Copyright (c) 2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { AnyBasic, LuaEntity, LuaPlayer, LuaSurface, PlayerIndex, UndoRedoAction } from "factorio:runtime"
import { Constants, Prototypes } from "../../constants"
import { onPlayerInitSince, ProtectedEvents } from "../../lib"
import { DelayedEvent } from "../../lib/delayed-event"
import { Migrations } from "../../lib/migration"
import floor = math.floor

interface UndoEntry {
  handlerName: string
  data: unknown
}

declare global {
  interface PlayerData {
    undoEntries: Record<number, UndoEntry>
    nextUndoEntryIndex: number
  }
}
declare const storage: StorageWithPlayer

onPlayerInitSince("0.18.0", (player) => {
  const playerData = storage.players[player]
  playerData.undoEntries = {}
  playerData.nextUndoEntryIndex = 1
})

export interface UndoAction {
  playerIndex: PlayerIndex
  handlerName: string
  data: unknown
}

export type UndoFn<T> = (this: void, player: LuaPlayer, data: T) => void

// export type UndoHandler<T> = (this: void, player: LuaPlayer, data: T) => number
/** @noSelf */
export interface UndoHandler<T> {
  register(player: LuaPlayer, data: T): number

  registerLater(player: LuaPlayer, data: T): void

  createAction(player: PlayerIndex, data: T): UndoAction
}

const undoHandlers: Record<string, (this: void, player: LuaPlayer, data: any) => void> = {}

export function UndoHandler<T>(name: string, fn: UndoFn<T>): UndoHandler<T> {
  if (name in undoHandlers) error(`Undo handler already registered: ${name}`)
  undoHandlers[name] = fn

  return {
    register: (player, data) => registerUndo(name, player, data),
    registerLater: (player, data) => registerUndoLater(name, player, data),
    createAction: (playerIndex, data) => ({ playerIndex, handlerName: name, data }),
  }
}

let _lastUndoIndex: number | nil

function registerUndo(handlerName: string, player: LuaPlayer, data: unknown) {
  const playerData = storage.players[player.index]
  const index = playerData.nextUndoEntryIndex
  const entity = player.surface.create_entity({
    name: "entity-ghost",
    inner_name: Prototypes.UndoReference,
    position: [index, 0],
  })

  if (!entity || !player.mine_entity(entity, true)) {
    error("Failed to make undo reference entity")
  }

  playerData.undoEntries[index] = { handlerName, data }
  playerData.nextUndoEntryIndex = (index % Constants.MAX_UNDO_ENTRIES) + 1

  _lastUndoIndex = index

  return index
}

export function registerUndoAction(action: UndoAction): void {
  const player = game.get_player(action.playerIndex)
  if (player) registerUndo(action.handlerName, player, action.data)
}

export function registerUndoActionLater(action: UndoAction): void {
  const player = game.get_player(action.playerIndex)
  if (player) registerUndoLater(action.handlerName, player, action.data)
}

export function registerGroupUndoAction(actions: UndoAction[]): void {
  if (actions.length == 0) return
  if (actions.length == 1) return registerUndoAction(actions[0])
  const playerIndex = actions[0].playerIndex
  assert(
    actions.every((a) => a.playerIndex == playerIndex),
    "All actions must be for the same player",
  )
  registerUndoAction({
    handlerName: "_undoGroup",
    playerIndex,
    data: actions,
  })
}

const FutureUndoEvent = DelayedEvent<[player: LuaPlayer, name: string, data: unknown]>(
  "undo",
  ([player, name, data]) => {
    registerUndo(name, player, data)
  },
)

function registerUndoLater(handlerName: string, player: LuaPlayer, data: unknown) {
  FutureUndoEvent([player, handlerName, data])
}

function doUndoEntry(player: LuaPlayer, entry: UndoEntry): void {
  const handler = undoHandlers[entry.handlerName]
  if (!handler) error(`Undo handler not found: ${entry.handlerName}`)
  handler(player, entry.data)
}
function doUndoEntryAtIndex(playerIndex: PlayerIndex, undoIndex: number): void {
  const playerData = storage.players[playerIndex]
  const entry = playerData.undoEntries[undoIndex]
  if (!entry) return // ignore
  delete playerData.undoEntries[undoIndex]
  playerData.nextUndoEntryIndex = undoIndex
  const player = game.get_player(playerIndex)!
  assert(player)
  doUndoEntry(player, entry)
}

UndoHandler("_undoGroup", (player, actions: UndoAction[]) => {
  // for (const action of actions) doUndoEntry(player, action)
  // do actions in reverse
  for (const i of $range(actions.length, 1, -1)) {
    doUndoEntry(player, actions[i - 1])
  }
})

export function onUndoReferenceBuilt(this: void, playerIndex: PlayerIndex, entity: LuaEntity): void {
  const position = entity.position
  entity.destroy()

  const index = position.x
  if (index != floor(index) || position.y != 0) {
    // invalid, ignore
    return
  }
  doUndoEntryAtIndex(playerIndex, index)
}

export function _simulateUndo(player: LuaPlayer, index = _lastUndoIndex ?? error("No undo action to simulate")): void {
  doUndoEntryAtIndex(player.index, index)
  _lastUndoIndex = nil
}
export function performUndoAction(action: UndoAction): void {
  doUndoEntry(game.get_player(action.playerIndex)!, action)
}

// === New tag-based undo/redo system ===

const TAG_NAME = "bp100:undo"

type TagUndoFn<T extends AnyBasic> = (this: void, player: LuaPlayer, data: T) => T | nil
type TagRedoFn<T extends AnyBasic> = (this: void, player: LuaPlayer, data: T) => T | nil

export interface TagUndoAction<T extends AnyBasic = AnyBasic> {
  readonly handler: string
  readonly data: T
}

/** @noSelf */
export interface TagUndoHandler<T extends AnyBasic> {
  createAction(data: T): TagUndoAction<T>
}

interface TagHandlerEntry {
  undo: TagUndoFn<any>
  redo: TagRedoFn<any>
}

const tagUndoHandlers: Record<string, TagHandlerEntry> = {}

export function TagUndoHandler<T extends AnyBasic>(
  name: string,
  undoFn: TagUndoFn<T>,
  redoFn: TagRedoFn<T>,
): TagUndoHandler<T> {
  if (name in tagUndoHandlers) error(`Tag undo handler already registered: ${name}`)
  tagUndoHandlers[name] = { undo: undoFn, redo: redoFn }
  return {
    createAction: (data) => ({ handler: name, data }),
  }
}

interface TagUndoGroupAction {
  readonly _group: true
  readonly actions: TagUndoAction[]
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

export function pushTagUndo(player: LuaPlayer, surface: LuaSurface, action: TagUndoAction): void {
  createAnchorUndoEntry(player, surface)
  const stack = player.undo_redo_stack
  const actions = stack.get_undo_item(1)
  stack.set_undo_tag(1, actions.length, TAG_NAME, action as unknown as AnyBasic)
}

export function pushTagGroupUndo(player: LuaPlayer, surface: LuaSurface, actions: TagUndoAction[]): void {
  if (actions.length == 0) return
  if (actions.length == 1) return pushTagUndo(player, surface, actions[0])
  createAnchorUndoEntry(player, surface)
  const stack = player.undo_redo_stack
  const stackActions = stack.get_undo_item(1)
  const groupAction: TagUndoGroupAction = { _group: true, actions }
  stack.set_undo_tag(1, stackActions.length, TAG_NAME, groupAction as unknown as AnyBasic)
}

function extractTagActions(action: UndoRedoAction): TagUndoAction[] | nil {
  const tag = action.tags?.[TAG_NAME] as (TagUndoAction | TagUndoGroupAction) | nil
  if (!tag) return nil
  return "_group" in tag ? tag.actions : [tag]
}

function dispatchTagActions(player: LuaPlayer, tagActions: TagUndoAction[], mode: "undo" | "redo"): TagUndoAction[] {
  const resultActions: TagUndoAction[] = []
  for (const tag of tagActions) {
    const entry = tagUndoHandlers[tag.handler]
    if (!entry) {
      log(`Tag ${mode} handler not found: ${tag.handler}`)
      continue
    }
    const resultData = entry[mode](player, tag.data)
    if (resultData != nil) {
      resultActions.push({ handler: tag.handler, data: resultData })
    }
  }
  return resultActions
}

function packTag(actions: TagUndoAction[]): AnyBasic {
  const tag: TagUndoGroupAction | TagUndoAction = actions.length == 1 ? actions[0] : { _group: true, actions }
  return tag as unknown as AnyBasic
}

ProtectedEvents.on_undo_applied((e) => {
  const player = game.get_player(e.player_index)!
  const stack = player.undo_redo_stack
  for (const i of $range(1, e.actions.length)) {
    const tagActions = extractTagActions(e.actions[i - 1])
    if (!tagActions) continue
    const redoActions = dispatchTagActions(player, tagActions, "undo")
    if (redoActions.length > 0) {
      stack.set_redo_tag(1, i, TAG_NAME, packTag(redoActions))
    }
  }
})

ProtectedEvents.on_redo_applied((e) => {
  const player = game.get_player(e.player_index)!
  const stack = player.undo_redo_stack
  for (const i of $range(1, e.actions.length)) {
    const tagActions = extractTagActions(e.actions[i - 1])
    if (!tagActions) continue
    const undoActions = dispatchTagActions(player, tagActions, "redo")
    if (undoActions.length > 0) {
      stack.set_undo_tag(1, i, TAG_NAME, packTag(undoActions))
    }
  }
})

const simulatedRedoStack = new LuaMap<PlayerIndex, TagUndoAction[][]>()

export function _simulateTagUndo(player: LuaPlayer): void {
  const stack = player.undo_redo_stack
  if (stack.get_undo_item_count() == 0) error("No undo items on stack")
  const actions = stack.get_undo_item(1)
  const allRedoActions: TagUndoAction[] = []
  for (const action of actions) {
    const tagActions = extractTagActions(action)
    if (!tagActions) continue
    allRedoActions.push(...dispatchTagActions(player, tagActions, "undo"))
  }
  stack.remove_undo_item(1)
  if (allRedoActions.length > 0) {
    const playerRedoStack = simulatedRedoStack.get(player.index) ?? []
    playerRedoStack.push(allRedoActions)
    simulatedRedoStack.set(player.index, playerRedoStack)
  }
}

export function _simulateTagRedo(player: LuaPlayer): void {
  const playerRedoStack = simulatedRedoStack.get(player.index)
  if (!playerRedoStack || playerRedoStack.length == 0) error("No redo items on simulated stack")
  const redoActions = playerRedoStack.pop()!
  if (playerRedoStack.length == 0) simulatedRedoStack.delete(player.index)
  const undoActions = dispatchTagActions(player, redoActions, "redo")
  if (undoActions.length > 0) {
    pushTagGroupUndo(player, player.surface, undoActions)
  }
}

Migrations.to("2.10.6", () => {
  assume<{
    futureUndoData?: LuaMap<number, UndoEntry>
  }>(storage)

  delete storage.futureUndoData
})
