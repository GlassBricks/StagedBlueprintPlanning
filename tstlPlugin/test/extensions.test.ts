import { setupPluginTest } from "./plugin-test-util"
import { testFunction, testModule } from "./tstl-test-util"

test("testFiles", () => {
  testModule`
    declare function __getTestFiles(): string[];
    export const result = __getTestFiles();
  `
    .setReturnExport("result")
    .addExtraFile("foo-test.ts", "")
    .addExtraFile("folder/bar-test.tsx", "")
    .tap(setupPluginTest)
    .expectToHaveNoDiagnostics()
    .expectToEqual(["foo-test", "folder/bar-test"])
})

test("delete expression", () => {
  testFunction`
    const foo: { bar?: string } = { bar: "baz" };
    const retValue = delete foo.bar;
    return { retValue, foo };
  `
    .tap(setupPluginTest)
    .expectToMatchJsResult()
    .tap((builder) => {
      const lua = builder.getMainLuaCodeChunk()
      expect(lua).not.toContain("lualib_bundle")
    })
})

describe("LuaSet", () => {
  test("new", () => {
    testFunction`
      return new LuaSet();
    `
      .tap(setupPluginTest)
      .expectToEqual([])
  })

  test("new with args", () => {
    testFunction`
      return new LuaSet("one", "two", "three");
    `
      .tap(setupPluginTest)
      .expectToEqual({
        one: true,
        two: true,
        three: true,
      })
  })

  test("add", () => {
    testFunction`
      const set = new LuaSet();
      set.add("one");
      return set;
    `
      .tap(setupPluginTest)
      .expectToEqual({
        one: true,
      })
  })

  test("delete", () => {
    testFunction`
      const set = new LuaSet();
      set.add("one");
      set.add("two");
      set.delete("one");
      return set;
    `
      .tap(setupPluginTest)
      .expectToEqual({
        two: true,
      })
  })

  test("first on empty set", () => {
    testFunction`
      const set = new LuaSet();
      return set.first();
    `
      .tap(setupPluginTest)
      .expectToEqual(undefined)
  })

  test("first on set with one element", () => {
    testFunction`
      const set = new LuaSet("one");
      return set.first();
    `
      .tap(setupPluginTest)
      .expectToEqual("one")
  })

  test("for of", () => {
    testFunction`
      const result: Record<string, true> = {}
      const set = new LuaSet("one", "two", "three")
      for (const el of set) {
        result[el] = true
      }
      return result;
    `
      .tap(setupPluginTest)
      .expectToEqual({
        one: true,
        two: true,
        three: true,
      })
  })
})

test("nil", () => {
  testFunction`
    return nil;
  `
    .tap(setupPluginTest)
    .expectToEqual(undefined)
})

test("nil as other identifier", () => {
  testFunction`
    const nil = 3;
    return nil;
  `
    .tap(setupPluginTest)
    .expectToEqual(3)
})
