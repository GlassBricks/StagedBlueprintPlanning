import { FuncName, Functions } from "./references"
import { mockSetupInTest, simulateOnInit, simulateOnLoad } from "./setup-mock"

before_each(mockSetupInTest)
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
    Functions.get("foo" as FuncName)
  })
})

test("Error when registering after load", () => {
  simulateOnLoad()
  assert.error(() => {
    Functions.registerRaw("foo" as FuncName, () => 0)
  })
})

test("Error when registering after init", () => {
  simulateOnInit()
  assert.error(() => {
    Functions.registerRaw("foo" as FuncName, () => 0)
  })
})
