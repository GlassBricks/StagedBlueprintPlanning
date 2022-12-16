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

import { MutableState, State, state } from "../../observable"
import expect, { mock } from "tstl-expect"

describe("state", () => {
  let s: MutableState<string>
  before_each(() => {
    s = state("begin")
  })

  it("can be constructed with initial value", () => {
    expect("begin").to.be(s.get())
  })

  it("can be set", () => {
    s.set("end")
    expect("end").to.be(s.get())
  })

  test("subscribeAndFire", () => {
    const fn = mock.fn()
    s.subscribeIndependentlyAndFire({ invoke: fn })
    expect(fn).calledTimes(1)
    expect(fn).calledWith(expect._, "begin", nil)
  })

  it("notifies subscribers of value when value changed", () => {
    const fn = mock.fn()
    s.subscribeIndependently({ invoke: fn })
    s.set("end")
    expect(fn).calledWith(expect._, "end", "begin")
  })

  test("setValueFn", () => {
    const fn = s.setValueFn("end")
    expect("begin").to.be(s.get())
    fn.invoke()
    expect("end").to.be(s.get())
  })
})

describe("map", () => {
  test("maps correct values to observers", () => {
    const val = state(3)
    const mapped = val.map({ invoke: (x) => x * 2 })
    const fn = mock.fn()
    mapped.subscribeIndependentlyAndFire({ invoke: fn })

    expect(fn).calledTimes(1)
    expect(fn).calledWith(expect._, 6, nil)

    val.set(4)

    expect(fn).calledTimes(2)
    expect(fn).calledWith(expect._, 8, 6)
  })

  test("gives correct value for get()", () => {
    const val = state(3)
    const mapped = val.map({ invoke: (x) => x * 2 })
    expect(mapped.get()).to.equal(6)
  })

  test("choice", () => {
    const val = state(false)
    const choice = val.switch("yes", "no")

    const fn = mock.fn()
    choice.subscribeIndependentlyAndFire({ invoke: fn })
    expect(fn).calledTimes(1)
    expect(fn).calledWith(expect._, "no", nil)
    val.set(true)
    expect(fn).calledTimes(2)
    expect(fn).calledWith(expect._, "yes", "no")
  })
})

describe("flatMap", () => {
  test("maps non-state values", () => {
    const val = state(3)
    const mapped = val.flatMap({ invoke: (x) => x * 2 })
    const fn = mock.fn()
    mapped.subscribeIndependentlyAndFire({ invoke: fn })

    expect(fn).calledTimes(1)
    expect(fn).calledWith(expect._, 6, nil)

    val.set(4)

    expect(fn).calledTimes(2)
    expect(fn).calledWith(expect._, 8, 6)
  })

  test("maps state values", () => {
    const val = state(3)
    const mapped = val.flatMap({ invoke: (x) => state(x * 2) })
    const fn = mock.fn()
    mapped.subscribeIndependentlyAndFire({ invoke: fn })

    expect(fn).calledTimes(1)
    expect(fn).calledWith(expect._, 6, nil)

    val.set(4)

    expect(fn).calledTimes(2)
    expect(fn).calledWith(expect._, 8, 6)
  })

  test("listens to inner state and unsubscribes", () => {
    const val = state(1)
    const innerVal = state(4)
    const mapped = val.flatMap({ invoke: (x) => (x == 1 ? innerVal : x) })

    const fn = mock.fn()
    mapped.subscribeIndependentlyAndFire({ invoke: fn })

    expect(fn).calledTimes(1)
    expect(fn).calledWith(expect._, 4, nil)

    innerVal.set(5)
    expect(fn).calledTimes(2)
    expect(fn).calledWith(expect._, 5, 4)

    val.set(2)

    expect(fn).calledTimes(3)
    expect(fn).calledWith(expect._, 2, 5)
    expect(State._numObservers(innerVal)).to.be(0)

    val.set(1)

    expect(fn).calledTimes(4)
    expect(fn).calledWith(expect._, 5, 2)
  })

  test("gives correct value for get()", () => {
    const val = state(3)
    const mapped = val.flatMap({ invoke: (x) => state(x * 2) })
    expect(mapped.get()).to.equal(6)

    val.set(4)

    expect(mapped.get()).to.equal(8)
  })
})
