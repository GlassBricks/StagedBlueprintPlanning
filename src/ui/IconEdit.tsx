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

import { ChooseElemButtonGuiElement, OnGuiClickEvent } from "factorio:runtime"
import { BlueprintSettingsTable } from "../blueprints/blueprint-settings"
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
            {([1, 2, 3, 4] as const).map((i) => {
              const iconValue = settings[i]
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
      const setting = this.settings[index as 1 | 2 | 3 | 4]
      if (setting instanceof DiffedProperty) {
        setting.overrideValue.set(nil)
      }
    }
  }
}
