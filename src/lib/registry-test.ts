import { FuncName, Functions } from "./references"

describe("registring", () => {
  let oldGame: LuaGameScript
  before_each(() => {
    oldGame = game
    ;(_G as any).game = undefined!
  })
  after_each(() => {
    ;(_G as any).game = oldGame
  })

  test("Can register function", () => {
    const testFuncName = " -- test -- func --" as FuncName
    const func = () => 0
    Functions.registerRaw(testFuncName, func)
    assert.same(func, Functions.get(testFuncName))
    assert.same(testFuncName, Functions.nameOf(func))
  })

  test("error on duplicate name", () => {
    assert.error(() => {
      Functions.registerRaw("foo" as FuncName, () => 0)
      Functions.registerRaw("foo" as FuncName, () => 0)
    })
  })

  test("error on nonexistent func", () => {
    assert.error(() => {
      Functions.get("foo22" as FuncName)
    })
  })
})
test("Error when registering after load", () => {
  assert.error(() => {
    Functions.registerRaw("foo3" as FuncName, () => 0)
  })
})
