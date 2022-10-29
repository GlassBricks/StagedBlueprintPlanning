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

import * as assert from "assert"
import * as child_process from "child_process"
import * as fs from "fs"
import * as path from "path"
import * as prettier from "prettier"
import * as semver from "semver"

const args = process.argv.slice(2)

if (args.length !== 1) {
  console.log("Usage: bump-version.ts <major|minor|patch>")
  process.exit(0)
}

const infoJsonPath = path.join(__dirname, "..", "src/info.json")
interface InfoJson {
  version: string
  [key: string]: unknown
}
const infoJson: InfoJson = JSON.parse(fs.readFileSync(infoJsonPath, "utf8"))
const oldVersion = infoJson.version
const version = semver.parse(oldVersion)
assert(version !== null, "Invalid version in info.json")

switch (args[0]) {
  case "major":
    version.inc("major")
    break
  case "minor":
    version.inc("minor")
    break
  case "patch":
    version.inc("patch")
    break
  default:
    console.log("Usage: bump-version.ts <major|minor|patch>")
    process.exit(0)
}

const changelogPath = path.join(__dirname, "..", "src/changelog.txt")
// split lines
const changelog = fs.readFileSync(changelogPath, "utf8").split("\n")
const expectedLine2 = `Version: ${oldVersion}`
assert(changelog[1] === expectedLine2, `Expected changelog line 2 to be "${expectedLine2}"`)

// write new version

infoJson.version = version.format()
fs.writeFileSync(infoJsonPath, prettier.format(JSON.stringify(infoJson, null, 2), { parser: "json" }))

changelog.splice(1, 1, `Version: ${version.format()}`)
fs.writeFileSync(changelogPath, changelog.join("\n"))

// git add src/info.json changelog.txt
// git commit -m "move to version ${version.format()}"

child_process.execSync(`git add ${infoJsonPath} ${changelogPath}`)
child_process.execSync(`git commit -m "move to version ${version.format()}"`)

console.log(`Bumped version to ${version.format()}`)
