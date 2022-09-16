/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of 100% Blueprint Planning.
 *
 * 100% Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * 100% Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with 100% Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { MutableMap2D, newMap2D } from "../map2d"

let map2d: MutableMap2D<string>

before_each(() => {
  map2d = newMap2D()
})

test("add and get", () => {
  map2d.add(1, 1, "a")
  assert.same("a", map2d.get(1, 1))
})

test("add and get multiple", () => {
  map2d.add(1, 1, "a")
  map2d.add(1, 1, "b")
  assert.same(["a", "b"], map2d.get(1, 1))
})

test("add in multiple coords", () => {
  map2d.add(1, 1, "a")
  map2d.add(2, 2, "b")
  assert.same("a", map2d.get(1, 1))
  assert.same("b", map2d.get(2, 2))
})

test("remove and get", () => {
  map2d.add(1, 1, "a")
  map2d.add(1, 1, "b")
  map2d.delete(1, 1, "a")
  assert.same("b", map2d.get(1, 1))
})

test("removes empty entries", () => {
  map2d.add(1, 1, "a")
  map2d.delete(1, 1, "a")
  assert.same({}, map2d)
})

test("removes empty from multiple values", () => {
  map2d.add(1, 1, "a")
  map2d.add(1, 1, "b")
  map2d.delete(1, 1, "a")
  map2d.delete(1, 1, "b")
  assert.same({}, map2d)
})
