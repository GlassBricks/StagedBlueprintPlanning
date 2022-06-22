import { Pos } from "./position"

test("create", () => {
  const position = Pos(1, 2)
  assert.same({ x: 1, y: 2 }, position)
})

test("from", () => {
  const position = Pos.from({ x: 3, y: 4 })
  assert.equal(5, position.length())
})

test("normalize", () => {
  const position = Pos.normalize([1, 2])
  assert.equal(1, position.x)
  assert.equal(2, position.y)

  const position2 = Pos.normalize({ x: 1, y: 2 })
  assert.equal(1, position2.x)
  assert.equal(2, position2.y)
})

test("plus", () => {
  const position = Pos(1, 2)
  const position2 = Pos(3, 4)
  const position3 = position.plus(position2)
  assert.same({ x: 4, y: 6 }, position3)
})

test("minus", () => {
  const position = Pos(1, 2)
  const position2 = Pos(3, 4)
  const position3 = position.minus(position2)
  assert.same({ x: -2, y: -2 }, position3)
})

test("times", () => {
  const position = Pos(1, 2)
  const position2 = position.times(2)
  assert.same({ x: 2, y: 4 }, position2)
})

test("div", () => {
  const position = Pos(1, 2)
  const position2 = position.div(2)
  assert.same({ x: 0.5, y: 1 }, position2)
})

test("emul", () => {
  const position = Pos(1, 2)
  const position2 = Pos(3, 4)
  const position3 = position.emul(position2)
  assert.same({ x: 3, y: 8 }, position3)
})

test("ediv", () => {
  const position = Pos(1, 2)
  const position2 = Pos(3, 4)
  const position3 = position.ediv(position2)
  assert.same({ x: 1 / 3, y: 0.5 }, position3)
})

test("floor", () => {
  const position = Pos(1.5, 2.5)
  const position2 = position.floor()
  assert.same({ x: 1, y: 2 }, position2)
})

test("ceil", () => {
  const position = Pos(1.5, 2.5)
  const position2 = position.ceil()
  assert.same({ x: 2, y: 3 }, position2)
})

describe("rotateAboutOrigin", () => {
  test("north", () => {
    const position = Pos(1, 2)
    const position2 = position.rotateAboutOrigin(defines.direction.north)
    assert.same({ x: 1, y: 2 }, position2)
  })

  test("south", () => {
    const position = Pos(1, 2)
    const position2 = position.rotateAboutOrigin(defines.direction.south)
    assert.same({ x: -1, y: -2 }, position2)
  })

  test("west", () => {
    const position = Pos(1, 2)
    const position2 = position.rotateAboutOrigin(defines.direction.west)
    assert.same({ x: 2, y: -1 }, position2)
  })

  test("east", () => {
    const position = Pos(1, 2)
    const position2 = position.rotateAboutOrigin(defines.direction.east)
    assert.same({ x: -2, y: 1 }, position2)
  })
})

test("length", () => {
  const position = Pos(3, 4)
  assert.equal(5, position.length())
})

test("equals", () => {
  const position = Pos(1, 2)
  const position2 = { x: 1, y: 2 }
  const position3 = { x: 2, y: 2 }
  assert.is_true(position.equals(position2))
  assert.is_false(position.equals(position3))
})

test("isZero", () => {
  assert.true(Pos(0, 0).isZero())
  assert.false(Pos(1, 0).isZero())
  assert.false(Pos(1, 1).isZero())
})
