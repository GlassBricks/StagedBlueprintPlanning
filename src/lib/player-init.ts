/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { Events } from "./Events"
import { Mutable } from "./util-types"
import { Migrations } from "./migration"

declare const global: Mutable<GlobalWithPlayers>
/**
 * Called when player is initialized (both during on_init and on_player_created).
 */
export function onPlayerInit(action: (player: PlayerIndex) => void): void {
  Events.onAll({
    on_init() {
      for (const [, player] of game.players) {
        action(player.index)
      }
    },
    on_player_created(e): void {
      action(e.player_index)
    },
  })
}

export function onPlayerInitSince(version: string, action: (player: PlayerIndex) => void): void {
  Migrations.since(version, () => {
    for (const [, player] of game.players) {
      action(player.index)
    }
  })
  Events.on_player_created((e) => {
    action(e.player_index)
  })
}
Events.on_init(() => {
  global.players = {}
})
onPlayerInit((index) => {
  ;(global.players as Mutable<GlobalPlayerData>)[index] = {} as PlayerData
})

const playerRemovedHandlers: Array<(playerIndex: PlayerIndex) => void> = []
export function onPlayerRemoved(action: (playerIndex: PlayerIndex) => void): void {
  playerRemovedHandlers.push(action)
}

Events.on_player_removed((e) => {
  const index = e.player_index
  for (const handler of playerRemovedHandlers) {
    handler(index)
  }
  delete (global.players as Mutable<GlobalPlayerData>)[index]
})
