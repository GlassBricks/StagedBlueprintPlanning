/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of BBPP3.
 *
 * BBPP3 is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * BBPP3 is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with BBPP3. If not, see <https://www.gnu.org/licenses/>.
 */

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
