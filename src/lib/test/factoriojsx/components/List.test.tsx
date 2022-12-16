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
import { List } from "../../../factoriojsx/components"
import { MutableObservableList, observableList } from "../../../observable"
import { ElementWrapper, testRender } from "../../gui"
import expect from "tstl-expect"

function presentElements(wrapper: ElementWrapper) {
  return wrapper.findAll("label").map((x) => x.native.caption)
}
let array: MutableObservableList<string>
let spec: Spec
before_each(() => {
  array = observableList()
  spec = (
    <List
      uses="flow"
      of={array}
      map={{
        invoke: (v) => <label caption={v} />,
      }}
    />
  )
})

it("starts empty with no elements", () => {
  const wrapper = testRender(spec)
  expect(presentElements(wrapper)).to.equal([])
})

it("creates with initial contents", () => {
  array.push("a")
  array.push("b")
  const wrapper = testRender(spec)
  expect(presentElements(wrapper)).to.equal(["a", "b"])
})

it("adds elements", () => {
  const wrapper = testRender(spec)
  array.push("a")
  array.push("b")
  expect(wrapper.findAll("label").map((x) => x.native.caption)).to.equal(["a", "b"])
})

it("inserts elements", () => {
  const wrapper = testRender(spec)
  array.push("a")
  array.push("b")
  array.insert(1, "c")
  expect(wrapper.findAll("label").map((x) => x.native.caption)).to.equal(["a", "c", "b"])
})

it("removes elements", () => {
  const wrapper = testRender(spec)
  array.push("a")
  array.push("b")
  array.remove(0)
  expect(presentElements(wrapper)).to.equal(["b"])
})

it("swaps elements", () => {
  const wrapper = testRender(spec)
  array.push("a")
  array.push("b")
  array.swap(0, 1)
  expect(wrapper.findAll("label").map((x) => x.native.caption)).to.equal(["b", "a"])
})

it("changes elements", () => {
  const wrapper = testRender(spec)
  array.push("a")
  array.push("b")
  array.set(0, "c")
  expect(wrapper.findAll("label").map((x) => x.native.caption)).to.equal(["c", "b"])
})

describe("ifEmpty", () => {
  let array: MutableObservableList<string>
  let spec: Spec
  before_each(() => {
    array = observableList()
    spec = (
      <List
        uses="flow"
        of={array}
        map={{
          invoke: (v) => <label caption={v} />,
        }}
        ifEmpty={{ invoke: () => <label caption="empty" /> }}
      />
    )
  })

  it("is present if empty", () => {
    const wrapper = testRender(spec)
    expect(presentElements(wrapper)).to.equal(["empty"])
  })

  it("is not present if not empty", () => {
    array.push("a")
    const wrapper = testRender(spec)
    expect(presentElements(wrapper)).to.equal(["a"])
  })

  it("is present if made empty", () => {
    array.push("a")
    const wrapper = testRender(spec)
    array.remove(0)
    expect(presentElements(wrapper)).to.equal(["empty"])
  })

  it("is not present if made non-empty", () => {
    const wrapper = testRender(spec)
    array.push("a")
    expect(presentElements(wrapper)).to.equal(["a"])
  })
})
