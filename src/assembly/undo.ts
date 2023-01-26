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

import { Constants, Prototypes } from "../constants"
import { onPlayerInitSince } from "../lib"
import floor = math.floor

// should be greater than factorio's max undos
export interface UndoEntry {
  handlerName: string
  data: unknown
}

declare global {
  interface PlayerData {
    undoEntries: Record<number, UndoEntry>
    nextUndoEntryIndex: number
  }
}
declare const global: GlobalWithPlayers

onPlayerInitSince("0.17.0", (player) => {
  const playerData = global.players[player]
  playerData.undoEntries = {}
  playerData.nextUndoEntryIndex = 1
})

export type UndoFn<T> = (this: void, player: LuaPlayer, data: T) => void

export type UndoHandler<T> = (this: void, player: LuaPlayer, data: T) => number

const undoHandlers: Record<string, (this: void, player: LuaPlayer, data: any) => void> = {}

export function UndoHandler<T>(name: string, fn: UndoFn<T>): UndoHandler<T> {
  if (name in undoHandlers) error(`Undo handler already registered: ${name}`)
  undoHandlers[name] = fn

  return (player, data) => createUndoReference(name, player, data)
}

function createUndoReference(handlerName: string, player: LuaPlayer, data: unknown) {
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

  return index
}

export function onUndoReferenceBuilt(this: void, playerIndex: PlayerIndex, entity: LuaEntity): void {
  const position = entity.position
  entity.destroy()

  const index = position.x
  if (index != floor(index) || position.y != 0) {
    // invalid, ignore
    return
  }
  const playerData = global.players[playerIndex]
  const entry = playerData.undoEntries[index]
  if (!entry) return // ignore
  const handler = undoHandlers[entry.handlerName]
  if (!handler) error(`Undo handler not found: ${entry.handlerName}`)
  delete playerData.undoEntries[index]
  playerData.nextUndoEntryIndex = index
  handler(game.get_player(playerIndex)!, entry.data)
}
