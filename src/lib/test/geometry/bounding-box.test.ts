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

import { BBox } from "../../geometry"

test("create", () => {
  const box = BBox({ x: 1, y: 2 }, { x: 3, y: 4 })
  assert.same({ x: 1, y: 2 }, box.left_top)
  assert.same({ x: 3, y: 4 }, box.right_bottom)
})

test("from", () => {
  const box = BBox.from({ left_top: { x: 1, y: 2 }, right_bottom: { x: 3, y: 4 } })
  assert.same({ x: 1, y: 2 }, box.left_top)
  assert.same({ x: 3, y: 4 }, box.right_bottom)
})

test("fromCoords", () => {
  const box = BBox.coords(1, 2, 3, 4)
  assert.same({ x: 1, y: 2 }, box.left_top)
  assert.same({ x: 3, y: 4 }, box.right_bottom)
})

test("around", () => {
  const box = BBox.around({ x: 1, y: 1 }, 1)
  assert.same({ x: 0, y: 0 }, box.left_top)
  assert.same({ x: 2, y: 2 }, box.right_bottom)
})

test("normalize", () => {
  const box = BBox.normalize([
    [1, 2],
    [3, 4],
  ])
  assert.same({ x: 1, y: 2 }, box.left_top)
  assert.same({ x: 3, y: 4 }, box.right_bottom)
})

test("shift", () => {
  const box = BBox({ x: 1, y: 2 }, { x: 3, y: 4 })
  const box2 = box.translate({ x: 1, y: 1 })
  assert.same({ x: 2, y: 3 }, box2.left_top)
  assert.same({ x: 4, y: 5 }, box2.right_bottom)
})
test("shiftNegative", () => {
  const box = BBox({ x: 1, y: 2 }, { x: 3, y: 4 })
  const box2 = box.translateNegative({ x: 1, y: 1 })
  assert.same({ x: 0, y: 1 }, box2.left_top)
  assert.same({ x: 2, y: 3 }, box2.right_bottom)
})

test("size", () => {
  const box = BBox({ x: 1, y: 2 }, { x: 3, y: 4 })
  assert.same({ x: 2, y: 2 }, box.size())
})

test("roundTile", () => {
  const box = BBox({ x: 1.5, y: 2.5 }, { x: 3.5, y: 4.5 })
  const box2 = box.roundTile()
  assert.same({ x: 1, y: 2 }, box2.left_top)
  assert.same({ x: 4, y: 5 }, box2.right_bottom)
})
test("roundChunk", () => {
  const box = BBox({ x: 1.5, y: 32 }, { x: 33.5, y: 65 })
  const box2 = box.roundChunk()
  assert.same({ x: 0, y: 32 }, box2.left_top)
  assert.same({ x: 64, y: 32 * 3 }, box2.right_bottom)
})

test("scale", () => {
  const box = BBox({ x: 1, y: 2 }, { x: 3, y: 4 })
  const box2 = box.scale(2)
  assert.same({ x: 2, y: 4 }, box2.left_top)
  assert.same({ x: 6, y: 8 }, box2.right_bottom)
})

test("expand", () => {
  const box = BBox({ x: 1, y: 2 }, { x: 3, y: 4 })
  const box2 = box.expand(1)
  assert.same({ x: 0, y: 1 }, box2.left_top)
  assert.same({ x: 4, y: 5 }, box2.right_bottom)
})

test("center", () => {
  const box = BBox({ x: 1, y: 2 }, { x: 3, y: 4 })
  const box2 = box.center()
  assert.same({ x: 2, y: 3 }, box2)
})

describe("rotateAboutOrigin", () => {
  test("north", () => {
    const box = BBox({ x: -1, y: -2 }, { x: 3, y: 4 })
    const box2 = box.rotateAboutOrigin(defines.direction.north)
    assert.same({ x: -1, y: -2 }, box2.left_top)
    assert.same({ x: 3, y: 4 }, box2.right_bottom)
  })

  test("south", () => {
    const box = BBox({ x: -1, y: -2 }, { x: 3, y: 4 })
    const box2 = box.rotateAboutOrigin(defines.direction.south)
    assert.same({ x: -3, y: -4 }, box2.left_top)
    assert.same({ x: 1, y: 2 }, box2.right_bottom)
  })

  test("west", () => {
    const box = BBox({ x: -1, y: -2 }, { x: 3, y: 4 })
    const box2 = box.rotateAboutOrigin(defines.direction.west)
    assert.same({ x: -2, y: -3 }, box2.left_top)
    assert.same({ x: 4, y: 1 }, box2.right_bottom)
  })

  test("east", () => {
    const box = BBox({ x: -1, y: -2 }, { x: 3, y: 4 })
    const box2 = box.rotateAboutOrigin(defines.direction.east)
    assert.same({ x: -4, y: -1 }, box2.left_top)
    assert.same({ x: 2, y: 3 }, box2.right_bottom)
  })
})

test("iterateTiles", () => {
  const box = BBox({ x: 1, y: 2 }, { x: 3, y: 4 })
  const result = []
  for (const [x, y] of box.iterateTiles()) {
    result.push([x, y])
  }
  assert.same(
    [
      [1, 2],
      [2, 2],
      [1, 3],
      [2, 3],
    ],
    result,
  )
})

test("intersect", () => {
  const box = BBox({ x: 1, y: 2 }, { x: 3, y: 4 })
  const box2 = BBox({ x: 2, y: 3 }, { x: 4, y: 5 })
  const box3 = box.intersect(box2)
  assert.same({ x: 2, y: 3 }, box3.left_top)
  assert.same({ x: 3, y: 4 }, box3.right_bottom)
})

test("equals", () => {
  const box = BBox({ x: 1, y: 2 }, { x: 3, y: 4 })
  const box2 = BBox({ x: 1, y: 2 }, { x: 3, y: 4 })
  const box3 = BBox({ x: 1, y: 2 }, { x: 3, y: 5 })
  assert.true(box.equals(box2))
  assert.false(box.equals(box3))
})

test("isCenteredSquare", () => {
  const box = BBox({ x: 2, y: 3 }, { x: -2, y: -3 })
  assert.is_false(box.isCenteredSquare())
  const box2 = BBox({ x: 2, y: 2 }, { x: -2, y: -2 })
  assert.is_true(box2.isCenteredSquare())
})

test("isCenteredRectangle", () => {
  const box = BBox({ x: 2, y: 4 }, { x: -2, y: -3 })
  assert.is_false(box.isCenteredRectangle())
  const box3 = BBox({ x: 2, y: 3 }, { x: -2, y: -3 })
  assert.is_true(box3.isCenteredRectangle())
})

test("contains", () => {
  const box = BBox({ x: 1, y: 1 }, { x: 4, y: 4 })
  assert.is_true(box.contains({ x: 2, y: 3 }))
  assert.is_false(box.contains({ x: 2, y: 5 }))
})

test("intersectsNonZeroArea", () => {
  const box = BBox({ x: 1, y: 1 }, { x: 4, y: 4 })
  assert.is_true(box.intersectsFully(BBox({ x: 2, y: 3 }, { x: 3, y: 4 })))
  assert.is_false(box.intersectsFully(BBox({ x: 2, y: 5 }, { x: 3, y: 6 })))
  // only touches
  assert.is_false(box.intersectsFully(BBox({ x: 2, y: 4 }, { x: 3, y: 5 })))
})
