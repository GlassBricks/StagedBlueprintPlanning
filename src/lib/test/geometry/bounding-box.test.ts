// Copyright (c) 2022 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import expect from "tstl-expect"
import { BBox } from "../../geometry"

test("create", () => {
  const box = BBox({ x: 1, y: 2 }, { x: 3, y: 4 })
  expect(box.left_top).toEqual({ x: 1, y: 2 })
  expect(box.right_bottom).toEqual({ x: 3, y: 4 })
})

test("from", () => {
  const box = BBox.from({ left_top: { x: 1, y: 2 }, right_bottom: { x: 3, y: 4 } })
  expect(box.left_top).toEqual({ x: 1, y: 2 })
  expect(box.right_bottom).toEqual({ x: 3, y: 4 })
})

test("fromCoords", () => {
  const box = BBox.coords(1, 2, 3, 4)
  expect(box.left_top).toEqual({ x: 1, y: 2 })
  expect(box.right_bottom).toEqual({ x: 3, y: 4 })
})

test("around", () => {
  const box = BBox.around({ x: 1, y: 1 }, 1)
  expect(box.left_top).toEqual({ x: 0, y: 0 })
  expect(box.right_bottom).toEqual({ x: 2, y: 2 })
})

test("normalize", () => {
  const box = BBox.normalize([
    [1, 2],
    [3, 4],
  ])
  expect(box.left_top).toEqual({ x: 1, y: 2 })
  expect(box.right_bottom).toEqual({ x: 3, y: 4 })
})

test("shift", () => {
  const box = BBox({ x: 1, y: 2 }, { x: 3, y: 4 })
  const box2 = box.translate({ x: 1, y: 1 })
  expect(box2.left_top).toEqual({ x: 2, y: 3 })
  expect(box2.right_bottom).toEqual({ x: 4, y: 5 })
})
test("shiftNegative", () => {
  const box = BBox({ x: 1, y: 2 }, { x: 3, y: 4 })
  const box2 = box.translateNegative({ x: 1, y: 1 })
  expect(box2.left_top).toEqual({ x: 0, y: 1 })
  expect(box2.right_bottom).toEqual({ x: 2, y: 3 })
})

test("size", () => {
  const box = BBox({ x: 1, y: 2 }, { x: 3, y: 4 })
  expect(box.size()).toEqual({ x: 2, y: 2 })
})

test("roundTile", () => {
  const box = BBox({ x: 1.5, y: 2.5 }, { x: 3.5, y: 4.5 })
  const box2 = box.roundTile()
  expect(box2.left_top).toEqual({ x: 1, y: 2 })
  expect(box2.right_bottom).toEqual({ x: 4, y: 5 })
})
test("roundChunk", () => {
  const box = BBox({ x: 1.5, y: 32 }, { x: 33.5, y: 65 })
  const box2 = box.roundChunk()
  expect(box2.left_top).toEqual({ x: 0, y: 32 })
  expect(box2.right_bottom).toEqual({ x: 64, y: 32 * 3 })
})

test("scale", () => {
  const box = BBox({ x: 1, y: 2 }, { x: 3, y: 4 })
  const box2 = box.scale(2)
  expect(box2.left_top).toEqual({ x: 2, y: 4 })
  expect(box2.right_bottom).toEqual({ x: 6, y: 8 })
})

test("expand", () => {
  const box = BBox({ x: 1, y: 2 }, { x: 3, y: 4 })
  const box2 = box.expand(1)
  expect(box2.left_top).toEqual({ x: 0, y: 1 })
  expect(box2.right_bottom).toEqual({ x: 4, y: 5 })
})

test("center", () => {
  const box = BBox({ x: 1, y: 2 }, { x: 3, y: 4 })
  const box2 = box.center()
  expect(box2).toEqual({ x: 2, y: 3 })
})

describe("rotateAboutOrigin()", () => {
  test("north", () => {
    const box = BBox({ x: -1, y: -2 }, { x: 3, y: 4 })
    const box2 = box.rotateAboutOrigin(defines.direction.north)
    expect(box2.left_top).toEqual({ x: -1, y: -2 })
    expect(box2.right_bottom).toEqual({ x: 3, y: 4 })
  })

  test("south", () => {
    const box = BBox({ x: -1, y: -2 }, { x: 3, y: 4 })
    const box2 = box.rotateAboutOrigin(defines.direction.south)
    expect(box2.left_top).toEqual({ x: -3, y: -4 })
    expect(box2.right_bottom).toEqual({ x: 1, y: 2 })
  })

  test("west", () => {
    const box = BBox({ x: -1, y: -2 }, { x: 3, y: 4 })
    const box2 = box.rotateAboutOrigin(defines.direction.west)
    expect(box2.left_top).toEqual({ x: -2, y: -3 })
    expect(box2.right_bottom).toEqual({ x: 4, y: 1 })
  })

  test("east", () => {
    const box = BBox({ x: -1, y: -2 }, { x: 3, y: 4 })
    const box2 = box.rotateAboutOrigin(defines.direction.east)
    expect(box2.left_top).toEqual({ x: -4, y: -1 })
    expect(box2.right_bottom).toEqual({ x: 2, y: 3 })
  })
})

test("iterateTiles", () => {
  const box = BBox({ x: 1, y: 2 }, { x: 3, y: 4 })
  const result = []
  for (const [x, y] of box.iterateTiles()) {
    result.push([x, y])
  }
  expect(result).toEqual([
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
  expect(box3.left_top).toEqual({ x: 2, y: 3 })
  expect(box3.right_bottom).toEqual({ x: 3, y: 4 })
})

test("equals", () => {
  const box = BBox({ x: 1, y: 2 }, { x: 3, y: 4 })
  const box2 = BBox({ x: 1, y: 2 }, { x: 3, y: 4 })
  const box3 = BBox({ x: 1, y: 2 }, { x: 3, y: 5 })
  expect(box.equals(box2)).toBe(true)
  expect(box.equals(box3)).toBe(false)
})

test("isCenteredSquare", () => {
  const box = BBox({ x: 2, y: 3 }, { x: -2, y: -3 })
  expect(box.isCenteredSquare()).toBe(false)
  const box2 = BBox({ x: 2, y: 2 }, { x: -2, y: -2 })
  expect(box2.isCenteredSquare()).toBe(true)
})

test("isCenteredRectangle", () => {
  const box = BBox({ x: 2, y: 4 }, { x: -2, y: -3 })
  expect(box.isCenteredRectangle()).toBe(false)
  const box3 = BBox({ x: 2, y: 3 }, { x: -2, y: -3 })
  expect(box3.isCenteredRectangle()).toBe(true)
})

test("contains", () => {
  const box = BBox({ x: 1, y: 1 }, { x: 4, y: 4 })
  expect(box.contains({ x: 2, y: 3 })).toBe(true)
  expect(box.contains({ x: 2, y: 5 })).toBe(false)
})

test("intersectsNonZeroArea", () => {
  const box = BBox({ x: 1, y: 1 }, { x: 4, y: 4 })
  expect(box.intersectsFully(BBox({ x: 2, y: 3 }, { x: 3, y: 4 }))).toBe(true)
  expect(box.intersectsFully(BBox({ x: 2, y: 5 }, { x: 3, y: 6 }))).toBe(false)
  // only touches
  expect(box.intersectsFully(BBox({ x: 2, y: 4 }, { x: 3, y: 5 }))).toBe(false)
})
