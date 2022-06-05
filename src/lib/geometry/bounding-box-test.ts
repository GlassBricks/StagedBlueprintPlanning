import { bbox } from "./bounding-box"
import { DOWN, LEFT, RIGHT, UP } from "./rotation"

test("create", () => {
  const box = bbox({ x: 1, y: 2 }, { x: 3, y: 4 })
  assert.same({ x: 1, y: 2 }, box.left_top)
  assert.same({ x: 3, y: 4 }, box.right_bottom)
})

test("from", () => {
  const box = bbox.from({ left_top: { x: 1, y: 2 }, right_bottom: { x: 3, y: 4 } })
  assert.same({ x: 1, y: 2 }, box.left_top)
  assert.same({ x: 3, y: 4 }, box.right_bottom)
})

test("fromCoords", () => {
  const box = bbox.fromCoords(1, 2, 3, 4)
  assert.same({ x: 1, y: 2 }, box.left_top)
  assert.same({ x: 3, y: 4 }, box.right_bottom)
})

test("around", () => {
  const box = bbox.around({ x: 1, y: 1 }, 1)
  assert.same({ x: 0, y: 0 }, box.left_top)
  assert.same({ x: 2, y: 2 }, box.right_bottom)
})

test("normalize", () => {
  const box = bbox.normalize([
    [1, 2],
    [3, 4],
  ])
  assert.same({ x: 1, y: 2 }, box.left_top)
  assert.same({ x: 3, y: 4 }, box.right_bottom)
})

test("shift", () => {
  const box = bbox({ x: 1, y: 2 }, { x: 3, y: 4 })
  const box2 = box.shift({ x: 1, y: 1 })
  assert.same({ x: 2, y: 3 }, box2.left_top)
  assert.same({ x: 4, y: 5 }, box2.right_bottom)
})
test("shiftNegative", () => {
  const box = bbox({ x: 1, y: 2 }, { x: 3, y: 4 })
  const box2 = box.shiftNegative({ x: 1, y: 1 })
  assert.same({ x: 0, y: 1 }, box2.left_top)
  assert.same({ x: 2, y: 3 }, box2.right_bottom)
})

test("size", () => {
  const box = bbox({ x: 1, y: 2 }, { x: 3, y: 4 })
  assert.same({ x: 2, y: 2 }, box.size())
})

test("roundTile", () => {
  const box = bbox({ x: 1.5, y: 2.5 }, { x: 3.5, y: 4.5 })
  const box2 = box.roundTile()
  assert.same({ x: 1, y: 2 }, box2.left_top)
  assert.same({ x: 4, y: 5 }, box2.right_bottom)
})

test("roundTileConservative", () => {
  const box = bbox({ x: 0.9, y: 2.5 }, { x: 3.5, y: 4.1 })
  const box2 = box.roundTileConservative()
  assert.same({ x: 1, y: 2 }, box2.left_top)
  assert.same({ x: 4, y: 4 }, box2.right_bottom)
})

test("scale", () => {
  const box = bbox({ x: 1, y: 2 }, { x: 3, y: 4 })
  const box2 = box.scale(2)
  assert.same({ x: 2, y: 4 }, box2.left_top)
  assert.same({ x: 6, y: 8 }, box2.right_bottom)
})

test("expand", () => {
  const box = bbox({ x: 1, y: 2 }, { x: 3, y: 4 })
  const box2 = box.expand(1)
  assert.same({ x: 0, y: 1 }, box2.left_top)
  assert.same({ x: 4, y: 5 }, box2.right_bottom)
})

test("center", () => {
  const box = bbox({ x: 1, y: 2 }, { x: 3, y: 4 })
  const box2 = box.center()
  assert.same({ x: 2, y: 3 }, box2)
})

describe("rotateAboutOrigin", () => {
  test("north", () => {
    const box = bbox({ x: -1, y: -2 }, { x: 3, y: 4 })
    const box2 = box.rotateAboutOrigin(UP)
    assert.same({ x: -1, y: -2 }, box2.left_top)
    assert.same({ x: 3, y: 4 }, box2.right_bottom)
  })

  test("south", () => {
    const box = bbox({ x: -1, y: -2 }, { x: 3, y: 4 })
    const box2 = box.rotateAboutOrigin(DOWN)
    assert.same({ x: -3, y: -4 }, box2.left_top)
    assert.same({ x: 1, y: 2 }, box2.right_bottom)
  })

  test("west", () => {
    const box = bbox({ x: -1, y: -2 }, { x: 3, y: 4 })
    const box2 = box.rotateAboutOrigin(LEFT)
    assert.same({ x: -2, y: -3 }, box2.left_top)
    assert.same({ x: 4, y: 1 }, box2.right_bottom)
  })

  test("east", () => {
    const box = bbox({ x: -1, y: -2 }, { x: 3, y: 4 })
    const box2 = box.rotateAboutOrigin(RIGHT)
    assert.same({ x: -4, y: -1 }, box2.left_top)
    assert.same({ x: 2, y: 3 }, box2.right_bottom)
  })
})

test("iterateTiles", () => {
  const box = bbox({ x: 1, y: 2 }, { x: 3, y: 4 })
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
  const box = bbox({ x: 1, y: 2 }, { x: 3, y: 4 })
  const box2 = bbox({ x: 2, y: 3 }, { x: 4, y: 5 })
  const box3 = box.intersect(box2)
  assert.same({ x: 2, y: 3 }, box3.left_top)
  assert.same({ x: 3, y: 4 }, box3.right_bottom)
})

test("equals", () => {
  const box = bbox({ x: 1, y: 2 }, { x: 3, y: 4 })
  const box2 = bbox({ x: 1, y: 2 }, { x: 3, y: 4 })
  const box3 = bbox({ x: 1, y: 2 }, { x: 3, y: 5 })
  assert.true(box.equals(box2))
  assert.false(box.equals(box3))
})

test("isCenteredSquare", () => {
  const box = bbox({ x: 2, y: 3 }, { x: -2, y: -3 })
  assert.is_false(box.isCenteredSquare())
  const box2 = bbox({ x: 2, y: 2 }, { x: -2, y: -2 })
  assert.is_true(box2.isCenteredSquare())
})

test("isCenteredRectangle", () => {
  const box = bbox({ x: 2, y: 4 }, { x: -2, y: -3 })
  assert.is_false(box.isCenteredRectangle())
  const box3 = bbox({ x: 2, y: 3 }, { x: -2, y: -3 })
  assert.is_true(box3.isCenteredRectangle())
})

test("contains", () => {
  const box = bbox({ x: 1, y: 1 }, { x: 4, y: 4 })
  assert.is_true(box.contains({ x: 2, y: 3 }))
  assert.is_false(box.contains({ x: 2, y: 5 }))
})

test("intersectsNonZeroArea", () => {
  const box = bbox({ x: 1, y: 1 }, { x: 4, y: 4 })
  assert.is_true(box.intersectsNonZeroArea(bbox({ x: 2, y: 3 }, { x: 3, y: 4 })))
  assert.is_false(box.intersectsNonZeroArea(bbox({ x: 2, y: 5 }, { x: 3, y: 6 })))
  // only touches
  assert.is_false(box.intersectsNonZeroArea(bbox({ x: 2, y: 4 }, { x: 3, y: 5 })))
})
