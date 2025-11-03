// Copyright (c) 2025 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { FrameGuiElement, LuaPlayer, PlayerIndex, TextFieldGuiElement } from "factorio:runtime"
import { L_Game, OtherConstants } from "../constants"
import { funcRef, ibind, RegisterClass } from "../lib"
import { Component, destroy, Element, FactorioJsx, renderNamed } from "../lib/factoriojsx"
import { closeParentParent, HorizontalPusher, SimpleTitleBar } from "../lib/factoriojsx/components"
import { L_GuiProjectSelector } from "../locale"
import { createUserProject } from "../project/UserProject"
import { PropertiesTable } from "../utils/properties-obj"
import {
  defaultMapGenSettings,
  formToSurfaceSettings,
  MapGenSettingsForForm,
  MapGenSettingsForm,
} from "./MapGenSettings"
import { teleportToProject } from "./player-current-stage"
import { bringSettingsWindowToFront } from "./ProjectSettings"

const NewProjectDialogName = script.mod_name + ":new-project-dialog"

declare const storage: StorageWithPlayer

interface NewProjectDialogProps {
  playerIndex: PlayerIndex
}

@RegisterClass("gui:NewProjectDialog")
export class NewProjectDialog extends Component<NewProjectDialogProps> {
  private playerIndex!: PlayerIndex
  private element!: FrameGuiElement
  private projectName!: TextFieldGuiElement
  private initialStages!: TextFieldGuiElement
  private mapGenSettings: PropertiesTable<MapGenSettingsForForm> = defaultMapGenSettings()

  override render(props: NewProjectDialogProps): Element {
    this.playerIndex = props.playerIndex

    return (
      <frame
        direction="vertical"
        onCreate={(element) => (this.element = element)}
        styleMod={{ width: 350 }}
        auto_center
      >
        <SimpleTitleBar title={[L_GuiProjectSelector.NewProject]} />
        <frame direction="vertical" style="inside_shallow_frame_with_padding">
          <flow direction="horizontal" styleMod={{ vertical_align: "center" }}>
            <label caption={[L_GuiProjectSelector.ProjectName]} />
            <HorizontalPusher />
            <textfield
              text=""
              lose_focus_on_confirm={true}
              onCreate={(element) => {
                this.projectName = element
                element.focus()
              }}
              styleMod={{ width: 200 }}
            />
          </flow>
          <flow direction="horizontal" styleMod={{ vertical_align: "center" }}>
            <label caption={[L_GuiProjectSelector.InitialStages]} />
            <HorizontalPusher />
            <textfield
              numeric={true}
              allow_decimal={false}
              allow_negative={false}
              lose_focus_on_confirm={true}
              text={OtherConstants.DefaultNumStages.toString()}
              onCreate={(element) => (this.initialStages = element)}
              styleMod={{ width: 100 }}
            />
          </flow>
          <label style="caption_label" caption={[L_GuiProjectSelector.MapGenSettings]} />
          <MapGenSettingsForm settings={this.mapGenSettings} />
          <flow style="dialog_buttons_horizontal_flow" direction="horizontal">
            <button style="back_button" caption={[L_Game.Cancel]} on_gui_click={funcRef(closeParentParent)} />
            <empty-widget
              style="draggable_space"
              styleMod={{ horizontally_stretchable: true }}
              onCreate={(e) => (e.drag_target = e.parent!.parent!.parent as FrameGuiElement)}
            />
            <button
              style="confirm_button"
              caption={[L_GuiProjectSelector.Create]}
              on_gui_click={ibind(this.onConfirm)}
            />
          </flow>
        </frame>
      </frame>
    )
  }

  private onConfirm(): void {
    if (!this.validateForm()) {
      this.close()
      return
    }

    const player = game.get_player(this.playerIndex)
    if (!player) return

    const projectName = this.projectName.text
    const numStages = tonumber(this.initialStages.text) ?? OtherConstants.DefaultNumStages

    if (numStages < 1) {
      player.create_local_flying_text({
        text: "Stage count must be at least 1",
        create_at_cursor: true,
      })
      return
    }

    const project = createUserProject(projectName, numStages, formToSurfaceSettings(this.mapGenSettings))
    storage.players[player.index].compactProjectSettings = nil

    teleportToProject(player, project)
    bringSettingsWindowToFront(player)

    this.close()
  }

  private validateForm(): boolean {
    return this.element.valid && this.projectName.valid && this.initialStages.valid
  }

  private close(): void {
    destroy(this.element)
  }
}

export function openNewProjectDialog(player: LuaPlayer): void {
  destroy(player.gui.screen[NewProjectDialogName])
  renderNamed(<NewProjectDialog playerIndex={player.index} />, player.gui.screen, NewProjectDialogName)
}
