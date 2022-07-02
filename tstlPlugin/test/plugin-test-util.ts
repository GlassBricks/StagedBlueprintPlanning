import path = require("path")
import * as fs from "fs"
import { LuaTarget } from "typescript-to-lua"
import { TapCallback, TestBuilder } from "./tstl-test-util"

const declFiles = ["extensions.d.ts"]

let declFileContents: Record<string, string> | undefined

function getDeclFileContents(): Record<string, string> {
  if (declFileContents) return declFileContents
  declFileContents = {}
  for (const file of declFiles) {
    const absolutePath = path.resolve(__dirname, "../../src/declarations", file)
    declFileContents[file] = fs.readFileSync(absolutePath, "utf8")
  }
  return declFileContents
}

const pluginFiles = ["extensions.ts"].map((name) => path.resolve(__dirname, "..", name))

export const setupPluginTest: TapCallback = (builder: TestBuilder) => {
  builder.withLanguageExtensions().setOptions({
    strict: true,
    luaTarget: LuaTarget.Lua52,
    luaPlugins: pluginFiles.map((name) => ({ name })),
  })
  for (const [name, content] of Object.entries(getDeclFileContents())) {
    builder.addExtraFile(name, content)
  }
}
