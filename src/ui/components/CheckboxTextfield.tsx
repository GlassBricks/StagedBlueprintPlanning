/*
 * Copyright (c) 2023 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import {
  CheckboxGuiElement,
  LocalisedString,
  OnGuiCheckedStateChangedEvent,
  OnGuiTextChangedEvent,
  TextFieldGuiElement,
} from "factorio:runtime"
import { ibind, MutableProperty, RegisterClass } from "../../lib"
import { Component, Element, FactorioJsx } from "../../lib/factoriojsx"
import { getDefaultValueIfIsOverridenProp, highlightIfOverriden } from "../../utils/DiffedProperty"
import { MaybeRevertButton } from "../../utils/RevertButton"

export interface CheckboxTextfieldProps {
  captionBefore: LocalisedString
  captionAfter: LocalisedString
  tooltip?: LocalisedString

  value: MutableProperty<number | nil>
}
@RegisterClass("gui:CheckboxTextfield")
export class CheckboxTextfield extends Component<CheckboxTextfieldProps> {
  private checkbox!: CheckboxGuiElement
  private textfield!: TextFieldGuiElement
  private value!: MutableProperty<number | nil>

  override render(props: CheckboxTextfieldProps): Element {
    const { captionBefore, captionAfter, value } = props
    this.value = value

    const isTruthy = this.value.truthy()
    const highlightStyleMod = highlightIfOverriden(value)
    return (
      <flow
        direction="horizontal"
        styleMod={{
          vertical_align: "center",
        }}
      >
        <checkbox
          state={isTruthy}
          caption={captionBefore}
          styleMod={highlightStyleMod}
          on_gui_checked_state_changed={ibind(this.onCheckboxChanged)}
          onCreate={(e) => (this.checkbox = e)}
        />
        <textfield
          style="short_number_textfield"
          numeric
          clear_and_focus_on_right_click
          allow_decimal={false}
          allow_negative={false}
          text={this.value.map(ibind(this.valueToText))}
          enabled={isTruthy}
          on_gui_text_changed={ibind(this.onTextChanged)}
          onCreate={(e) => (this.textfield = e)}
          styleMod={{ width: 50 }}
        />
        <label caption={captionAfter} tooltip={props.tooltip} styleMod={highlightStyleMod} />
        {MaybeRevertButton(value)}
      </flow>
    )
  }

  private valueToText(value: number | nil) {
    if (value == nil) return ""
    return tostring(value)
  }

  private onCheckboxChanged(e: OnGuiCheckedStateChangedEvent) {
    const newState = (e.element as CheckboxGuiElement).state
    if (newState) {
      this.value.set(getDefaultValueIfIsOverridenProp(this.value) ?? 1)
    } else {
      this.value.set(nil)
    }
  }

  private onTextChanged(e: OnGuiTextChangedEvent) {
    const number = tonumber(e.text)
    if (number == nil) return // ignore invalid input
    this.value.set(number)
  }
}
