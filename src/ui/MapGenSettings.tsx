// Copyright (c) 2025 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { MapGenSettings } from "factorio:prototype"
import {
  DropDownGuiElement,
  FrameGuiElement,
  LocalisedString,
  LuaPlayer,
  LuaSpaceLocationPrototype,
  MapGenSettingsWrite,
  TextFieldGuiElement,
} from "factorio:runtime"
import { L_Game } from "../constants"
import { asMutable, funcRef, ibind, Mutable, RegisterClass } from "../lib"
import { Component, destroy, Element, FactorioJsx, renderNamed } from "../lib/factoriojsx"
import { closeParentParent, HorizontalPusher, SimpleTitleBar } from "../lib/factoriojsx/components"
import { L_GuiSetSeedSelect } from "../locale"
import { syncMapGenSettings } from "../project/map-gen"
import { Stage } from "../project/ProjectDef"

interface Props {
  stage: Stage
}

const name = "bp100:MapGenSettingsSelect"
@RegisterClass("gui:MapGenSettingsSelect")
export class MapGenSettingsSelect extends Component<Props> {
  private stage!: Stage
  private planets!: LuaSpaceLocationPrototype[]
  private element!: FrameGuiElement
  private seed!: TextFieldGuiElement
  private planet!: DropDownGuiElement

  render({ stage }: Props): Element {
    this.stage = stage
    this.planets = Object.values(prototypes.space_location).filter((p) => p.map_gen_settings != nil)
    const planetNames = this.planets.map(
      (planet): LocalisedString => ["", `[planet=${planet.name}]`, planet.localised_name],
    )
    return (
      <frame
        direction="vertical"
        onCreate={(element) => (this.element = element)}
        styleMod={{ width: 300 }}
        auto_center
      >
        <SimpleTitleBar title={[L_GuiSetSeedSelect.Title]} />
        <flow direction="horizontal">
          <label caption={[L_GuiSetSeedSelect.Seed]} tooltip={[L_GuiSetSeedSelect.SeedTooltip]} />
          <HorizontalPusher />
          <textfield
            numeric={true}
            allow_decimal={false}
            allow_negative={false}
            lose_focus_on_confirm={true}
            text={game.surfaces[1].map_gen_settings.seed.toString()}
            onCreate={(element) => (this.seed = element)}
            styleMod={{ width: 150 }}
          />
        </flow>
        <flow direction="horizontal">
          <label caption={[L_GuiSetSeedSelect.Planet]} />
          <HorizontalPusher />
          <drop-down
            items={planetNames}
            selected_index={1}
            onCreate={(element) => (this.planet = element)}
            styleMod={{ width: 150 }}
          />
        </flow>
        <flow style="dialog_buttons_horizontal_flow">
          <button style="back_button" caption={[L_Game.Cancel]} on_gui_click={funcRef(closeParentParent)} />
          <empty-widget
            style="draggable_space"
            styleMod={{ horizontally_stretchable: true }}
            onCreate={(e) => (e.drag_target = e.parent!.parent as FrameGuiElement)}
          />
          <button style="confirm_button" caption={[L_Game.Confirm]} on_gui_click={ibind(this.onConfirm)} />
        </flow>
      </frame>
    )
  }

  private onConfirm(): void {
    if (!(this.stage.valid && this.element.valid && this.seed.valid && this.planet.valid)) {
      this.close()
      return
    }
    const planet = this.planets[this.planet.selected_index - 1]
    const seed = tonumber(this.seed.text)
    this.close()
    const mapGenSettings: Mutable<MapGenSettings> = asMutable(planet.map_gen_settings!)
    if (seed) mapGenSettings.seed = (seed + (planet.map_seed_offset ?? 0)) % 2 ** 32
    const surface = this.stage.surface
    surface.map_gen_settings = mapGenSettings as MapGenSettingsWrite
    surface.generate_with_lab_tiles = false
    surface.ignore_surface_conditions = false
    syncMapGenSettings(this.stage)
  }
  private close() {
    destroy(this.element)
  }
}

export function openMapGenSettingsSelect(player: LuaPlayer, stage: Stage): void {
  renderNamed(<MapGenSettingsSelect stage={stage} />, player.gui.screen, name)
}
