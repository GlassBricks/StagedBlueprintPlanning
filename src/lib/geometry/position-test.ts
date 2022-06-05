import { pos } from "./position"
import { DOWN, LEFT, RIGHT, UP } from "./rotation"

test("create", () => {
  const position = pos(1, 2)
  assert.same({ x: 1, y: 2 }, position)
})

test("from", () => {
  const position = pos.from({ x: 3, y: 4 })
  assert.equal(5, position.length())
})

test("normalize", () => {
  const position = pos.normalize([1, 2])
  assert.equal(1, position.x)
  assert.equal(2, position.y)

  const position2 = pos.normalize({ x: 1, y: 2 })
  assert.equal(1, position2.x)
  assert.equal(2, position2.y)
})

test("add", () => {
  const position = pos(1, 2)
  const position2 = pos(3, 4)
  const position3 = position.add(position2)
  assert.same({ x: 4, y: 6 }, position3)
})

test("sub", () => {
  const position = pos(1, 2)
  const position2 = pos(3, 4)
  const position3 = position.sub(position2)
  assert.same({ x: -2, y: -2 }, position3)
})

test("times", () => {
  const position = pos(1, 2)
  const position2 = position.times(2)
  assert.same({ x: 2, y: 4 }, position2)
})

test("div", () => {
  const position = pos(1, 2)
  const position2 = position.div(2)
  assert.same({ x: 0.5, y: 1 }, position2)
})

test("emul", () => {
  const position = pos(1, 2)
  const position2 = pos(3, 4)
  const position3 = position.emul(position2)
  assert.same({ x: 3, y: 8 }, position3)
})

test("ediv", () => {
  const position = pos(1, 2)
  const position2 = pos(3, 4)
  const position3 = position.ediv(position2)
  assert.same({ x: 1 / 3, y: 0.5 }, position3)
})

test("floor", () => {
  const position = pos(1.5, 2.5)
  const position2 = position.floor()
  assert.same({ x: 1, y: 2 }, position2)
})

test("ceil", () => {
  const position = pos(1.5, 2.5)
  const position2 = position.ceil()
  assert.same({ x: 2, y: 3 }, position2)
})

describe("rotateAboutOrigin", () => {
  test("north", () => {
    const position = pos(1, 2)
    const position2 = position.rotateAboutOrigin(UP)
    assert.same({ x: 1, y: 2 }, position2)
  })

  test("south", () => {
    const position = pos(1, 2)
    const position2 = position.rotateAboutOrigin(DOWN)
    assert.same({ x: -1, y: -2 }, position2)
  })

  test("west", () => {
    const position = pos(1, 2)
    const position2 = position.rotateAboutOrigin(LEFT)
    assert.same({ x: 2, y: -1 }, position2)
  })

  test("east", () => {
    const position = pos(1, 2)
    const position2 = position.rotateAboutOrigin(RIGHT)
    assert.same({ x: -2, y: 1 }, position2)
  })
})

test("length", () => {
  const position = pos(3, 4)
  assert.equal(5, position.length())
})

test("equals", () => {
  const position = pos(1, 2)
  const position2 = { x: 1, y: 2 }
  const position3 = { x: 2, y: 2 }
  assert.is_true(position.equals(position2))
  assert.is_false(position.equals(position3))
})

test("isZero", () => {
  assert.true(pos(0, 0).isZero())
  assert.false(pos(1, 0).isZero())
  assert.false(pos(1, 1).isZero())
})
