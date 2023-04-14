/*
 * Copyright (c) 2022-2023 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

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
  expect(1).to.be(copy.a)
  expect(obj.b).to.be(copy.b)
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
  expect(deepCompare(a, b)).to.be(true)
  const c = {
    a: 1,
    b: {
      c: 2,
      d: 4,
    },
  }
  expect(deepCompare(a, c)).to.be(false)
})

test("isEmpty", () => {
  expect(isEmpty({})).to.be(true)
  expect(isEmpty({ a: 1 })).to.be(false)
})
