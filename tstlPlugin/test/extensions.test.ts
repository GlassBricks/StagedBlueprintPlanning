/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { setupPluginTest } from "./plugin-test-util"
import { testExpression, testFunction, testModule } from "./tstl-test-util"

test("testFiles", () => {
  testModule`
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

test("access split", () => {
  testFunction`// noinspection TypeScriptValidateTypes

  function foo(this: void, a: any, b: any) {
    return [a, b];
  }
  const foo2 = foo as (AccessSplit<(this: void, a: any) => any>)
  const baz = { a: 1 }
  return foo2(baz.a)
  `
    .tap(setupPluginTest)
    .expectToEqual([{ a: 1 }, "a"])
})

test("assume", () => {
  testFunction`
    const foo: unknown = { bar: "baz" };
    assume<{ bar: string }>(foo);
    return foo.bar;
  `
    .tap(setupPluginTest)
    .expectToEqual("baz")
})

test("keys", () => {
  testFunction`
    interface Foo {
      a: string;
      b: number;
    }
    return keys<Foo>();
  `
    .tap(setupPluginTest)
    .expectToEqual(["a", "b"])
})
