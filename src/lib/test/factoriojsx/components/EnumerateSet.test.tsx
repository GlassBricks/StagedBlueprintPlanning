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

import { FactorioJsx, Spec } from "../../../factoriojsx"
import { EnumerateSet } from "../../../factoriojsx/components"
import { MutableObservableSet, observableSet } from "../../../observable"
import { ElementWrapper, testRender } from "../../gui"
import expect from "tstl-expect"

function presentElements(wrapper: ElementWrapper) {
  return wrapper.findAll("label").map((x) => x.element.caption)
}
let set: MutableObservableSet<string>
let spec: Spec
before_each(() => {
  set = observableSet()
  spec = <EnumerateSet uses="flow" of={set} map={{ invoke: (v) => <label caption={v} /> }} />
})

it("starts empty with no elements", () => {
  const wrapper = testRender(spec)
  expect(presentElements(wrapper)).to.equal([])
})

it("creates with initial contents", () => {
  set.add("a")
  set.add("b")
  const wrapper = testRender(spec)
  expect(presentElements(wrapper)).to.equal(["a", "b"])
})

it("adds elements", () => {
  const wrapper = testRender(spec)
  set.add("a")
  set.add("b")
  expect(wrapper.findAll("label").map((x) => x.element.caption)).to.equal(["a", "b"])
})

it("removes elements", () => {
  const wrapper = testRender(spec)
  set.add("a")
  set.add("b")
  set.delete("a")
  expect(presentElements(wrapper)).to.equal(["b"])
})

describe("ifEmpty", () => {
  let set: MutableObservableSet<string>
  let spec: Spec
  before_each(() => {
    set = observableSet()
    spec = (
      <EnumerateSet
        uses="flow"
        of={set}
        map={{
          invoke: (v) => <label caption={v} />,
        }}
        ifEmpty={{ invoke: () => <label caption="empty" /> }}
      />
    )
  })

  test("is present if empty", () => {
    const wrapper = testRender(
      <EnumerateSet
        uses="flow"
        of={set}
        map={{
          invoke: (v) => <label caption={v} />,
        }}
        ifEmpty={{
          invoke: () => <label caption="empty" />,
        }}
      />,
    )
    expect(presentElements(wrapper)).to.equal(["empty"])
  })

  test("is not present if not empty", () => {
    set.add("a")
    const wrapper = testRender(spec)
    expect(presentElements(wrapper)).to.equal(["a"])
  })

  test("is present if made empty", () => {
    set.add("a")
    const wrapper = testRender(spec)
    set.delete("a")
    expect(presentElements(wrapper)).to.equal(["empty"])
  })

  test("is not present if made non-empty", () => {
    const wrapper = testRender(spec)
    set.add("a")
    expect(presentElements(wrapper)).to.equal(["a"])
  })
})
