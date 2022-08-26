/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of 100% Blueprint Planning.
 *
 * 100% Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * 100% Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with 100% Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { Events, onPlayerInit } from "../../lib"
import controllers = defines.controllers

if (!script.active_mods.EditorExtensions) {
  const editorGuiWidth = 474
  function update(index: PlayerIndex): void {
    const player = game.get_player(index)!
    const isEditor = player.controller_type === controllers.editor
    if (isEditor) {
      player.gui.top.style.left_margin = editorGuiWidth
      player.gui.left.style.left_margin = editorGuiWidth
    } else {
      player.gui.top.style.left_margin = 0
      player.gui.left.style.left_margin = 0
    }
  }
  Events.on_player_toggled_map_editor((e) => update(e.player_index))
  onPlayerInit(update)
}
