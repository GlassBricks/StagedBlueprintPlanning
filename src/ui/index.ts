/*
 * Copyright (c) 2022-2023 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { destroy } from "../lib/factoriojsx"
import { Migrations } from "../lib/migration"
import "./AllProjects"
import "./opened-entity"
import "./player-navigation"
import "./ProjectSettings"
import "./stage-move-tool"
import "./toggle-staged-copy"
import "./edit-blueprint-filters"
import "./mod-button"
import "./gps-tag"
import "./commands"
import "./misc-controls"

Migrations.fromAny(() => {
  for (const [, player] of game.players) {
    const opened = player.opened
    if (opened && opened.object_name == "LuaGuiElement" && opened.get_mod() == script.mod_name) {
      destroy(opened)
      player.opened = nil
    }
  }
})

Migrations.since("2.3.6", () => {
  for (const [, player] of game.players) {
    const isEditor = player.controller_type == defines.controllers.editor
    if (isEditor) {
      player.gui.top.style.left_margin = 0
      player.gui.left.style.left_margin = 0
    }
  }
})
