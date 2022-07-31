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

import { map2dAdd, map2dGet, map2dRemove, map2dSize, MutableMap2D } from "./map2d"

let map2d: MutableMap2D<string>

before_each(() => {
  map2d = {}
})

test("add and get", () => {
  map2dAdd(map2d, 1, 1, "a")
  assert.same(newLuaSet("a"), map2dGet(map2d, 1, 1))
})

test("add and get multiple", () => {
  map2dAdd(map2d, 1, 1, "a")
  map2dAdd(map2d, 1, 1, "b")
  assert.same(newLuaSet("a", "b"), map2dGet(map2d, 1, 1))
})

test("add in multiple coords", () => {
  map2dAdd(map2d, 1, 1, "a")
  map2dAdd(map2d, 2, 2, "b")
  assert.same(newLuaSet("a"), map2dGet(map2d, 1, 1))
  assert.same(newLuaSet("b"), map2dGet(map2d, 2, 2))
})

test("remove and get", () => {
  map2dAdd(map2d, 1, 1, "a")
  map2dAdd(map2d, 1, 1, "b")
  map2dRemove(map2d, 1, 1, "a")
  assert.same(newLuaSet("b"), map2dGet(map2d, 1, 1))
})

test("removes empty entries", () => {
  map2dAdd(map2d, 1, 1, "a")
  map2dRemove(map2d, 1, 1, "a")
  assert.same({}, map2d)
})

test("size", () => {
  assert.same(0, map2dSize(map2d))
  map2dAdd(map2d, 1, 1, "a")
  assert.same(1, map2dSize(map2d))
  map2dAdd(map2d, 1, 2, "b")
  assert.same(2, map2dSize(map2d))
  map2dAdd(map2d, 1, 2, "c")
  assert.same(3, map2dSize(map2d))
  map2dAdd(map2d, 1, 2, "b")
  assert.same(3, map2dSize(map2d))
})
