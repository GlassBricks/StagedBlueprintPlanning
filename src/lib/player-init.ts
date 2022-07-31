/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of BBPP3.
 *
 * BBPP3 is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * BBPP3 is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with BBPP3. If not, see <https://www.gnu.org/licenses/>.
 */

import { GlobalPlayerData, PlayerData } from "../utils/players"
import { Events } from "./Events"
import { Mutable } from "./util-types"

declare const global: {
  players: GlobalPlayerData
}
/**
 * Called when player is initialized (both during on_init and on_player_created).
 */
export function onPlayerInit(action: (player: LuaPlayer) => void): void {
  Events.onAll({
    on_init() {
      for (const [, player] of game.players) {
        action(player)
      }
    },
    on_player_created(e): void {
      action(game.get_player(e.player_index)!)
    },
  })
}
Events.on_init(() => {
  global.players = {}
})
onPlayerInit((player) => {
  ;(global.players as Mutable<GlobalPlayerData>)[player.index] = {} as PlayerData
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
