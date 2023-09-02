/*
 * Copyright (c) 2022-2023 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import * as assert from "assert"
import * as fs from "fs"
import * as path from "path"
import { dirname } from "path"
import { format } from "prettier"
import ts from "typescript"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))

function toPascalCase(str: string): string {
  return str
    .split(/[^a-zA-Z\d]/)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("")
}

const source = path.join(__dirname, "../src/locale/en/en.cfg")
function parseConfig(file: string): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {}
  let currentContent: Record<string, string> = {}

  const lines = fs.readFileSync(file, "utf8").split("\n")
  for (const line of lines) {
    if (line.startsWith("#")) continue
    if (line.startsWith("[")) {
      assert.ok(line.endsWith("]"))
      const key = line.slice(1, -1)
      result[key] = currentContent = {}
    }
    if (line.includes("=")) {
      const index = line.indexOf("=")
      const key = line.slice(0, index)
      currentContent[key] = line.slice(index + 1)
    }
  }

  return result
}

const config = parseConfig(source)

const enumDeclarations: ts.EnumDeclaration[] = []

for (const [section, items] of Object.entries(config)) {
  const statements: ts.EnumMember[] = []
  for (const [key, value] of Object.entries(items)) {
    const valueName = `${section}.${key}`
    const propName = toPascalCase(key.slice(key.indexOf(":") + 1))
    const member = ts.factory.createEnumMember(propName, ts.factory.createStringLiteral(valueName))
    ts.addSyntheticLeadingComment(member, ts.SyntaxKind.MultiLineCommentTrivia, `* ${value} `, true)
    statements.push(member)
  }

  // remove part before first dot, if any
  let sectionName = section
  const firstDot = sectionName.indexOf(".")
  if (firstDot > -1) {
    sectionName = sectionName.substring(firstDot + 1)
  }

  const decl = ts.factory.createEnumDeclaration(
    [
      ts.factory.createModifier(ts.SyntaxKind.ExportKeyword),
      ts.factory.createModifier(ts.SyntaxKind.DeclareKeyword),
      ts.factory.createModifier(ts.SyntaxKind.ConstKeyword),
    ],
    "L_" + toPascalCase(sectionName),
    statements,
  )
  enumDeclarations.push(decl)
}

const sourceFile = ts.factory.createSourceFile(
  enumDeclarations,
  ts.factory.createToken(ts.SyntaxKind.EndOfFileToken),
  ts.NodeFlags.None,
)

const printer = ts.createPrinter()
const printResult = printer.printNode(ts.EmitHint.Unspecified, sourceFile, sourceFile)
const header = "// Generated by gen-locale-defs.ts\n// noinspection JSUnusedGlobalSymbols\n\n"
const result = await format(header + printResult, {
  parser: "typescript",
  printWidth: 120,
  semi: false,
})

const outfile = path.join(__dirname, "../src/locale.d.ts")
fs.writeFileSync(outfile, result)
