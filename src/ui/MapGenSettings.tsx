// Copyright (c) 2025 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
  DropDownGuiElement,
  FrameGuiElement,
  LocalisedString,
  LuaPlayer,
  LuaSpaceLocationPrototype,
  OnGuiSelectedTabChangedEvent,
} from "factorio:runtime"
import { L_Game } from "../constants"
import { asMutable, funcRef, ibind, RegisterClass } from "../lib"
import { Component, destroy, Element, FactorioJsx, renderNamed } from "../lib/factoriojsx"
import { closeParentParent, HorizontalPusher, SimpleTitleBar } from "../lib/factoriojsx/components"
import { L_GuiMapGenSettings } from "../locale"
import { Stage } from "../project/ProjectDef"
import { applySurfaceSettingsAndClear, type SurfaceSettings } from "../project/surfaces"
import { createPropertiesTable, getCurrentValues, PropertiesTable, setCurrentValuesOf } from "../utils/properties-obj"

export interface MapGenSettingsForForm {
  planet: string | nil
  seed: string
  generate_with_lab_tiles: boolean
  ignore_surface_conditions: boolean
  has_global_electric_network: boolean
}

function fromSurfaceSettings(settings: SurfaceSettings): PropertiesTable<MapGenSettingsForForm> {
  const planetPrototype = settings.planet ? prototypes.space_location[settings.planet] : nil
  const mapGenSeed = settings.map_gen_settings.seed
  const seed = planetPrototype ? (mapGenSeed - (planetPrototype.map_seed_offset ?? 0) + 2 ** 32) % 2 ** 32 : mapGenSeed

  return createPropertiesTable(keys<MapGenSettingsForForm>(), {
    planet: settings.planet,
    seed: tostring(seed),
    generate_with_lab_tiles: settings.generate_with_lab_tiles,
    ignore_surface_conditions: settings.ignore_surface_conditions,
    has_global_electric_network: settings.has_global_electric_network,
  })
}

export function formToSurfaceSettings(settings: PropertiesTable<MapGenSettingsForForm>): SurfaceSettings {
  const planet = settings.planet.get()
  const planetProto = planet ? prototypes.space_location[planet] : nil
  const mapGenSettings = asMutable(planetProto?.map_gen_settings ?? game.default_map_gen_settings)

  const mapGenSeed = tonumber(settings.seed.get())
  if (mapGenSeed != nil) {
    const offset = planetProto?.map_seed_offset ?? 0
    mapGenSettings.seed = planetProto ? (mapGenSeed + offset) % 2 ** 32 : mapGenSeed
  }

  return {
    planet,
    map_gen_settings: mapGenSettings,
    generate_with_lab_tiles: settings.generate_with_lab_tiles.get(),
    ignore_surface_conditions: settings.ignore_surface_conditions.get(),
    has_global_electric_network: settings.has_global_electric_network.get(),
  }
}

export function defaultMapGenSettings(): PropertiesTable<MapGenSettingsForForm> {
  return createPropertiesTable(keys<MapGenSettingsForForm>(), {
    planet: nil,
    seed: tostring(game.default_map_gen_settings.seed),
    generate_with_lab_tiles: true,
    ignore_surface_conditions: true,
    has_global_electric_network: false,
  })
}

interface MapGenSettingsFormProps {
  settings: PropertiesTable<MapGenSettingsForForm>
}

@RegisterClass("gui:MapGenSettingsForm")
export class MapGenSettingsForm extends Component<MapGenSettingsFormProps> {
  private planets!: LuaSpaceLocationPrototype[]
  private settings!: PropertiesTable<MapGenSettingsForForm>

  override render({ settings }: MapGenSettingsFormProps): Element {
    this.planets = Object.values(prototypes.space_location).filter((p) => p.map_gen_settings != nil)
    this.settings = settings
    const planetNames: LocalisedString[] = this.planets
      .map((planet): LocalisedString => ["", `[planet=${planet.name}]`, planet.localised_name])
      .concat(["<None>" as LocalisedString])

    let initialPlanetLuaIndex = this.planets.findIndex((p) => p.name == settings.planet.get()) + 1
    if (initialPlanetLuaIndex == 0) {
      initialPlanetLuaIndex = planetNames.length
    }

    return (
      <flow direction="vertical">
        <flow direction="horizontal" styleMod={{ vertical_align: "center" }}>
          <checkbox state={settings.has_global_electric_network} caption={[L_Game.GlobalElectricNetwork]} />
        </flow>
        <flow direction="horizontal" styleMod={{ vertical_align: "center" }}>
          <checkbox state={settings.ignore_surface_conditions} caption={[L_Game.IgnoreSurfaceConditions]} />
        </flow>
        <flow direction="horizontal" styleMod={{ vertical_align: "center" }}>
          <checkbox state={settings.generate_with_lab_tiles} caption={[L_Game.GenerateWithLabTiles]} />
        </flow>
        {planetNames.length > 1 && (
          <flow direction="horizontal" styleMod={{ vertical_align: "center" }}>
            <label caption={[L_Game.Planet]} />
            <HorizontalPusher />
            <drop-down
              items={planetNames}
              selected_index={initialPlanetLuaIndex}
              styleMod={{ width: 150 }}
              on_gui_selection_state_changed={ibind(this.onPlanetChanged)}
            />
          </flow>
        )}
        <flow direction="horizontal" styleMod={{ vertical_align: "center" }}>
          <label caption={[L_GuiMapGenSettings.Seed]} tooltip={[L_GuiMapGenSettings.SeedTooltip]} />
          <HorizontalPusher />
          <textfield
            numeric={true}
            allow_decimal={false}
            allow_negative={false}
            lose_focus_on_confirm={true}
            text={settings.seed}
            styleMod={{ width: 150 }}
          />
        </flow>
      </flow>
    )
  }

  private onPlanetChanged(event: OnGuiSelectedTabChangedEvent) {
    const index = (event.element as DropDownGuiElement).selected_index - 1
    const planet: LuaSpaceLocationPrototype | nil = this.planets[index]
    this.settings.planet.set(planet?.name)
  }
}

interface Props {
  stage: Stage
}

const name = "bp100:MapGenSettingsSelect"
@RegisterClass("gui:MapGenSettingsSelect")
export class MapGenSettingsSelect extends Component<Props> {
  private stage!: Stage
  private element!: FrameGuiElement
  private settings!: PropertiesTable<MapGenSettingsForForm>

  render({ stage }: Props): Element {
    this.stage = stage

    const currentSettings = getCurrentValues(stage.project.surfaceSettings)

    this.settings = fromSurfaceSettings(currentSettings)

    return (
      <frame
        direction="vertical"
        onCreate={(element) => (this.element = element)}
        styleMod={{ width: 350 }}
        auto_center
      >
        <SimpleTitleBar title={[L_GuiMapGenSettings.Title]} />
        <frame style="inside_shallow_frame_with_padding">
          <MapGenSettingsForm settings={this.settings} />
        </frame>
        <flow style="dialog_buttons_horizontal_flow">
          <button style="back_button" caption={[L_Game.Cancel]} on_gui_click={funcRef(closeParentParent)} />
          <empty-widget
            style="draggable_space"
            styleMod={{ horizontally_stretchable: true }}
            onCreate={(e) => (e.drag_target = e.parent!.parent as FrameGuiElement)}
          />
          <button
            style="red_confirm_button"
            caption={[L_GuiMapGenSettings.ConfirmResetMapGenSettings]}
            on_gui_click={ibind(this.onConfirm)}
            tooltip={[L_GuiMapGenSettings.ConfirmResetMapGenSettingsTooltip]}
          />
        </flow>
      </frame>
    )
  }

  private onConfirm(): void {
    if (!(this.stage.valid && this.element.valid)) {
      this.close()
      return
    }

    const project = this.stage.project
    const values = formToSurfaceSettings(this.settings)
    setCurrentValuesOf(project.surfaceSettings, values, keys<SurfaceSettings>())
    applySurfaceSettingsAndClear(project)
    this.close()
  }

  private close() {
    destroy(this.element)
  }
}

export function openMapGenSettingsSelect(player: LuaPlayer, stage: Stage): void {
  renderNamed(<MapGenSettingsSelect stage={stage} />, player.gui.screen, name)
}
