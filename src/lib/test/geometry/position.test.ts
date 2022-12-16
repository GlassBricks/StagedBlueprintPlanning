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

import { Pos } from "../../geometry"
import expect from "tstl-expect"

test("create", () => {
  const position = Pos(1, 2)
  expect(position).to.equal({ x: 1, y: 2 })
})

test("from", () => {
  const position = Pos.from({ x: 3, y: 4 })
  expect(position.length()).to.be(5)
})

test("normalize", () => {
  const position = Pos.normalize([1, 2])
  expect(position.x).to.be(1)
  expect(position.y).to.be(2)

  const position2 = Pos.normalize({ x: 1, y: 2 })
  expect(position2.x).to.be(1)
  expect(position2.y).to.be(2)
})

test("plus", () => {
  const position = Pos(1, 2)
  const position2 = Pos(3, 4)
  const position3 = position.plus(position2)
  expect(position3).to.equal({ x: 4, y: 6 })
})

test("minus", () => {
  const position = Pos(1, 2)
  const position2 = Pos(3, 4)
  const position3 = position.minus(position2)
  expect(position3).to.equal({ x: -2, y: -2 })
})

test("times", () => {
  const position = Pos(1, 2)
  const position2 = position.times(2)
  expect(position2).to.equal({ x: 2, y: 4 })
})

test("div", () => {
  const position = Pos(1, 2)
  const position2 = position.div(2)
  expect(position2).to.equal({ x: 0.5, y: 1 })
})

test("emul", () => {
  const position = Pos(1, 2)
  const position2 = Pos(3, 4)
  const position3 = position.emul(position2)
  expect(position3).to.equal({ x: 3, y: 8 })
})

test("ediv", () => {
  const position = Pos(1, 2)
  const position2 = Pos(3, 4)
  const position3 = position.ediv(position2)
  expect(position3).to.equal({ x: 1 / 3, y: 0.5 })
})

test("floor", () => {
  const position = Pos(1.5, 2.5)
  const position2 = position.floor()
  expect(position2).to.equal({ x: 1, y: 2 })
})

test("ceil", () => {
  const position = Pos(1.5, 2.5)
  const position2 = position.ceil()
  expect(position2).to.equal({ x: 2, y: 3 })
})

describe("rotateAboutOrigin", () => {
  test("north", () => {
    const position = Pos(1, 2)
    const position2 = position.rotateAboutOrigin(defines.direction.north)
    expect(position2).to.equal({ x: 1, y: 2 })
  })

  test("south", () => {
    const position = Pos(1, 2)
    const position2 = position.rotateAboutOrigin(defines.direction.south)
    expect(position2).to.equal({ x: -1, y: -2 })
  })

  test("west", () => {
    const position = Pos(1, 2)
    const position2 = position.rotateAboutOrigin(defines.direction.west)
    expect(position2).to.equal({ x: 2, y: -1 })
  })

  test("east", () => {
    const position = Pos(1, 2)
    const position2 = position.rotateAboutOrigin(defines.direction.east)
    expect(position2).to.equal({ x: -2, y: 1 })
  })
})

test("length", () => {
  const position = Pos(3, 4)
  expect(position.length()).to.be(5)
})

test("equals", () => {
  const position = Pos(1, 2)
  const position2 = { x: 1, y: 2 }
  const position3 = { x: 2, y: 2 }
  expect(position.equals(position2)).to.be(true)
  expect(position.equals(position3)).to.be(false)
})

test("isZero", () => {
  expect(Pos(0, 0).isZero()).to.be(true)
  expect(Pos(1, 0).isZero()).to.be(false)
  expect(Pos(1, 1).isZero()).to.be(false)
})
