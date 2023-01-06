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

import { _numObservers, MutableProperty, property, Props } from "../../event"
import expect, { mock } from "tstl-expect"

describe("property", () => {
  let s: MutableProperty<string>
  before_each(() => {
    s = property("begin")
  })

  it("can be constructed with initial value", () => {
    expect(s.get()).to.be("begin")
  })

  it("can be set", () => {
    s.set("end")
    expect(s.get()).to.be("end")
  })

  test("subscribeAndFire", () => {
    const fn = mock.fn()
    s._subscribeIndependentlyAndRaise({ invoke: fn })
    expect(fn).calledTimes(1)
    expect(fn).calledWith("begin", nil)
  })

  it("notifies subscribers of value when value changed", () => {
    const fn = mock.fn()
    s._subscribeIndependently({ invoke: fn })
    s.set("end")
    expect(fn).calledWith("end", "begin")
  })

  test("truthy", () => {
    const val = property(false)
    const res = val.truthy()

    const fn = mock.fn()
    res._subscribeIndependentlyAndRaise({ invoke: fn })
    expect(fn).calledTimes(1)
    expect(fn).calledWith(false, nil)
    val.set(true)
    expect(fn).calledTimes(2)
    expect(fn).calledWith(true, false)
  })
})

describe("State utils", () => {
  test("setValueFn", () => {
    const s = property("begin")
    const fn = Props.setValueFn(s, "end")
    expect(s.get()).to.be("begin")
    fn.invoke()
    expect(s.get()).to.be("end")
  })

  test("toggleFn", () => {
    const s = property(false)
    const fn = Props.toggleFn(s)
    expect(s.get()).to.be(false)
    fn.invoke()
    expect(s.get()).to.be(true)
    fn.invoke()
    expect(s.get()).to.be(false)
  })
})

describe("map", () => {
  test("maps correct values to observers", () => {
    const val = property(3)
    const mapped = val.map({ invoke: (x) => x * 2 })
    const fn = mock.fn()
    mapped._subscribeIndependentlyAndRaise({ invoke: fn })

    expect(fn).calledTimes(1)
    expect(fn).calledWith(6, nil)

    val.set(4)

    expect(fn).calledTimes(2)
    expect(fn).calledWith(8, 6)
  })

  test("gives correct value for get()", () => {
    const val = property(3)
    const mapped = val.map({ invoke: (x) => x * 2 })
    expect(mapped.get()).to.equal(6)
  })
})

describe("flatMap", () => {
  test("maps non-state values", () => {
    const val = property(3)
    const mapped = val.flatMap({ invoke: (x) => x * 2 })
    const fn = mock.fn()
    mapped._subscribeIndependentlyAndRaise({ invoke: fn })

    expect(fn).calledTimes(1)
    expect(fn).calledWith(6, nil)

    val.set(4)

    expect(fn).calledTimes(2)
    expect(fn).calledWith(8, 6)
  })

  test("maps state values", () => {
    const val = property(3)
    const mapped = val.flatMap({ invoke: (x) => property(x * 2) })
    const fn = mock.fn()
    mapped._subscribeIndependentlyAndRaise({ invoke: fn })

    expect(fn).calledTimes(1)
    expect(fn).calledWith(6, nil)

    val.set(4)

    expect(fn).calledTimes(2)
    expect(fn).calledWith(8, 6)
  })

  test("listens to inner state and unsubscribes", () => {
    const val = property(1)
    const innerVal = property(4)
    const mapped = val.flatMap({ invoke: (x) => (x == 1 ? innerVal : x) })

    const fn = mock.fn()
    mapped._subscribeIndependentlyAndRaise({ invoke: fn })

    expect(fn).calledTimes(1)
    expect(fn).calledWith(4, nil)

    innerVal.set(5)
    expect(fn).calledTimes(2)
    expect(fn).calledWith(5, 4)

    val.set(2)

    expect(fn).calledTimes(3)
    expect(fn).calledWith(2, 5)
    expect(_numObservers(innerVal)).to.be(0)

    val.set(1)

    expect(fn).calledTimes(4)
    expect(fn).calledWith(5, 2)
  })

  test("gives correct value for get()", () => {
    const val = property(3)
    const mapped = val.flatMap({ invoke: (x) => property(x * 2) })
    expect(mapped.get()).to.equal(6)

    val.set(4)

    expect(mapped.get()).to.equal(8)
  })
})
