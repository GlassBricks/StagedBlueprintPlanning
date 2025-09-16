// Copyright (c) 2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
  CheckboxGuiElement,
  LocalisedString,
  OnGuiCheckedStateChangedEvent,
  OnGuiTextChangedEvent,
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
        />
        <textfield
          style="short_number_textfield"
          numeric={true}
          allow_decimal={false}
          allow_negative={false}
          text={this.value.map(ibind(this.valueToText))}
          enabled={isTruthy}
          on_gui_text_changed={ibind(this.onTextChanged)}
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
