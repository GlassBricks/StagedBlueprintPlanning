import { setupPluginTest } from "./plugin-test-util"
import { testExpression, testFunction, testModule } from "./tstl-test-util"

test("testFiles", () => {
  testModule`
    declare function __getTestFiles(): string[];
    export const result = __getTestFiles();
  `
    .setReturnExport("result")
    .addExtraFile("foo.test.ts", "")
    .addExtraFile("folder/bar.test.tsx", "")
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

test("new lua set", () => {
  testExpression`newLuaSet("foo", "bar")`.tap(setupPluginTest).expectToEqual({
    foo: true,
    bar: true,
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
