/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { Func, ibind, RegisterClass } from "../../index"
import { Property } from "../../event"
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
