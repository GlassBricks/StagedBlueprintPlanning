/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of BBPP3.
 *
 * BBPP3 is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * BBPP3 is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with BBPP3. If not, see <https://www.gnu.org/licenses/>.
 */

import { deepCompare, isEmpty, shallowCopy } from "../util"

test("shallowCopy", () => {
  const obj = {
    a: 1,
    b: {
      c: 2,
      d: 3,
    },
  }
  const copy = shallowCopy(obj)
  assert.equal(copy.a, 1)
  assert.equal(copy.b, obj.b)
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
  assert.is_true(deepCompare(a, b))
  const c = {
    a: 1,
    b: {
      c: 2,
      d: 4,
    },
  }
  assert.is_false(deepCompare(a, c))
})

test("isEmpty", () => {
  assert.is_true(isEmpty({}))
  assert.is_false(isEmpty({ a: 1 }))
})
