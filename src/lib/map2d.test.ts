import { map2dAdd, map2dGet, map2dRemove, map2dSize, MutableMap2D } from "./map2d"

let map2d: MutableMap2D<string>

before_each(() => {
  map2d = {}
})

test("add and get", () => {
  map2dAdd(map2d, 1, 1, "a")
  assert.same(newLuaSet("a"), map2dGet(map2d, 1, 1))
})

test("add and get multiple", () => {
  map2dAdd(map2d, 1, 1, "a")
  map2dAdd(map2d, 1, 1, "b")
  assert.same(newLuaSet("a", "b"), map2dGet(map2d, 1, 1))
})

test("add in multiple coords", () => {
  map2dAdd(map2d, 1, 1, "a")
  map2dAdd(map2d, 2, 2, "b")
  assert.same(newLuaSet("a"), map2dGet(map2d, 1, 1))
  assert.same(newLuaSet("b"), map2dGet(map2d, 2, 2))
})

test("remove and get", () => {
  map2dAdd(map2d, 1, 1, "a")
  map2dAdd(map2d, 1, 1, "b")
  map2dRemove(map2d, 1, 1, "a")
  assert.same(newLuaSet("b"), map2dGet(map2d, 1, 1))
})

test("removes empty entries", () => {
  map2dAdd(map2d, 1, 1, "a")
  map2dRemove(map2d, 1, 1, "a")
  assert.same({}, map2d)
})

test("size", () => {
  assert.same(0, map2dSize(map2d))
  map2dAdd(map2d, 1, 1, "a")
  assert.same(1, map2dSize(map2d))
  map2dAdd(map2d, 1, 2, "b")
  assert.same(2, map2dSize(map2d))
  map2dAdd(map2d, 1, 2, "c")
  assert.same(3, map2dSize(map2d))
  map2dAdd(map2d, 1, 2, "b")
  assert.same(3, map2dSize(map2d))
})
