// Copyright (c) 2022-2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { destroy } from "../lib/factoriojsx"
import { Migrations } from "../lib/migration"
import "./AllProjects"
import "./commands"
import "./edit-blueprint-filters"
import "./misc-controls"
import "./mod-button"
import "./opened-entity"
import "./player-navigation"
import "./ProjectSettings"
import "./stage-move-tool"
import "./toggle-staged-copy"

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
