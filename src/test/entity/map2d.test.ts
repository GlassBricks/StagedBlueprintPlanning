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
import { Map2D, newMap2D } from "../../entity/map2d"

interface Foo {
  [x: number]: string
  _next?: Foo
}

let map2d: Map2D<Foo>

before_each(() => {
  map2d = newMap2D()
})

test("add and get", () => {
  map2d.add(1, 1, ["a"])
  expect(map2d.get(1, 1)).toEqual(["a"])
})

test("add and get multiple", () => {
  map2d.add(1, 1, ["a"])
  map2d.add(1, 1, ["b"])
  expect(map2d.get(1, 1)).toEqual({
    [1]: "b",
    _next: ["a"],
  })
})

test("add in multiple coords", () => {
  map2d.add(1, 1, ["a"])
  map2d.add(2, 2, ["b"])
  expect(map2d.get(1, 1)).toEqual(["a"])
  expect(map2d.get(2, 2)).toEqual(["b"])
})

test("remove and get first", () => {
  const va = ["a"]
  map2d.add(1, 1, va)
  map2d.add(1, 1, ["b"])
  map2d.delete(1, 1, va)
  expect(map2d.get(1, 1)).toEqual(["b"])
})

test("remove and get second", () => {
  const va = ["a"]
  map2d.add(1, 1, ["b"])
  map2d.add(1, 1, va)
  map2d.delete(1, 1, va)
  expect(map2d.get(1, 1)).toEqual(["b"])
})

test("removes empty entries", () => {
  const va = ["a"]
  map2d.add(1, 1, va)
  map2d.delete(1, 1, va)
  expect(map2d).toEqual({})
})

test("removes empty from multiple values", () => {
  const va = ["a"]
  const vb = ["b"]
  map2d.add(1, 1, va)
  map2d.add(1, 1, vb)
  map2d.delete(1, 1, va)
  map2d.delete(1, 1, vb)
  expect(map2d).toEqual({})
})
