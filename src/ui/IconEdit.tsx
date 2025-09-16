// Copyright (c) 2024 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { ChooseElemButtonGuiElement, OnGuiClickEvent } from "factorio:runtime"
import { BlueprintSettingsTable, IconNumber, iconNumbers } from "../blueprints/blueprint-settings"
import { ibind, RegisterClass } from "../lib"
import { Component, Element, FactorioJsx } from "../lib/factoriojsx"
import { HorizontalSpacer } from "../lib/factoriojsx/components"
import { L_GuiProjectSettings } from "../locale"
import { DiffedProperty, highlightIfOverriden } from "../utils/DiffedProperty"
import { MaybeRevertButton } from "../utils/RevertButton"

export interface IconsEditProps {
  settings: BlueprintSettingsTable
}

@RegisterClass("gui:IconsEdit")
export class IconsEdit extends Component<IconsEditProps> {
  private settings!: BlueprintSettingsTable
  override render({ settings }: IconsEditProps): Element {
    this.settings = settings
    return (
      <flow direction="vertical">
        <flow styleMod={{ vertical_align: "center" }}>
          <label caption={[L_GuiProjectSettings.Icons]} tooltip={[L_GuiProjectSettings.IconsTooltip]} />
          <HorizontalSpacer width={10} />
          <frame style="slot_button_deep_frame">
            {iconNumbers.map((i) => {
              const iconValue = settings[`icon${i}`]
              return (
                <choose-elem-button
                  styleMod={{}}
                  style={
                    (iconValue instanceof DiffedProperty
                      ? iconValue.isOverridden().select("slot_sized_button_green", "slot_button")
                      : "slot_button") as any
                  }
                  elem_type="signal"
                  elem_value={iconValue}
                  tags={{ index: i }}
                  on_gui_click={ibind(this.revertOverride)}
                />
              )
            })}
          </frame>
        </flow>
        <flow styleMod={{ vertical_align: "center" }}>
          <checkbox
            state={settings.appendStageNumbersToIcons}
            caption={[L_GuiProjectSettings.AppendNumbersFromStage]}
            tooltip={[L_GuiProjectSettings.AppendNumbersFromStageTooltip]}
            styleMod={highlightIfOverriden(settings.appendStageNumbersToIcons)}
          />
          {MaybeRevertButton(settings.appendStageNumbersToIcons)}
        </flow>
      </flow>
    )
  }
  private revertOverride(event: OnGuiClickEvent): void {
    if (!event.control || event.button != defines.mouse_button_type.right) return
    const element = event.element as ChooseElemButtonGuiElement
    const index: unknown = element.tags?.index
    if (index && typeof index == "number" && index >= 1 && index <= 4) {
      const setting = this.settings[`icon${index as IconNumber}`]
      if (setting instanceof DiffedProperty) {
        setting.overrideValue.set(nil)
      }
    }
  }
}
