import {
  bind,
  bindN,
  bound,
  Classes,
  ContextualFun,
  Func,
  funcRef,
  reg,
  RegisterClass,
  registerFunctions,
} from "./references"

declare const global: {
  __tbl: object
  __ref: Func<ContextualFun>
  __boundRef: Func<ContextualFun>
  __boundRef2: Func<ContextualFun>
}

describe("classes", () => {
  @RegisterClass("Test Class")
  class TestClass {
    constructor(private readonly value: string) {}

    @bound
    foo() {
      return this.value + "2"
    }
  }

  test("Name registered correctly", () => {
    assert.same("Test Class", Classes.nameOf(TestClass))
  })

  test("Error when registering after load", () => {
    assert.error(() => {
      @RegisterClass("Test Class 2")
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      class TestClass2 {}
    })
  })

  test("class and boundMethod survives reload", () => {
    const instance = new TestClass("1")
    global.__tbl = instance
    global.__ref = reg(instance.foo)

    assert.is_true(global.__tbl instanceof TestClass)
    assert.equal("12", global.__ref("12"))
  }).after_mod_reload(() => {
    assert.is_true(global.__tbl instanceof TestClass)
    assert.equal("12", global.__ref("12"))
  })
})

describe("functions", () => {
  function func(...args: any) {
    return args
  }

  function func2(this: unknown, ...args: unknown[]) {
    return [this, ...args]
  }

  function funcN(this: unknown, ...args: unknown[]) {
    return args
  }
  registerFunctions("test func", { func, func2, funcN })

  test("funcRef", () => {
    const ref = funcRef(func)
    assert.not_function(ref)
    assert.same(["hi"], ref("hi"))
  })

  describe.each(["func", "funcRef", "custom"], "bound func ref with type %s", (type) => {
    test.each([0, 1, 2, 3, 4, 5, 10], "%d args", (n) => {
      const args = Array.from({ length: n }, (_, i) => i)
      const fun =
        type === "func"
          ? funcN
          : type === "funcRef"
          ? funcRef(func)
          : setmetatable({} as any, {
              __call: (thisArg: unknown, ...args: unknown[]) => args,
            })

      const boundFn = bindN(fun, "this", ...args)
      assert.same([...args, 15, 16, 17], boundFn(15, 16, 17))
    })
  })

  test("func ref survives reload", () => {
    global.__ref = funcRef(func)
    global.__boundRef = bind(func2, 2)
    global.__boundRef2 = bind(func2, 2, 1)
    assert.same(["foo"], global.__ref("foo"))
    assert.same([2, "foo"], global.__boundRef("foo"))
    assert.same([2, 1, "foo"], global.__boundRef2("foo"))
  }).after_mod_reload(() => {
    assert.same(["foo"], global.__ref("foo"), "after reload")
    assert.same([2, "foo"], global.__boundRef("foo"), "after reload")
    assert.same([2, 1, "foo"], global.__boundRef2("foo"), "after reload")
  })
})
