// Copyright (c) 2022-2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { VersionString } from "factorio:common"
import { PlayerIndex } from "factorio:runtime"
import { Events } from "./Events"
import { Migrations } from "./migration"
import { Mutable } from "./_util"

declare const storage: Mutable<StorageWithPlayer>
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

export function onPlayerInitSince(version: VersionString, action: (player: PlayerIndex) => void): void {
  function initForAllPlayers() {
    for (const [, player] of game.players) {
      action(player.index)
    }
  }
  Migrations.early(version, initForAllPlayers)
  Events.on_init(initForAllPlayers)
  Events.on_player_created((e) => {
    action(e.player_index)
  })
}
Events.on_init(() => {
  storage.players = {}
})
onPlayerInit((index) => {
  storage.players ??= {}
  ;(storage.players as Mutable<GlobalPlayerData>)[index] = {} as PlayerData
})

const playerRemovedHandlers: Array<(playerIndex: PlayerIndex) => void> = []
// noinspection JSUnusedGlobalSymbols
export function onPlayerRemoved(action: (playerIndex: PlayerIndex) => void): void {
  playerRemovedHandlers.push(action)
}

Events.on_player_removed((e) => {
  const index = e.player_index
  for (const handler of playerRemovedHandlers) {
    handler(index)
  }
  if (storage.players != nil) delete (storage.players as Mutable<GlobalPlayerData>)[index]
})
