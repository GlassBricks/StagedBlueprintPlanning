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

interface BaseCheckboxTextfieldProps {
  captionBefore: LocalisedString
  captionAfter: LocalisedString
  tooltip?: LocalisedString
  textfieldWidth?: number
}

export interface NumericCheckboxTextfieldProps extends BaseCheckboxTextfieldProps {
  value: MutableProperty<number | nil>
  numeric: true
}

export interface StringCheckboxTextfieldProps extends BaseCheckboxTextfieldProps {
  value: MutableProperty<string | nil>
  numeric?: false
}

export type CheckboxTextfieldProps = NumericCheckboxTextfieldProps | StringCheckboxTextfieldProps

@RegisterClass("gui:CheckboxTextfield")
export class CheckboxTextfield extends Component<CheckboxTextfieldProps> {
  private value!: MutableProperty<number | string | nil>
  private isNumeric!: boolean

  override render(props: CheckboxTextfieldProps): Element {
    const { captionBefore, captionAfter, value } = props
    this.value = value
    this.isNumeric = props.numeric ?? false

    const isEnabled = this.isNumeric ? this.value.truthy() : this.value.map(ibind(this.isNotNil))
    const highlightStyleMod = highlightIfOverriden(value)
    const textfieldWidth = props.textfieldWidth ?? (this.isNumeric ? 50 : 150)
    return (
      <flow
        direction="horizontal"
        styleMod={{
          vertical_align: "center",
        }}
      >
        <checkbox
          state={isEnabled}
          caption={captionBefore}
          styleMod={highlightStyleMod}
          on_gui_checked_state_changed={ibind(this.onCheckboxChanged)}
        />
        <textfield
          style={this.isNumeric ? "short_number_textfield" : "stretchable_textfield"}
          numeric={this.isNumeric}
          allow_decimal={false}
          allow_negative={false}
          text={this.value.map(ibind(this.valueToText))}
          enabled={isEnabled}
          on_gui_text_changed={ibind(this.onTextChanged)}
          styleMod={{ width: textfieldWidth }}
          lose_focus_on_confirm
          icon_selector={!this.isNumeric}
        />
        <label caption={captionAfter} tooltip={props.tooltip} styleMod={highlightStyleMod} />
        {MaybeRevertButton(value)}
      </flow>
    )
  }

  private isNotNil(value: unknown) {
    return value != nil
  }

  private valueToText(value: number | string | nil) {
    if (value == nil) return ""
    return tostring(value)
  }

  private onCheckboxChanged(e: OnGuiCheckedStateChangedEvent) {
    const newState = (e.element as CheckboxGuiElement).state
    if (!newState) {
      this.value.set(nil)
    } else {
      const defaultValue = getDefaultValueIfIsOverridenProp(this.value)
      if (this.isNumeric) {
        this.value.set(defaultValue ?? 1)
      } else {
        this.value.set(defaultValue ?? "")
      }
    }
  }

  private onTextChanged(e: OnGuiTextChangedEvent) {
    const value = this.isNumeric ? tonumber(e.text) : e.text
    this.value.set(value)
  }
}
