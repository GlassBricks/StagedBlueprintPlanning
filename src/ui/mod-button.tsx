// Copyright (c) 2024 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { LuaPlayer, OnGuiClickEvent } from "factorio:runtime"
import * as mod_gui from "mod-gui"
import { Sprites } from "../constants"
import { Events, funcRef, onPlayerInitSince, registerFunctions } from "../lib"
import { destroy, FactorioJsx, renderNamed } from "../lib/factoriojsx"
import { SimpleTitleBar } from "../lib/factoriojsx/components"
import { Migrations } from "../lib/migration"
import { L_GuiProjectSelector } from "../locale"
import { closeAllProjects, toggleAllProjects } from "./AllProjects"

declare const storage: StorageWithPlayer
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
  const playerData = storage.players[playerIndex]
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
  const playerData = storage.players[player.index]
  playerData.confirmedEditorMode = true
  const frameFlow = mod_gui.get_frame_flow(player)
  destroy(frameFlow[EditorModeConfirmationName])

  toggleAllProjects(player)
}

Events.on_player_toggled_map_editor((event) => {
  const playerData = storage.players[event.player_index]
  const player = game.get_player(event.player_index)!
  if (playerData.confirmedEditorMode || player.controller_type != defines.controllers.editor) return
  const frameFlow = mod_gui.get_frame_flow(player)
  const existingGui = frameFlow[EditorModeConfirmationName]
  if (!existingGui) return
  openProjectListFirstTime(player)
})

registerFunctions("gui:project-selector", { onModButtonClick, switchToEditorMode })

function rerenderModButton(player: LuaPlayer) {
  const flow = mod_gui.get_button_flow(player)
  renderNamed(<ModButton />, flow, ModButtonName)
}

const ModButtonName = script.mod_name + ":all-projects"
onPlayerInitSince("0.15.1", (playerIndex) => {
  const player = game.get_player(playerIndex)!
  rerenderModButton(player)
})

commands.add_command(
  "staged-bp-planning-refresh-mod-button",
  "Staged Blueprint Planning: Refresh the top left button, in case it has disappeared",
  (data) => {
    const player_index = data.player_index
    if (!player_index) return
    rerenderModButton(game.get_player(player_index)!)
  },
)

Migrations.fromAny(() => {
  for (const [, player] of game.players) {
    closeAllProjects(player)
    const flow = mod_gui.get_button_flow(player)
    if (flow[ModButtonName] == nil) renderNamed(<ModButton />, flow, ModButtonName)
  }
})
