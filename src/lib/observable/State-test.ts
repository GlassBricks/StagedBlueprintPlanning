import { asFunc } from "../test-util/func"
import { MutableState, state } from "./State"

function spy() {
  return globalThis.spy<any>()
}

describe("state", () => {
  let s: MutableState<string>
  before_each(() => {
    s = state("begin")
  })

  it("can be constructed with initial value", () => {
    assert.equal(s.get(), "begin")
  })

  it("can be set", () => {
    s.set("end")
    assert.equal(s.get(), "end")
  })

  test("subscribeAndFire", () => {
    const fn = spy()
    s.subscribeIndependentlyAndFire(fn)
    assert.spy(fn).called(1)
    assert.spy(fn).called_with(match._, match._, "begin", undefined)
  })

  it("notifies subscribers of value when value changed", () => {
    const fn = spy()
    s.subscribeIndependently(fn)
    s.set("end")
    assert.spy(fn).called_with(match._, match._, "end", "begin")
  })

  test("setValueFn", () => {
    const fn = s.setValueFn("end")
    assert.equal(s.get(), "begin")
    fn()
    assert.equal(s.get(), "end")
  })
})

describe("map", () => {
  test("maps correct values to observers", () => {
    const val = state(3)
    const mapped = val.map(asFunc((x) => x * 2))
    const fn = spy()
    mapped.subscribeIndependentlyAndFire(fn)

    assert.spy(fn).called(1)
    assert.spy(fn).called_with(match._, match._, 6, undefined)

    val.set(4)

    assert.spy(fn).called(2)
    assert.spy(fn).called_with(match._, match._, 8, 6)
  })

  test("gives correct value for get()", () => {
    const val = state(3)
    const mapped = val.map(asFunc((x) => x * 2))
    assert.same(6, mapped.get())
  })

  test("choice", () => {
    const val = state(false)
    const choice = val.switch("yes", "no")

    const fn = spy()
    choice.subscribeIndependentlyAndFire(fn)
    assert.spy(fn).called(1)
    assert.spy(fn).called_with(match._, match._, "no", undefined)
    val.set(true)
    assert.spy(fn).called(2)
    assert.spy(fn).called_with(match._, match._, "yes", "no")
  })
})
