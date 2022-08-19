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

import { assertNever, Func, funcOn2, RegisterClass } from "../../index"
import { ObservableList, ObservableListChange, Subscription } from "../../observable"
import { Component, destroy, destroyChildren, ElemProps, FactorioJsx, render, Spec, Tracker } from "../index"

export type ListProps<T, U extends GuiElementType> = {
  uses: U
  of: ObservableList<T>
  map: Func<(value: T) => Spec>
  ifEmpty?: Func<() => Spec>
} & ElemProps<U>
@RegisterClass("gui:List")
export class List<T, U extends GuiElementType> extends Component<ListProps<T, U>> {
  map!: Func<(value: T) => Spec>
  ifEmpty?: Func<() => Spec>

  element!: BaseGuiElement

  render(props: ListProps<T, U>, tracker: Tracker): Spec {
    this.map = props.map
    this.ifEmpty = props.ifEmpty
    tracker.onMount((element) => {
      this.element = element
      const { of, map, ifEmpty } = props
      if (of.length() === 0) {
        if (ifEmpty) {
          render(this.element, ifEmpty.invoke())
        }
      } else {
        for (const item of of.value()) {
          const result = render(this.element, map.invoke(item))
          if (!result) {
            //placeholder
            render(this.element, <empty-widget />)
          }
        }
      }
      of.subscribe(tracker.getSubscription(), funcOn2(this.onChange))
    })

    return <props.uses {...(props as any)} />
  }

  private add(value: T, index: number) {
    if (!render(this.element, this.map.invoke(value), index + 1)) {
      render(this.element, <empty-widget />, index + 1)
    }
  }
  private remove(index: number) {
    destroy(this.element.children[index])
  }

  onChange(subscription: Subscription, change?: ObservableListChange<T>): void {
    if (!change) return
    const { ifEmpty, element } = this
    if (!element.valid) {
      subscription.close()
      return
    }
    const array = change.list

    const changeType = change.type
    if (changeType === "add") {
      if (ifEmpty && array.length() === 1) {
        destroyChildren(element)
      }
      this.add(change.value, change.index)
    } else if (changeType === "remove") {
      this.remove(change.index)
      if (ifEmpty && array.length() === 0) {
        render(element, ifEmpty.invoke())
      }
    } else if (changeType === "set") {
      this.remove(change.index)
      this.add(change.value, change.index)
    } else if (changeType === "swap") {
      this.element.swap_children(change.indexA + 1, change.indexB + 1)
    } else {
      assertNever(changeType)
    }
  }
}
