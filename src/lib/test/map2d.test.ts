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

import { MutableMap2D, newMap2D } from "../map2d"

let map2d: MutableMap2D<string>

before_each(() => {
  map2d = newMap2D()
})

test("add and get", () => {
  map2d.add(1, 1, "a")
  assert.same(newLuaSet("a"), map2d.get(1, 1))
})

test("add and get multiple", () => {
  map2d.add(1, 1, "a")
  map2d.add(1, 1, "b")
  assert.same(newLuaSet("a", "b"), map2d.get(1, 1))
})

test("add in multiple coords", () => {
  map2d.add(1, 1, "a")
  map2d.add(2, 2, "b")
  assert.same(newLuaSet("a"), map2d.get(1, 1))
  assert.same(newLuaSet("b"), map2d.get(2, 2))
})

test("remove and get", () => {
  map2d.add(1, 1, "a")
  map2d.add(1, 1, "b")
  map2d.remove(1, 1, "a")
  assert.same(newLuaSet("b"), map2d.get(1, 1))
})

test("removes empty entries", () => {
  map2d.add(1, 1, "a")
  map2d.remove(1, 1, "a")
  assert.same({}, map2d)
})

test("size", () => {
  assert.same(0, map2d.getSize())
  map2d.add(1, 1, "a")
  assert.same(1, map2d.getSize())
  map2d.add(1, 2, "b")
  assert.same(2, map2d.getSize())
  map2d.add(1, 2, "c")
  assert.same(3, map2d.getSize())
  map2d.add(1, 2, "b")
  assert.same(3, map2d.getSize())
})
