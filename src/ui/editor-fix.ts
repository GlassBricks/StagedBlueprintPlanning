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

import { Events, onPlayerInit } from "../lib"
import { Migrations } from "../lib/migration"

const editorGuiWidth = 474
function updatePlayer(player: LuaPlayer): void {
  const isEditor = player.controller_type === defines.controllers.editor
  if (isEditor) {
    player.gui.top.style.left_margin = editorGuiWidth
    player.gui.left.style.left_margin = editorGuiWidth
  } else {
    player.gui.top.style.left_margin = 0
    player.gui.left.style.left_margin = 0
  }
}
if (!script.active_mods.EditorExtensions) {
  function update(index: PlayerIndex): void {
    const player = game.get_player(index)!
    updatePlayer(player)
  }
  Events.on_player_toggled_map_editor((e) => update(e.player_index))
  onPlayerInit(update)
}

Migrations.since("0.4.0", () => {
  if (script.active_mods.EditorExtensions !== nil) {
    for (const [, player] of game.players) {
      updatePlayer(player)
    }
  }
})
