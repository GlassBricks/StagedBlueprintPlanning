// Copyright (c) 2025 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
  ChooseElemButtonGuiElement,
  FrameGuiElement,
  LuaPlayer,
  PlayerIndex,
  PrototypeWithQualityRead,
  TabbedPaneGuiElement,
  TextFieldGuiElement,
} from "factorio:runtime"
import { OtherConstants } from "../constants"
import { ibind, RegisterClass } from "../lib"
import { Component, destroy, Element, FactorioJsx, renderOpened } from "../lib/factoriojsx"
import { Confirmable, HorizontalPusher, SimpleTitleBar } from "../lib/factoriojsx/components"
import { L_GuiProjectSelector } from "../locale"
import { createUserProject } from "../project/UserProject"
import { MapGenSettingsForm, PlanetSelect } from "./MapGenSettings"
import { teleportToProject } from "./player-current-stage"
import { bringSettingsWindowToFront } from "./ProjectSettings"
import { SpacePlatformSettings, SurfaceSettings } from "../project/surfaces"

interface SpacePlatformSettingsProps {
  firstStarterPack: string
  onMount?: (component: SpacePlatformSettingsSelect) => void
}

@RegisterClass("gui:SpacePlatformSettings")
class SpacePlatformSettingsSelect extends Component<SpacePlatformSettingsProps> {
  private starterPackSelect?: ChooseElemButtonGuiElement
  private planetSelect?: PlanetSelect

  override render({ firstStarterPack, onMount }: SpacePlatformSettingsProps): Element {
    onMount?.(this)

    return (
      <flow styleMod={{ padding: 10 }} direction="vertical">
        <PlanetSelect onMount={(component) => (this.planetSelect = component)} />
        <flow direction="horizontal" styleMod={{ vertical_align: "center" }}>
          <label caption={[L_GuiProjectSelector.StarterPack]} />
          <HorizontalPusher />
          <choose-elem-button
            elem_type="item-with-quality"
            item-with-quality={{ name: firstStarterPack }}
            elem_filters={[
              {
                filter: "type",
                type: "space-platform-starter-pack",
              },
            ]}
            onCreate={(e) => (this.starterPackSelect = e)}
          />
        </flow>
      </flow>
    )
  }

  getSettings(): SpacePlatformSettings | nil {
    const starterPack = this.starterPackSelect?.elem_value as unknown as PrototypeWithQualityRead | nil
    if (starterPack) {
      return {
        type: "spacePlatform",
        starterPack,
        initialPlanet: this.planetSelect?.getPlanet(),
      }
    }
    return nil
  }
}

declare const storage: StorageWithPlayer

interface NewProjectDialogProps {
  playerIndex: PlayerIndex
}

@RegisterClass("gui:NewProjectDialog")
export class NewProjectDialog extends Confirmable<NewProjectDialogProps> {
  private playerIndex!: PlayerIndex
  private element!: FrameGuiElement
  private projectName!: TextFieldGuiElement
  private initialStages!: TextFieldGuiElement
  private tabs?: TabbedPaneGuiElement
  private mapGenSettingsSelect!: MapGenSettingsForm
  private spacePlatformSelect?: SpacePlatformSettingsSelect

  override render(props: NewProjectDialogProps): Element {
    this.playerIndex = props.playerIndex

    const starterPacks = prototypes.get_item_filtered([
      {
        filter: "type",
        type: "space-platform-starter-pack",
      },
    ])
    let firstStarterPack: string | nil
    // only way to iterate, ig
    for (const [pack] of starterPacks) {
      firstStarterPack = pack
      break
    }

    const includePlatforms = script.feature_flags.space_travel && firstStarterPack != nil

    const mapGenSettingsForm = (
      <flow styleMod={{ padding: 10 }}>
        <MapGenSettingsForm onMount={(component) => (this.mapGenSettingsSelect = component)} />
      </flow>
    )

    return (
      <frame
        direction="vertical"
        onCreate={(element) => (this.element = element)}
        styleMod={{ width: 350 }}
        auto_center
        on_gui_closed={ibind(this.onBack)}
      >
        <SimpleTitleBar title={[L_GuiProjectSelector.NewProject]} />
        <frame direction="vertical" style="inside_shallow_frame" styleMod={{ padding: 0 }}>
          <flow direction="vertical" styleMod={{ padding: 10 }}>
            <flow direction="horizontal" styleMod={{ vertical_align: "center" }}>
              <label caption={[L_GuiProjectSelector.Name]} />
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
          </flow>
          {includePlatforms ? (
            <tabbed-pane onCreate={(e) => (this.tabs = e)}>
              <tab caption={[L_GuiProjectSelector.NormalWorld]} />
              {mapGenSettingsForm}
              <tab caption={[L_GuiProjectSelector.SpacePlatformStarterPack, firstStarterPack]} />
              <SpacePlatformSettingsSelect
                firstStarterPack={firstStarterPack!}
                onMount={(component) => (this.spacePlatformSelect = component)}
              />
            </tabbed-pane>
          ) : (
            mapGenSettingsForm
          )}
        </frame>
        <flow style="dialog_buttons_horizontal_flow" direction="horizontal">
          <empty-widget
            style="draggable_space"
            styleMod={{ horizontally_stretchable: true }}
            onCreate={(e) => (e.drag_target = e.parent!.parent as FrameGuiElement)}
          />
          <button style="confirm_button" caption={[L_GuiProjectSelector.Create]} on_gui_click={ibind(this.onConfirm)} />
        </flow>
      </frame>
    )
  }

  onConfirm(): void {
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
        text: [L_GuiProjectSelector.StageCountMustBeAtLeastOne],
        create_at_cursor: true,
      })
      return
    }

    const isSpacePlatform = this.tabs?.selected_tab_index == 2

    let surfaceSettings: SurfaceSettings
    if (isSpacePlatform) {
      const settings = this.spacePlatformSelect?.getSettings()
      if (!settings) {
        player.print([L_GuiProjectSelector.StarterPackNotSelected])
        return
      }
      surfaceSettings = settings
    } else {
      surfaceSettings = this.mapGenSettingsSelect.getSettings()
    }

    const project = createUserProject(projectName, numStages, surfaceSettings)
    storage.players[player.index].compactProjectSettings = nil

    teleportToProject(player, project)
    bringSettingsWindowToFront(player)

    this.close()
  }

  private validateForm(): boolean {
    return this.element.valid && this.projectName.valid && this.initialStages.valid
  }

  private onBack(): void {
    this.close()
  }

  private close(): void {
    destroy(this.element)
  }
}

export function openNewProjectDialog(player: LuaPlayer): void {
  renderOpened(player, <NewProjectDialog playerIndex={player.index} />)
}
