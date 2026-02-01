// Copyright (c) 2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { mock } from "tstl-expect"

const anyMockMt: LuaMetatable<any> = {
  __index(key: string) {
    return (this[key] = mock.fnNoSelf())
  },
}

/**
 * Creates a object that can mock any interface of only functions.
 *
 * Resets before each test.
 */
export function fMock<T>(): mock.MockedObjectNoSelf<T> {
  const result = setmetatable({}, anyMockMt)
  before_each(() => {
    for (const key in result) {
      delete result[key]
    }
  })
  return result
}

/**
 * This only works properly with objects using lazyLoad
 */
export function fStub<T>(value: T): mock.MockedObjectNoSelf<T> {
  for (const [k, v] of pairs(value)) {
    if (typeof v == "function") {
      error(`already loaded value ${tostring(k)}, ${v}`)
    }
  }
  return setmetatable(value, anyMockMt)
}

const classMockMt: LuaMetatable<any> = {
  __index(key: string) {
    return (this[key] = mock.fn())
  },
}

export function fStubClass<T>(value: T): mock.MockedObject<T> {
  return setmetatable(value, classMockMt)
}
