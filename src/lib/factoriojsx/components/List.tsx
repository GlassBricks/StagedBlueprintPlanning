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

import { assertNever, Func, ibind, RegisterClass } from "../../index"
import { ObservableList, ObservableListChange } from "../../observable"
import { Component, destroy, destroyChildren, ElemProps, FactorioJsx, render, RenderContext, Spec } from "../index"

export type ListProps<T extends AnyNotNil, U extends GuiElementType> = {
  uses: U
  of: ObservableList<T>
  map: Func<(value: T) => Spec>
  ifEmpty?: Func<() => Spec>
} & ElemProps<U>
@RegisterClass("gui:List")
export class List<T extends AnyNotNil, U extends GuiElementType> extends Component<ListProps<T, U>> {
  map!: Func<(value: T) => Spec>
  ifEmpty?: Func<() => Spec>

  element!: BaseGuiElement

  render(props: ListProps<T, U>, context: RenderContext): Spec {
    this.map = props.map
    this.ifEmpty = props.ifEmpty
    context.onMount((element) => {
      this.element = element
      const { of, map, ifEmpty } = props
      if (of.length() == 0) {
        if (ifEmpty) {
          render(ifEmpty.invoke(), this.element)
        }
      } else {
        for (const item of of.value()) {
          const result = render(map.invoke(item), this.element)
          if (!result) {
            //placeholder
            render(<empty-widget />, this.element)
          }
        }
      }
      of.subscribe(context.getSubscription(), ibind(this.onChange))
    })

    return <props.uses {...(props as any)} />
  }

  private add(value: T, index: number) {
    if (!render(this.map.invoke(value), this.element, index + 1)) {
      render(<empty-widget />, this.element, index + 1)
    }
  }
  private remove(index: number) {
    destroy(this.element.children[index])
  }

  onChange(change: ObservableListChange<T>): void {
    const { ifEmpty, element } = this
    const array = change.list

    const changeType = change.type
    if (changeType == "add") {
      if (ifEmpty && array.length() == 1) {
        destroyChildren(element)
      }
      this.add(change.value, change.index)
    } else if (changeType == "remove") {
      this.remove(change.index)
      if (ifEmpty && array.length() == 0) {
        render(ifEmpty.invoke(), element)
      }
    } else if (changeType == "set") {
      this.remove(change.index)
      this.add(change.value, change.index)
    } else if (changeType == "swap") {
      this.element.swap_children(change.indexA + 1, change.indexB + 1)
    } else {
      assertNever(changeType)
    }
  }
}
