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
