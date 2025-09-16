// Copyright (c) 2022 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { GuiElementType, LuaGuiElement } from "factorio:runtime"
import { Property } from "../../event"
import { Func, ibind, RegisterClass } from "../../index"
import { Component, destroyChildren, Element, ElemProps, FactorioJsx, RenderContext, renderMultiple } from "../index"

export type FuncProps<T, U extends GuiElementType> = {
  uses: U
  from: Property<T>
  map: Func<(value: T) => Element | false | nil>
} & ElemProps<U>

@RegisterClass("gui:Fn")
export class Fn<T, U extends GuiElementType> extends Component<FuncProps<T, U>> {
  map!: Func<(value: T) => Element | false | nil>

  element!: LuaGuiElement

  render(props: FuncProps<T, U>, context: RenderContext): Element {
    const { from, map } = props
    this.map = map
    context.onMount((element) => {
      this.element = element
      from.subscribeAndRaise(context.getSubscription(), ibind(this.onChange))
    })

    return <props.uses {...(props as any)} />
  }

  onChange(value: T): void {
    const spec = this.map.invoke(value)
    destroyChildren(this.element)
    if (spec) renderMultiple(spec, this.element)
  }
}
