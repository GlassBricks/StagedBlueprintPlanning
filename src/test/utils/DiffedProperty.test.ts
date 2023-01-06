import { MutableProperty, property } from "../../lib"
import { DiffedProperty } from "../../utils/DiffedProperty"
import expect from "tstl-expect"
import { DiffValue, getNilPlaceholder, NilPlaceholder } from "../../utils/diff-value"

let override: MutableProperty<DiffValue<boolean | nil>>
let defaultValue: MutableProperty<boolean>
let prop: DiffedProperty<boolean>
before_each(() => {
  override = property(nil)
  defaultValue = property(false)
  prop = new DiffedProperty(override, defaultValue)
})
test("sets the override property when not equal to default", () => {
  expect(prop.get()).to.be(false)

  prop.set(true)
  expect(prop.get()).to.be(true)
  expect(override.get()).to.be(true)

  prop.set(false)
  expect(prop.get()).to.be(false)
  expect(override.get()).to.be(nil)
})
test("has the value of default when override is nil", () => {
  defaultValue.set(true)
  expect(prop.get()).to.be(true)
  expect(override.get()).to.be(nil)

  defaultValue.set(false)
  expect(prop.get()).to.be(false)
  expect(override.get()).to.be(nil)
})

test("preserves override if default value set later", () => {
  prop.set(true)
  defaultValue.set(true) // set LATER to match

  expect(prop.get()).to.be(true)
  expect(override.get()).to.be(true)

  defaultValue.set(false)

  expect(prop.get()).to.be(true)
  expect(override.get()).to.be(true)
})

test("can override with nil using nilPlaceholder", () => {
  const nilPlaceholder: NilPlaceholder = getNilPlaceholder()
  override.set(nilPlaceholder)
  expect(prop.get()).to.be(nil)

  override.set(true)
  expect(prop.get()).to.be(true)

  override.set(nil)
  expect(prop.get()).to.be(false)
})
