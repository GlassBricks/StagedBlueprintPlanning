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

import expect from "tstl-expect"
import { Pos } from "../../geometry"

test("create", () => {
  const position = Pos(1, 2)
  expect(position).toEqual({ x: 1, y: 2 })
})

test("from", () => {
  const position = Pos.from({ x: 3, y: 4 })
  expect(position.length()).toBe(5)
})

test("normalize", () => {
  const position = Pos.normalize([1, 2])
  expect(position.x).toBe(1)
  expect(position.y).toBe(2)

  const position2 = Pos.normalize({ x: 1, y: 2 })
  expect(position2.x).toBe(1)
  expect(position2.y).toBe(2)
})

test("plus", () => {
  const position = Pos(1, 2)
  const position2 = Pos(3, 4)
  const position3 = position.plus(position2)
  expect(position3).toEqual({ x: 4, y: 6 })
})

test("minus", () => {
  const position = Pos(1, 2)
  const position2 = Pos(3, 4)
  const position3 = position.minus(position2)
  expect(position3).toEqual({ x: -2, y: -2 })
})

test("times", () => {
  const position = Pos(1, 2)
  const position2 = position.times(2)
  expect(position2).toEqual({ x: 2, y: 4 })
})

test("div", () => {
  const position = Pos(1, 2)
  const position2 = position.div(2)
  expect(position2).toEqual({ x: 0.5, y: 1 })
})

test("emul", () => {
  const position = Pos(1, 2)
  const position2 = Pos(3, 4)
  const position3 = position.emul(position2)
  expect(position3).toEqual({ x: 3, y: 8 })
})

test("ediv", () => {
  const position = Pos(1, 2)
  const position2 = Pos(3, 4)
  const position3 = position.ediv(position2)
  expect(position3).toEqual({ x: 1 / 3, y: 0.5 })
})

test("floor", () => {
  const position = Pos(1.5, 2.5)
  const position2 = position.floor()
  expect(position2).toEqual({ x: 1, y: 2 })
})

test("ceil", () => {
  const position = Pos(1.5, 2.5)
  const position2 = position.ceil()
  expect(position2).toEqual({ x: 2, y: 3 })
})

describe("rotateAboutOrigin", () => {
  test("north", () => {
    const position = Pos(1, 2)
    const position2 = position.rotateAboutOrigin(defines.direction.north)
    expect(position2).toEqual({ x: 1, y: 2 })
  })

  test("south", () => {
    const position = Pos(1, 2)
    const position2 = position.rotateAboutOrigin(defines.direction.south)
    expect(position2).toEqual({ x: -1, y: -2 })
  })

  test("west", () => {
    const position = Pos(1, 2)
    const position2 = position.rotateAboutOrigin(defines.direction.west)
    expect(position2).toEqual({ x: 2, y: -1 })
  })

  test("east", () => {
    const position = Pos(1, 2)
    const position2 = position.rotateAboutOrigin(defines.direction.east)
    expect(position2).toEqual({ x: -2, y: 1 })
  })
})

test("length", () => {
  const position = Pos(3, 4)
  expect(position.length()).toBe(5)
})

test("equals", () => {
  const position = Pos(1, 2)
  const position2 = { x: 1, y: 2 }
  const position3 = { x: 2, y: 2 }
  expect(position.equals(position2)).toBe(true)
  expect(position.equals(position3)).toBe(false)
})

test("isZero", () => {
  expect(Pos(0, 0).isZero()).toBe(true)
  expect(Pos(1, 0).isZero()).toBe(false)
  expect(Pos(1, 1).isZero()).toBe(false)
})

test("applyTransformation", () => {
  const position = Pos(1, 2)
  const position2 = position.applyTransformation(false, false, defines.direction.north)
  expect(position2).toEqual({ x: 1, y: 2 })

  const position3 = position.applyTransformation(true, false, defines.direction.north)
  expect(position3).toEqual({ x: -1, y: 2 })

  const position4 = position.applyTransformation(false, true, defines.direction.north)
  expect(position4).toEqual({ x: 1, y: -2 })

  // both
  const position5 = position.applyTransformation(true, true, defines.direction.north)
  expect(position5).toEqual({ x: -1, y: -2 })

  // rotate
  const position6 = position.applyTransformation(false, false, defines.direction.east)
  expect(position6).toEqual({ x: -2, y: 1 })

  // flip and rotate
  const position7 = position.applyTransformation(true, false, defines.direction.east)
  expect(position7).toEqual({ x: -2, y: -1 })
})
