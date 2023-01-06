import { Component, Element, FactorioJsx, RenderContext } from "../../lib/factoriojsx"
import { ibind, MutableProperty, RegisterClass } from "../../lib"
import { getDefaultValueIfIsOverridenProp, highlightIfOverriden } from "../../utils/DiffedProperty"

export interface CheckboxTextfieldProps {
  captionBefore: LocalisedString
  captionAfter: LocalisedString

  value: MutableProperty<number | false>
}
@RegisterClass("gui:CheckboxTextfield")
export class CheckboxTextfield extends Component<CheckboxTextfieldProps> {
  private checkbox!: CheckboxGuiElement
  private textfield!: TextFieldGuiElement
  private value!: MutableProperty<number | false>

  override render(props: CheckboxTextfieldProps, context: RenderContext): Element {
    const { captionBefore, captionAfter, value } = props
    this.value = value

    const isTruthy = this.value.truthy()
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
          styleMod={highlightIfOverriden(value)}
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
        <label caption={captionAfter} styleMod={highlightIfOverriden(value)} />
      </flow>
    )
  }

  private valueToText(value: number | false) {
    if (value == false) return ""
    return tostring(value)
  }

  private onCheckboxChanged(e: OnGuiCheckedStateChangedEvent) {
    const newState = (e.element as CheckboxGuiElement).state
    if (newState) {
      this.value.set(getDefaultValueIfIsOverridenProp(this.value) ?? 1)
    } else {
      this.value.set(false)
    }
  }

  private onTextChanged(e: OnGuiTextChangedEvent) {
    const number = tonumber(e.text)
    if (number == nil) return // ignore invalid input
    this.value.set(number)
  }
}
