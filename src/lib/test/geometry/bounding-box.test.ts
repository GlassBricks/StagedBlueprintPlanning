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

import { BBox } from "../../geometry"
import expect from "tstl-expect"

test("create", () => {
  const box = BBox({ x: 1, y: 2 }, { x: 3, y: 4 })
  expect(box.left_top).to.equal({ x: 1, y: 2 })
  expect(box.right_bottom).to.equal({ x: 3, y: 4 })
})

test("from", () => {
  const box = BBox.from({ left_top: { x: 1, y: 2 }, right_bottom: { x: 3, y: 4 } })
  expect(box.left_top).to.equal({ x: 1, y: 2 })
  expect(box.right_bottom).to.equal({ x: 3, y: 4 })
})

test("fromCoords", () => {
  const box = BBox.coords(1, 2, 3, 4)
  expect(box.left_top).to.equal({ x: 1, y: 2 })
  expect(box.right_bottom).to.equal({ x: 3, y: 4 })
})

test("around", () => {
  const box = BBox.around({ x: 1, y: 1 }, 1)
  expect(box.left_top).to.equal({ x: 0, y: 0 })
  expect(box.right_bottom).to.equal({ x: 2, y: 2 })
})

test("normalize", () => {
  const box = BBox.normalize([
    [1, 2],
    [3, 4],
  ])
  expect(box.left_top).to.equal({ x: 1, y: 2 })
  expect(box.right_bottom).to.equal({ x: 3, y: 4 })
})

test("shift", () => {
  const box = BBox({ x: 1, y: 2 }, { x: 3, y: 4 })
  const box2 = box.translate({ x: 1, y: 1 })
  expect(box2.left_top).to.equal({ x: 2, y: 3 })
  expect(box2.right_bottom).to.equal({ x: 4, y: 5 })
})
test("shiftNegative", () => {
  const box = BBox({ x: 1, y: 2 }, { x: 3, y: 4 })
  const box2 = box.translateNegative({ x: 1, y: 1 })
  expect(box2.left_top).to.equal({ x: 0, y: 1 })
  expect(box2.right_bottom).to.equal({ x: 2, y: 3 })
})

test("size", () => {
  const box = BBox({ x: 1, y: 2 }, { x: 3, y: 4 })
  expect(box.size()).to.equal({ x: 2, y: 2 })
})

test("roundTile", () => {
  const box = BBox({ x: 1.5, y: 2.5 }, { x: 3.5, y: 4.5 })
  const box2 = box.roundTile()
  expect(box2.left_top).to.equal({ x: 1, y: 2 })
  expect(box2.right_bottom).to.equal({ x: 4, y: 5 })
})
test("roundChunk", () => {
  const box = BBox({ x: 1.5, y: 32 }, { x: 33.5, y: 65 })
  const box2 = box.roundChunk()
  expect(box2.left_top).to.equal({ x: 0, y: 32 })
  expect(box2.right_bottom).to.equal({ x: 64, y: 32 * 3 })
})

test("scale", () => {
  const box = BBox({ x: 1, y: 2 }, { x: 3, y: 4 })
  const box2 = box.scale(2)
  expect(box2.left_top).to.equal({ x: 2, y: 4 })
  expect(box2.right_bottom).to.equal({ x: 6, y: 8 })
})

test("expand", () => {
  const box = BBox({ x: 1, y: 2 }, { x: 3, y: 4 })
  const box2 = box.expand(1)
  expect(box2.left_top).to.equal({ x: 0, y: 1 })
  expect(box2.right_bottom).to.equal({ x: 4, y: 5 })
})

test("center", () => {
  const box = BBox({ x: 1, y: 2 }, { x: 3, y: 4 })
  const box2 = box.center()
  expect(box2).to.equal({ x: 2, y: 3 })
})

describe("rotateAboutOrigin", () => {
  test("north", () => {
    const box = BBox({ x: -1, y: -2 }, { x: 3, y: 4 })
    const box2 = box.rotateAboutOrigin(defines.direction.north)
    expect(box2.left_top).to.equal({ x: -1, y: -2 })
    expect(box2.right_bottom).to.equal({ x: 3, y: 4 })
  })

  test("south", () => {
    const box = BBox({ x: -1, y: -2 }, { x: 3, y: 4 })
    const box2 = box.rotateAboutOrigin(defines.direction.south)
    expect(box2.left_top).to.equal({ x: -3, y: -4 })
    expect(box2.right_bottom).to.equal({ x: 1, y: 2 })
  })

  test("west", () => {
    const box = BBox({ x: -1, y: -2 }, { x: 3, y: 4 })
    const box2 = box.rotateAboutOrigin(defines.direction.west)
    expect(box2.left_top).to.equal({ x: -2, y: -3 })
    expect(box2.right_bottom).to.equal({ x: 4, y: 1 })
  })

  test("east", () => {
    const box = BBox({ x: -1, y: -2 }, { x: 3, y: 4 })
    const box2 = box.rotateAboutOrigin(defines.direction.east)
    expect(box2.left_top).to.equal({ x: -4, y: -1 })
    expect(box2.right_bottom).to.equal({ x: 2, y: 3 })
  })
})

test("iterateTiles", () => {
  const box = BBox({ x: 1, y: 2 }, { x: 3, y: 4 })
  const result = []
  for (const [x, y] of box.iterateTiles()) {
    result.push([x, y])
  }
  expect(result).to.equal([
    [1, 2],
    [2, 2],
    [1, 3],
    [2, 3],
  ])
})

test("intersect", () => {
  const box = BBox({ x: 1, y: 2 }, { x: 3, y: 4 })
  const box2 = BBox({ x: 2, y: 3 }, { x: 4, y: 5 })
  const box3 = box.intersect(box2)
  expect(box3.left_top).to.equal({ x: 2, y: 3 })
  expect(box3.right_bottom).to.equal({ x: 3, y: 4 })
})

test("equals", () => {
  const box = BBox({ x: 1, y: 2 }, { x: 3, y: 4 })
  const box2 = BBox({ x: 1, y: 2 }, { x: 3, y: 4 })
  const box3 = BBox({ x: 1, y: 2 }, { x: 3, y: 5 })
  expect(box.equals(box2)).to.be(true)
  expect(box.equals(box3)).to.be(false)
})

test("isCenteredSquare", () => {
  const box = BBox({ x: 2, y: 3 }, { x: -2, y: -3 })
  expect(box.isCenteredSquare()).to.be(false)
  const box2 = BBox({ x: 2, y: 2 }, { x: -2, y: -2 })
  expect(box2.isCenteredSquare()).to.be(true)
})

test("isCenteredRectangle", () => {
  const box = BBox({ x: 2, y: 4 }, { x: -2, y: -3 })
  expect(box.isCenteredRectangle()).to.be(false)
  const box3 = BBox({ x: 2, y: 3 }, { x: -2, y: -3 })
  expect(box3.isCenteredRectangle()).to.be(true)
})

test("contains", () => {
  const box = BBox({ x: 1, y: 1 }, { x: 4, y: 4 })
  expect(box.contains({ x: 2, y: 3 })).to.be(true)
  expect(box.contains({ x: 2, y: 5 })).to.be(false)
})

test("intersectsNonZeroArea", () => {
  const box = BBox({ x: 1, y: 1 }, { x: 4, y: 4 })
  expect(box.intersectsFully(BBox({ x: 2, y: 3 }, { x: 3, y: 4 }))).to.be(true)
  expect(box.intersectsFully(BBox({ x: 2, y: 5 }, { x: 3, y: 6 }))).to.be(false)
  // only touches
  expect(box.intersectsFully(BBox({ x: 2, y: 4 }, { x: 3, y: 5 }))).to.be(false)
})
