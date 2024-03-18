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
import { LinkedMap2D, Map2D, newLinkedMap2d, newMap2d } from "../../entity/map2d"

interface Foo {
  [x: number]: string
  _next?: Foo
}

describe("LinkedMap2D", () => {
  let lMap2D: LinkedMap2D<Foo>

  before_each(() => {
    lMap2D = newLinkedMap2d()
  })

  test("add and get", () => {
    lMap2D.add(1, 1, ["a"])
    expect(lMap2D.get(1, 1)).toEqual(["a"])
  })

  test("add and get multiple", () => {
    lMap2D.add(1, 1, ["a"])
    lMap2D.add(1, 1, ["b"])
    expect(lMap2D.get(1, 1)).toEqual({
      [1]: "b",
      _next: ["a"],
    })
  })

  test("add in multiple coords", () => {
    lMap2D.add(1, 1, ["a"])
    lMap2D.add(2, 2, ["b"])
    expect(lMap2D.get(1, 1)).toEqual(["a"])
    expect(lMap2D.get(2, 2)).toEqual(["b"])
  })

  test("remove and get first", () => {
    const va: Foo = ["a"]
    lMap2D.add(1, 1, va)
    lMap2D.add(1, 1, ["b"])
    lMap2D.delete(1, 1, va)
    expect(lMap2D.get(1, 1)).toEqual(["b"])
  })

  test("remove and get second", () => {
    const va: Foo = ["a"]
    lMap2D.add(1, 1, ["b"])
    lMap2D.add(1, 1, va)
    expect(va._next).toBeAny()
    lMap2D.delete(1, 1, va)
    expect(va._next).toBeNil()
    expect(lMap2D.get(1, 1)).toEqual(["b"])
  })

  test("three elements, removing second", () => {
    const vb: Foo = ["b"]
    lMap2D.add(1, 1, ["a"])
    lMap2D.add(1, 1, vb)
    lMap2D.add(1, 1, ["c"])
    lMap2D.delete(1, 1, vb)
    expect(lMap2D.get(1, 1)).toEqual({
      [1]: "c",
      _next: ["a"],
    })
    expect(vb._next).toBeNil()
  })

  test("removes empty entries", () => {
    const va = ["a"]
    lMap2D.add(1, 1, va)
    lMap2D.delete(1, 1, va)
    expect(lMap2D).toEqual({})
  })

  test("removes empty from multiple values", () => {
    const va = ["a"]
    const vb = ["b"]
    lMap2D.add(1, 1, va)
    lMap2D.add(1, 1, vb)
    lMap2D.delete(1, 1, va)
    lMap2D.delete(1, 1, vb)
    expect(lMap2D).toEqual({})
  })
})

describe("map2d", () => {
  let map: Map2D<string>

  before_each(() => {
    map = newMap2d()
  })

  test("set and get", () => {
    map.set(1, 1, "a")
    expect(map.get(1, 1)).toEqual("a")
    expect(map[1]![1]).toEqual("a")
    expect(map.get(2, 1)).toBeNil()
    expect(map[2]).toBeNil()
  })

  test("set and get at same position", () => {
    map.set(1, 1, "a")
    map.set(1, 1, "b")
    expect(map[1]![1]).toEqual("b")
    expect(map.get(1, 1)).toEqual("b")
  })

  test("delete", () => {
    map.set(1, 1, "a")
    map.delete(1, 1)
    expect(map.get(1, 1)).toBeNil()
    expect(map[1]).toBeNil()
  })

  test("delete with other value at same x", () => {
    map.set(1, 1, "a")
    map.set(1, 2, "b")
    map.delete(1, 1)
    expect(map.get(1, 1)).toBeNil()
    expect(map[1]![2]).toEqual("b")
  })

  test("set at multiple positions", () => {
    map.set(1, 1, "a")
    map.set(2, 2, "b")
    expect(map[1]![1]).toEqual("a")
    expect(map[2]![2]).toEqual("b")
  })
})
