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

// this could maybe be moved to shared lib in the future

import { Func, funcOn, RegisterClass } from "../../index"
import { State, Subscription } from "../../observable"
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

  onChange(_: Subscription, value: boolean): void {
    destroyChildren(this.element)
    const spec = value ? this.then.invoke() : this.else && this.else.invoke()
    if (spec) {
      renderMultiple(spec, this.element)
    }
  }
}
