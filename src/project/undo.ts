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

import { LuaEntity, LuaPlayer, PlayerIndex } from "factorio:runtime"
import { Constants, Prototypes } from "../constants"
import { Events, onPlayerInitSince } from "../lib"
import { Migrations } from "../lib/migration"
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

declare const global: GlobalWithPlayers & {
  futureUndoData: LuaMap<number, UndoEntry>
}

function undoInit() {
  global.futureUndoData = new LuaMap()
  setmetatable(global.futureUndoData, { __mode: "v" })
}
Events.on_init(undoInit)
Migrations.fromAny(undoInit)
Events.on_load(() => {
  if (global.futureUndoData != nil) setmetatable(global.futureUndoData, { __mode: "v" })
})

onPlayerInitSince("0.18.0", (player) => {
  const playerData = global.players[player]
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
  const playerData = global.players[player.index]
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

const FutureUndoTranslation = "bp100:future-undo-fake-translation"

function registerUndoLater(handlerName: string, player: LuaPlayer, data: unknown) {
  const id = player.request_translation(FutureUndoTranslation)
  if (id) global.futureUndoData.set(id, { handlerName, data })
}
Events.on_string_translated((e) => {
  if (e.localised_string != FutureUndoTranslation) return

  const entry = global.futureUndoData.get(e.id)
  if (!entry) return
  global.futureUndoData.delete(e.id)

  const player = game.get_player(e.player_index)!
  registerUndo(entry.handlerName, player, entry.data)
})

function doUndoEntry(player: LuaPlayer, entry: UndoEntry): void {
  const handler = undoHandlers[entry.handlerName]
  if (!handler) error(`Undo handler not found: ${entry.handlerName}`)
  handler(player, entry.data)
}
function doUndoEntryAtIndex(playerIndex: PlayerIndex, undoIndex: number): void {
  const playerData = global.players[playerIndex]
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
