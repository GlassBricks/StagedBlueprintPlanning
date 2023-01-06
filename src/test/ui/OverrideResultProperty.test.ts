import { MutableProperty, property } from "../../lib"
import { OverrideResultProperty } from "../../ui/OverrideResultProperty"
import expect from "tstl-expect"

let override: MutableProperty<undefined>
let defaultValue: MutableProperty<boolean>
let prop: OverrideResultProperty<boolean>
before_each(() => {
  override = property(nil)
  defaultValue = property(false)
  prop = new OverrideResultProperty(override, defaultValue)
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
