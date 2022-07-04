import { map2dAdd, map2dGet, map2dRemove, MutableMap2D } from "./map2d"

let map2d: MutableMap2D<string>

before_each(() => {
  map2d = {}
})

test("add and get", () => {
  map2dAdd(map2d, 1, 1, "a")
  assert.same(new LuaSet("a"), map2dGet(map2d, 1, 1))
})

test("add and get multiple", () => {
  map2dAdd(map2d, 1, 1, "a")
  map2dAdd(map2d, 1, 1, "b")
  assert.same(new LuaSet("a", "b"), map2dGet(map2d, 1, 1))
})

test("add in multiple coords", () => {
  map2dAdd(map2d, 1, 1, "a")
  map2dAdd(map2d, 2, 2, "b")
  assert.same(new LuaSet("a"), map2dGet(map2d, 1, 1))
  assert.same(new LuaSet("b"), map2dGet(map2d, 2, 2))
})

test("remove and get", () => {
  map2dAdd(map2d, 1, 1, "a")
  map2dAdd(map2d, 1, 1, "b")
  map2dRemove(map2d, 1, 1, "a")
  assert.same(new LuaSet("b"), map2dGet(map2d, 1, 1))
})

test("removes empty entries", () => {
  map2dAdd(map2d, 1, 1, "a")
  map2dRemove(map2d, 1, 1, "a")
  assert.same({}, map2d)
})
