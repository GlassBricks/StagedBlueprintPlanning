/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { MutableMap2D, newMap2D } from "../../entity/map2d"
import expect from "tstl-expect"

let map2d: MutableMap2D<string>

before_each(() => {
  map2d = newMap2D()
})

test("add and get", () => {
  map2d.add(1, 1, "a")
  expect(map2d.get(1, 1)).to.equal("a")
})

test("add and get multiple", () => {
  map2d.add(1, 1, "a")
  map2d.add(1, 1, "b")
  expect(map2d.get(1, 1)).to.equal(["a", "b"])
})

test("add in multiple coords", () => {
  map2d.add(1, 1, "a")
  map2d.add(2, 2, "b")
  expect(map2d.get(1, 1)).to.equal("a")
  expect(map2d.get(2, 2)).to.equal("b")
})

test("remove and get", () => {
  map2d.add(1, 1, "a")
  map2d.add(1, 1, "b")
  map2d.delete(1, 1, "a")
  expect(map2d.get(1, 1)).to.equal("b")
})

test("removes empty entries", () => {
  map2d.add(1, 1, "a")
  map2d.delete(1, 1, "a")
  expect(map2d).to.equal({})
})

test("removes empty from multiple values", () => {
  map2d.add(1, 1, "a")
  map2d.add(1, 1, "b")
  map2d.delete(1, 1, "a")
  map2d.delete(1, 1, "b")
  expect(map2d).to.equal({})
})
