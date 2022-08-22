/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of BBPP3.
 *
 * BBPP3 is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * BBPP3 is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with BBPP3. If not, see <https://www.gnu.org/licenses/>.
 */

import { Func, funcOn, RegisterClass } from "../../index"
import { State, Subscription } from "../../observable"
import { Component, destroyChildren, ElemProps, FactorioJsx, renderMultiple, Spec, Tracker } from "../index"

export type FuncProps<T, U extends GuiElementType> = {
  uses: U
  from: State<T>
  map: Func<(value: T) => Spec>
} & ElemProps<U>

@RegisterClass("gui:Fn")
export class Fn<T, U extends GuiElementType> extends Component<FuncProps<T, U>> {
  map!: Func<(value: T) => Spec>

  element!: LuaGuiElement

  render(props: FuncProps<T, U>, tracker: Tracker): Spec {
    const { from, map } = props
    this.map = map
    tracker.onMount((element) => {
      this.element = element
      from.subscribeAndFire(tracker.getSubscription(), funcOn(this.onChange))
    })

    return <props.uses {...(props as any)} />
  }

  onChange(_: Subscription, value: T): void {
    const spec = this.map.invoke(value)
    destroyChildren(this.element)
    renderMultiple(spec, this.element)
  }
}