// Copyright (c) 2022 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

// this could maybe be moved to shared lib in the future

import { FlowGuiElementMembers } from "factorio:runtime"
import { Property } from "../../event"
import { Func, ibind, RegisterClass } from "../../index"
import { Component, destroyChildren, Element, ElemProps, FactorioJsx, RenderContext, renderMultiple } from "../index"

export type IfProps = {
  condition: Property<boolean>
  then: Func<() => Element | nil>
  else?: Func<() => Element | nil>
} & ElemProps<"flow">

@RegisterClass("gui:If")
export class If extends Component<IfProps> {
  then!: Func<() => Element | nil>
  else?: Func<() => Element | nil>
  element!: FlowGuiElementMembers

  render(props: IfProps, context: RenderContext): Element {
    this.then = props.then
    this.else = props.else
    return (
      <flow
        {...props}
        onCreate={(element) => {
          this.element = element
          props.condition.subscribeAndRaise(context.getSubscription(), ibind(this.onChange))
        }}
      />
    )
  }

  onChange(value: boolean): void {
    destroyChildren(this.element)
    const spec = value ? this.then.invoke() : this.else && this.else.invoke()
    if (spec) {
      renderMultiple(spec, this.element)
    }
  }
}
