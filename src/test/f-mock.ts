/*
 * Copyright (c) 2023 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

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
