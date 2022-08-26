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

import { FactorioJsx } from "../../../factoriojsx"
import { If } from "../../../factoriojsx/components/If"
import { MutableState, state } from "../../../observable"
import { ElementWrapper, testRender } from "../../gui"

let condition: MutableState<boolean>

before_each(() => {
  condition = state(true)
})

function findAllLabels(root: ElementWrapper): LocalisedString[] {
  return root.findAllSatisfying((x) => x.type === "label").map((x) => x.native.caption)
}
test("single then", () => {
  const component = testRender(<If condition={condition} then={{ invoke: () => <label caption="true" /> }} />)
  assert.same(["true"], findAllLabels(component))

  condition.set(false)
  assert.same([], findAllLabels(component))
})

test("then and else", () => {
  const component = testRender(
    <If
      condition={condition}
      then={{ invoke: () => <label caption="true" /> }}
      else={{ invoke: () => <label caption="false" /> }}
    />,
  )
  assert.same(["true"], findAllLabels(component))

  condition.set(false)
  assert.same(["false"], findAllLabels(component))

  condition.set(true)
  assert.same(["true"], findAllLabels(component))
})
