// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import expect from "tstl-expect"
import { MutableProperty, property } from "../../lib"
import { DiffValue, getNilPlaceholder, NilPlaceholder } from "../../utils/diff-value"
import { DiffedProperty } from "../../utils/DiffedProperty"

let override: MutableProperty<DiffValue<boolean | nil>>
let defaultValue: MutableProperty<boolean>
let prop: DiffedProperty<boolean>
before_each(() => {
  override = property(nil)
  defaultValue = property(false)
  prop = new DiffedProperty(override, defaultValue)
})
test("sets the override property when not equal to default", () => {
  expect(prop.get()).toBe(false)

  prop.set(true)
  expect(prop.get()).toBe(true)
  expect(override.get()).toBe(true)

  prop.set(false)
  expect(prop.get()).toBe(false)
  expect(override.get()).toBe(nil)
})
test("has the value of default when override is nil", () => {
  defaultValue.set(true)
  expect(prop.get()).toBe(true)
  expect(override.get()).toBe(nil)

  defaultValue.set(false)
  expect(prop.get()).toBe(false)
  expect(override.get()).toBe(nil)
})

test("preserves override if default value set later", () => {
  prop.set(true)
  defaultValue.set(true) // set LATER to match

  expect(prop.get()).toBe(true)
  expect(override.get()).toBe(true)

  defaultValue.set(false)

  expect(prop.get()).toBe(true)
  expect(override.get()).toBe(true)
})

test("can override with nil using nilPlaceholder", () => {
  const nilPlaceholder: NilPlaceholder = getNilPlaceholder()
  override.set(nilPlaceholder)
  expect(prop.get()).toBe(nil)

  override.set(true)
  expect(prop.get()).toBe(true)

  override.set(nil)
  expect(prop.get()).toBe(false)
})
