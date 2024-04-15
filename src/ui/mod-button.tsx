/*
 * Copyright (c) 2024 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { LuaPlayer, OnGuiClickEvent } from "factorio:runtime"
import * as mod_gui from "mod-gui"
import { Sprites } from "../constants"
import { Events, funcRef, onPlayerInitSince, registerFunctions } from "../lib"
import { destroy, FactorioJsx, renderNamed } from "../lib/factoriojsx"
import { SimpleTitleBar } from "../lib/factoriojsx/components"
import { Migrations } from "../lib/migration"
import { L_GuiProjectSelector } from "../locale"
import { getAllProjects } from "../project/UserProject"
import { closeAllProjects, toggleAllProjects } from "./AllProjects"

declare const global: GlobalWithPlayers
declare global {
  interface PlayerData {
    confirmedEditorMode?: true
  }
}

function ModButton() {
  return (
    <sprite-button
      style={mod_gui.button_style}
      sprite={Sprites.BlueprintStages}
      tooltip={[L_GuiProjectSelector.ShowAllProjects]}
      on_gui_click={funcRef(onModButtonClick)}
    />
  )
}

function onModButtonClick(event: OnGuiClickEvent) {
  const playerIndex = event.player_index
  const player = game.get_player(playerIndex)!
  const playerData = global.players[playerIndex]
  if (!playerData.confirmedEditorMode) {
    toggleConfirmEditorModeGui(player)
  } else {
    toggleAllProjects(player)
  }
}

const EditorModeConfirmationName = script.mod_name + ":editor-mode-confirmation"
function EditorModeConfirmation() {
  return (
    <frame direction="vertical">
      <SimpleTitleBar />
      <label caption={[L_GuiProjectSelector.EditorModeOnlyMessage1]} />
      <label caption={[L_GuiProjectSelector.EditorModeOnlyMessage2]} />
      <label caption={[L_GuiProjectSelector.EditorModeOnlyMessage3]} />
      <button caption={[L_GuiProjectSelector.SwitchToEditorMode]} on_gui_click={funcRef(switchToEditorMode)} />
    </frame>
  )
}
function toggleConfirmEditorModeGui(player: LuaPlayer) {
  if (
    player.cheat_mode ||
    player.controller_type == defines.controllers.editor ||
    player.controller_type == defines.controllers.god
  ) {
    openProjectListFirstTime(player)
    return
  }

  const frameFlow = mod_gui.get_frame_flow(player)
  const existingGui = frameFlow[EditorModeConfirmationName]
  if (existingGui) {
    destroy(existingGui)
  } else {
    renderNamed(<EditorModeConfirmation />, frameFlow, EditorModeConfirmationName)
  }
}

function switchToEditorMode(event: OnGuiClickEvent) {
  game.get_player(event.player_index)?.toggle_map_editor()
}

function openProjectListFirstTime(player: LuaPlayer) {
  const playerData = global.players[player.index]
  playerData.confirmedEditorMode = true
  const frameFlow = mod_gui.get_frame_flow(player)
  destroy(frameFlow[EditorModeConfirmationName])

  toggleAllProjects(player)
}

Events.on_player_toggled_map_editor((event) => {
  const playerData = global.players[event.player_index]
  const player = game.get_player(event.player_index)!
  if (playerData.confirmedEditorMode || player.controller_type != defines.controllers.editor) return
  const frameFlow = mod_gui.get_frame_flow(player)
  const existingGui = frameFlow[EditorModeConfirmationName]
  if (!existingGui) return
  openProjectListFirstTime(player)
})

registerFunctions("gui:project-selector", { onModButtonClick, switchToEditorMode })

const ModButtonName = script.mod_name + ":all-projects"
onPlayerInitSince("0.15.1", (playerIndex) => {
  const player = game.get_player(playerIndex)!
  renderNamed(<ModButton />, mod_gui.get_button_flow(player), ModButtonName)
})
Migrations.early("0.23.0", () => {
  const oldModButtonName = script.mod_name + ":all-assemblies"
  const oldAllProjectsName = script.mod_name + ":all-assemblies"
  for (const [, player] of game.players) {
    const flow = mod_gui.get_button_flow(player)
    destroy(flow[oldModButtonName])
    const frameFlow = mod_gui.get_frame_flow(player)
    destroy(frameFlow[oldAllProjectsName])
  }
})
Migrations.fromAny(() => {
  for (const [, player] of game.players) {
    closeAllProjects(player)
    const flow = mod_gui.get_button_flow(player)
    if (flow[ModButtonName] == nil) renderNamed(<ModButton />, flow, ModButtonName)
  }
})

Migrations.to("0.32.1", () => {
  if (getAllProjects().length > 0) {
    for (const [, data] of pairs(global.players)) {
      data.confirmedEditorMode = true
      data.researchTechPromptDismissed = true
    }
  }
})

if ("debugadapter" in script.active_mods) {
  commands.add_command("reset-confirm-editor-mode", "Reset confirm editor mode", () => {
    for (const [, data] of pairs(global.players)) {
      data.confirmedEditorMode = nil
      data.researchTechPromptDismissed = nil
    }
  })
}
