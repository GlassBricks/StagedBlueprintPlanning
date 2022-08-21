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
import { ObservableSet, ObservableSetChange, Subscription } from "../../observable"
import { Component, destroy, destroyChildren, ElemProps, FactorioJsx, render, Spec, Tracker } from "../index"

export type EnumerateSetProps<T, U extends GuiElementType> = {
  uses: U
  of: ObservableSet<T>
  map: Func<(value: T) => Spec>
  ifEmpty?: Func<() => Spec>
} & ElemProps<U>

@RegisterClass("gui:EnumerateSet")
export class EnumerateSet<T, U extends GuiElementType> extends Component<EnumerateSetProps<T, U>> {
  set!: ObservableSet<T>
  map!: Func<(value: T) => Spec>
  ifEmpty?: Func<() => Spec>
  render(props: EnumerateSetProps<T, U>, tracker: Tracker): Spec {
    this.set = props.of
    this.map = props.map
    this.ifEmpty = props.ifEmpty

    tracker.onMount((element) => {
      this.element = element
      const { set, map, ifEmpty } = this
      if (set.size() === 0) {
        if (ifEmpty) {
          render(ifEmpty.invoke(), this.element)
        }
      } else {
        const { associated } = this
        for (const item of set) {
          const result = render(map.invoke(item), this.element)
          if (result) {
            associated.set(item, result)
          }
        }
      }
      set.subscribe(tracker.getSubscription(), funcOn(this.onChange))
    })
    return <props.uses {...(props as any)} />
  }

  element!: BaseGuiElement
  associated = new LuaMap<T, BaseGuiElement>()

  onChange(subscription: Subscription, change: ObservableSetChange<T> | nil): void {
    if (!change) return
    const { map, ifEmpty, associated, element } = this
    if (!element.valid) {
      subscription.close()
      return
    }
    const { value, added } = change
    if (added) {
      if (ifEmpty && change.set.size() === 1) {
        destroyChildren(element)
      }
      const result = render(map.invoke(value), element)
      if (result) {
        associated.set(value, result)
      }
    } else {
      const item = associated.get(value)
      destroy(item)
      if (ifEmpty && change.set.size() === 0) {
        render(ifEmpty.invoke(), element)
      }
    }
  }
}
