// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import expect from "tstl-expect"
import {
  fromDiffValue,
  getDiff,
  getNilPlaceholder,
  getResultValue,
  NilPlaceholder,
  toDiffValue,
} from "../../utils/diff-value"

let nilPlaceholder: NilPlaceholder
before_all(() => {
  nilPlaceholder = getNilPlaceholder()
})
test("toDiffValue", () => {
  expect(toDiffValue(1)).toBe(1)
  expect(toDiffValue(nil)).toBe(nilPlaceholder)
})

test("fromDiffValue", () => {
  expect(fromDiffValue(1)).toBe(1)
  expect(fromDiffValue(nilPlaceholder)).toBe(nil)
})

test("getResultValue", () => {
  expect(getResultValue(1, 2)).toBe(2)
  expect(getResultValue(1, nil)).toBe(1)
  expect(getResultValue(1, nilPlaceholder)).toBe(nil)
})

test("getDiff", () => {
  expect(getDiff(1, 2)).toBe(2)
  expect(getDiff(1, 1)).toBe(nil)
  expect(getDiff(1, nil)).toBe(nilPlaceholder)
})
