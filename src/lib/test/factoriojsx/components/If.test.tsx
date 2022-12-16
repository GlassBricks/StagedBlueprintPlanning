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

import { FactorioJsx } from "../../../factoriojsx"
import { If } from "../../../factoriojsx/components"
import { MutableState, state } from "../../../observable"
import { ElementWrapper, testRender } from "../../gui"
import expect from "tstl-expect"

let condition: MutableState<boolean>

before_each(() => {
  condition = state(true)
})

function findAllLabels(root: ElementWrapper): LocalisedString[] {
  return root.findAllSatisfying((x) => x.type == "label").map((x) => x.native.caption)
}
test("single then", () => {
  const component = testRender(<If condition={condition} then={{ invoke: () => <label caption="true" /> }} />)
  expect(findAllLabels(component)).to.equal(["true"])

  condition.set(false)
  expect(findAllLabels(component)).to.equal([])
})

test("then and else", () => {
  const component = testRender(
    <If
      condition={condition}
      then={{ invoke: () => <label caption="true" /> }}
      else={{ invoke: () => <label caption="false" /> }}
    />,
  )
  expect(findAllLabels(component)).to.equal(["true"])

  condition.set(false)
  expect(findAllLabels(component)).to.equal(["false"])

  condition.set(true)
  expect(findAllLabels(component)).to.equal(["true"])
})
