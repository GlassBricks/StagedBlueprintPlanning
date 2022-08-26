/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of 100% Blueprint Planning.
 *
 * 100% Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * 100% Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with 100% Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import path = require("path")
import * as fs from "fs"
import { LuaTarget } from "typescript-to-lua"
import { TapCallback, TestBuilder } from "./tstl-test-util"

const srcDir = path.resolve(__dirname, "..")

let declFileContents: Record<string, string> | undefined
function getDeclFileContents(): Record<string, string> {
  if (!declFileContents) {
    declFileContents = {}
    const files = fs.readdirSync(srcDir).filter((file) => file.endsWith(".d.ts"))
    for (const file of files) {
      const filePath = path.join(srcDir, file)
      declFileContents[filePath] = fs.readFileSync(filePath, "utf8")
    }
  }
  return declFileContents
}

let pluginFiles: string[] | undefined
function getPluginFiles(): string[] {
  if (!pluginFiles) {
    pluginFiles = fs
      .readdirSync(srcDir)
      .filter((file) => file.endsWith("-plugin.ts"))
      .map((file) => path.join(srcDir, file))
  }
  return pluginFiles
}

export const setupPluginTest: TapCallback = (builder: TestBuilder) => {
  builder.withLanguageExtensions().setOptions({
    strict: true,
    luaTarget: LuaTarget.Lua52,
    luaPlugins: getPluginFiles().map((name) => ({ name })),
  })
  for (const [name, content] of Object.entries(getDeclFileContents())) {
    builder.addExtraFile(name, content)
  }
}
