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

import { Layer } from "../assembly/Assembly"
import { AssemblyEvents } from "../assembly/UserAssembly"
import { getAssemblyAtPosition } from "../assembly/world-register"
import { Events, onPlayerInit } from "../lib"
import { BBox } from "../lib/geometry"
import { MutableState, State, state } from "../lib/observable"

declare global {
  interface PlayerData {
    currentLayer: MutableState<Layer | nil>
  }
}
declare const global: GlobalWithPlayers

onPlayerInit((index) => {
  global.players[index].currentLayer = state(nil)
})
let players: typeof global.players
Events.onInitOrLoad(() => (players = global.players))

function updatePlayer(player: LuaPlayer): void {
  const data = players[player.index]
  if (!data) return // bug workaround
  const currentLayer = data.currentLayer
  const layer = currentLayer.get()
  const { position, surface } = player
  if (layer && layer.valid && layer.surface === surface && BBox.contains(layer, position)) return

  currentLayer.set(getAssemblyAtPosition(position)?.getLayerAt(surface, position))
}
Events.on_player_changed_position((e) => updatePlayer(game.get_player(e.player_index)!))

AssemblyEvents.addListener((e) => {
  if (e.type === "assembly-created" || e.type === "assembly-deleted") {
    for (const [, player] of game.players) {
      updatePlayer(player)
    }
  }
})

export function playerCurrentLayer(index: PlayerIndex): State<Layer | nil> {
  return players[index].currentLayer
}

export function teleportToLayer(player: LuaPlayer, layer: Layer): void {
  const currentPos = player.position
  const surface = layer.surface
  if (BBox.contains(layer, currentPos)) {
    // already in position, check surface
    if (player.surface !== surface) {
      player.teleport(player.position, surface)
    }
  } else {
    // teleport to center
    player.teleport(BBox.center(layer), surface)
  }
}
