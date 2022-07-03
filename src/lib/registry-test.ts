import { Registry } from "./registry"

let registry: Registry<string>
before_each(() => {
  registry = new Registry("string", (x) => x)
})
describe("registering", () => {
  let oldGame: LuaGameScript

  before_each(() => {
    oldGame = game
    ;(_G as any).game = nil!
  })
  after_each(() => {
    ;(_G as any).game = oldGame
  })

  test("Can register function", () => {
    const testFuncName = "foo"
    registry.registerRaw(testFuncName, "foo")
    assert.same("foo", registry.get(testFuncName))
    assert.same(testFuncName, registry.nameOf("foo"))
  })

  test("error on duplicate name", () => {
    assert.error(() => {
      registry.registerRaw("foo", "bar")
      registry.registerRaw("foo", "baz")
    })
  })

  test("error on nonexistent func", () => {
    assert.error(() => {
      registry.get("foo22")
    })
    assert.error(() => {
      registry.nameOf("foo22")
    })
  })
})
test("Error when registering after load", () => {
  assert.error(() => {
    const registry = new Registry<string>("string", (x) => x)
    registry.registerRaw("foo", "bar")
  })
})
