// Copyright (c) 2022-2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import expect from "tstl-expect"
import { deepCompare, isEmpty, shallowCopy } from "../_util"

test("shallowCopy", () => {
  const obj = {
    a: 1,
    b: {
      c: 2,
      d: 3,
    },
  }
  const copy = shallowCopy(obj)
  expect(1).toBe(copy.a)
  expect(obj.b).toBe(copy.b)
})

test("compare", () => {
  const a = {
    a: 1,
    b: {
      c: 2,
      d: 3,
    },
  }
  const b = {
    a: 1,
    b: {
      c: 2,
      d: 3,
    },
  }
  expect(deepCompare(a, b)).toBe(true)
  const c = {
    a: 1,
    b: {
      c: 2,
      d: 4,
    },
  }
  expect(deepCompare(a, c)).toBe(false)
})

test("isEmpty", () => {
  expect(isEmpty({})).toBe(true)
  expect(isEmpty({ a: 1 })).toBe(false)
})
