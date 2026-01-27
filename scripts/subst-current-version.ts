/*
 * Copyright (c) 2024 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

// find all .ts or .tsx files in ../src, recursively, except in src/control.ts
// get current version from src/info.json/src/info.json -> "version"
// replace all occurrences of $CURRENT_VERSION with the current version

// git add all changed files
import * as child_process from "child_process"
import * as fsp from "fs/promises"
import * as path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const srcDir = path.join(__dirname, "..", "src")
const infoJsonPath = path.join(srcDir, "info.json")
const infoJson = fsp.readFile(infoJsonPath, "utf-8").then((content) => {
  return `"${JSON.parse(content).version}"`
})

const files = fsp.glob(["**/*.ts", "**/*.tsx"], {
  cwd: srcDir,
  exclude: (name) => name === "control.ts" || name === "node_modules",
})

async function replaceInFile(file: string): Promise<string | undefined> {
  const content = await fsp.readFile(file, "utf-8")
  const newContent = content.replace(/\$CURRENT_VERSION/g, await infoJson)
  if (content !== newContent) {
    await fsp.writeFile(file, newContent, "utf-8")
    return file
  }
}

const promises: Promise<string | undefined>[] = []
for await (const file of files) {
  promises.push(replaceInFile(path.join(srcDir, file)))
}
const filesChanged = (await Promise.all(promises)).filter((file) => file !== undefined)
console.log(filesChanged)

if (filesChanged.length > 0) {
  child_process.execSync(`git add ${filesChanged.join(" ")}`)
}
