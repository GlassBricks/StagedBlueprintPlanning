/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of 100% Blueprint Planning.
 *
 * 100% Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * 100% Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with 100% Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

// this could maybe be moved to shared lib in the future

import { Func, funcOn, RegisterClass } from "../../index"
import { State } from "../../observable"
import { Component, destroyChildren, ElemProps, FactorioJsx, renderMultiple, Spec, Tracker } from "../index"

export type IfProps = {
  condition: State<boolean>
  then: Func<() => Spec | undefined>
  else?: Func<() => Spec | undefined>
} & ElemProps<"flow">

@RegisterClass("gui:If")
export class If extends Component<IfProps> {
  then!: Func<() => Spec | undefined>
  else?: Func<() => Spec | undefined>
  element!: FlowGuiElementMembers

  render(props: IfProps, tracker: Tracker): Spec {
    this.then = props.then
    this.else = props.else
    return (
      <flow
        {...props}
        onCreate={(element) => {
          this.element = element
          props.condition.subscribeAndFire(tracker.getSubscription(), funcOn(this.onChange))
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
