import { add, get, MutableMap2D, remove } from "./map2d"

let map2d: MutableMap2D<string>

before_each(() => {
  map2d = {}
})

test("add and get", () => {
  add(map2d, 1, 1, "a")
  assert.same(new LuaSet("a"), get(map2d, 1, 1))
})

test("add and get multiple", () => {
  add(map2d, 1, 1, "a")
  add(map2d, 1, 1, "b")
  assert.same(new LuaSet("a", "b"), get(map2d, 1, 1))
})

test("add in multiple coords", () => {
  add(map2d, 1, 1, "a")
  add(map2d, 2, 2, "b")
  assert.same(new LuaSet("a"), get(map2d, 1, 1))
  assert.same(new LuaSet("b"), get(map2d, 2, 2))
})

test("remove and get", () => {
  add(map2d, 1, 1, "a")
  add(map2d, 1, 1, "b")
  remove(map2d, 1, 1, "a")
  assert.same(new LuaSet("b"), get(map2d, 1, 1))
})

test("removes empty entries", () => {
  add(map2d, 1, 1, "a")
  remove(map2d, 1, 1, "a")
  assert.same({}, map2d)
})
