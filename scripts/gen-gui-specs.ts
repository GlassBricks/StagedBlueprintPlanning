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

import * as fs from "fs"
import * as path from "path"
import * as prettier from "prettier"
import * as ts from "typescript"
import assert = require("node:assert")

type GuiElementType =
  | "choose-elem-button"
  | "drop-down"
  | "empty-widget"
  | "entity-preview"
  | "list-box"
  | "scroll-pane"
  | "sprite-button"
  | "tabbed-pane"
  | "text-box"
  | "button"
  | "camera"
  | "checkbox"
  | "flow"
  | "frame"
  | "label"
  | "line"
  | "minimap"
  | "progressbar"
  | "radiobutton"
  | "slider"
  | "sprite"
  | "switch"
  | "tab"
  | "table"
  | "textfield"

const outDir = path.resolve(__dirname, "../src/lib/factoriojsx")
const guiEventsFileName = path.resolve(__dirname, "gui-events.ts")

const program = ts.createProgram({
  rootNames: [guiEventsFileName],
  options: {
    types: ["typed-factorio/runtime"],
  },
})

function error(msg: string): never {
  throw new Error(msg)
}
const classesFile =
  program.getSourceFiles().find((f) => f.fileName.endsWith("typed-factorio/generated/classes.d.ts")) ??
  error("Could not find classes.d.ts")
const guiEventsFile = program.getSourceFile(guiEventsFileName) ?? error("Could not find gui-events.ts")

const guiElementTypes: (GuiElementType | "base")[] = [
  "base",
  "choose-elem-button",
  "drop-down",
  "empty-widget",
  "entity-preview",
  "list-box",
  "scroll-pane",
  "sprite-button",
  "tabbed-pane",
  "text-box",
  "button",
  "camera",
  "checkbox",
  "flow",
  "frame",
  "label",
  "line",
  "minimap",
  "progressbar",
  "radiobutton",
  "slider",
  "sprite",
  "switch",
  "tab",
  "table",
  "textfield",
]
const capitalized: Record<string, string> = {}
function normalizeName(name: string): string {
  return name.replace(/-/g, "").toLowerCase()
}

const normElemTypeNames: Record<string, GuiElementType | "base" | "other"> = {}
for (const type of guiElementTypes) {
  normElemTypeNames[normalizeName(type)] = type
}
normElemTypeNames.base = "base"
normElemTypeNames.other = "other"

interface TypePropDef {
  setter?: string
  type: string
  optional: boolean
}

type TypeDef = Record<string, TypePropDef>

interface SpecProp {
  name: string
  type: string
  optional: boolean
  add?: boolean
  element?: boolean | string
}

type SpecDef = Record<string, SpecProp>

const elementSpecs = {} as Record<GuiElementType | "base", SpecDef>
const styleMods = {} as Record<GuiElementType | "base", SpecDef>
const events = {} as Record<GuiElementType | "base", Record<string, true | string>>
const stateProps = {} as Record<GuiElementType | "base", Record<string, string>>

// read and process types
{
  // from gui.d.ts
  function mapDef(def: ts.InterfaceDeclaration, elem: string, skipReadonly: boolean): TypeDef {
    const result: TypeDef = {}
    for (const member of def.members) {
      if (!(ts.isPropertySignature(member) || ts.isSetAccessorDeclaration(member))) continue
      const name = (member.name as ts.Identifier).text
      if (ts.isSetAccessorDeclaration(member) && name === "style") continue
      if (skipReadonly && member.modifiers?.some((x) => x.kind === ts.SyntaxKind.ReadonlyKeyword)) continue
      let type = (ts.isPropertySignature(member) ? member.type : member.parameters[0].type)!.getText(classesFile)
      if (name === "type" && type.includes("|")) {
        // replace with elem
        type = `"${elem}"`
      }
      const optional = member.questionToken !== undefined
      result[name] = {
        type,
        optional,
      }
    }
    return result
  }

  const specs = {} as Record<GuiElementType | "base", TypeDef>
  const elements = {} as Record<GuiElementType | "base", TypeDef>
  const styles = {} as Partial<Record<GuiElementType | "base", TypeDef>>

  for (const def of classesFile.statements) {
    if (!ts.isInterfaceDeclaration(def)) continue
    const name = def.name.text

    const tryMatch = (
      regExp: RegExp,
      results: Partial<Record<GuiElementType | "base", TypeDef>>,
      skipReadonly: boolean,
    ) => {
      const match = name.match(regExp)
      if (!match) return
      let matchName = match[1] || match[2]
      if (matchName === "HorizontalFlow" || matchName === "VerticalFlow") return
      if (matchName === "Image") matchName = "Sprite"
      const elemType = normElemTypeNames[normalizeName(matchName)]
      let elemTypes: (GuiElementType | "base")[]
      if (elemType === "other") {
        elemTypes = ["empty-widget", "entity-preview", "tabbed-pane", "label"]
          .map(normalizeName)
          .map((x) => normElemTypeNames[x]) as (GuiElementType | "base")[]
      } else {
        if (!elemType) throw new Error(`not recognized spec: ${match[0]} (${matchName})`)
        if (elemType !== "base") capitalized[elemType] = matchName
        elemTypes = [elemType]
      }
      for (const elem of elemTypes) {
        results[elem] = mapDef(def, elem, skipReadonly)
      }
    }
    tryMatch(/^(.+?)GuiSpec|^Base(ChooseElemButton)Spec/, specs, false)
    tryMatch(/^(.+?)GuiElement/, elements, true)
    tryMatch(/^(?!Lua)(.+?)Style/, styles, true)
  }

  // manual changes
  delete specs.base.index
  delete specs.slider.value // use element slider_value instead
  delete elements.base.tags // make set-only/read-only; else logic with gui events too complicated
  const sliderElem = elements.slider
  sliderElem.value_step = {
    setter: "set_slider_value_step",
    type: "double",
    optional: false,
  }
  sliderElem.discrete_slider = {
    setter: "set_slider_discrete_slider",
    type: "boolean",
    optional: false,
  }
  sliderElem.discrete_values = {
    setter: "set_slider_discrete_values",
    type: "boolean",
    optional: false,
  }
  sliderElem.minimum_value = {
    setter: "slider_minimum",
    type: "double",
    optional: false,
  }
  sliderElem.maximum_value = {
    setter: "slider_maximum",
    type: "double",
    optional: false,
  }

  // gui events

  for (const elemType of guiElementTypes) {
    events[elemType] = {}
    stateProps[elemType] = {}
  }
  for (const def of guiEventsFile.statements) {
    if (!ts.isInterfaceDeclaration(def)) continue
    const name = def.name.text

    const match = name.match(/^(.+?)Events/)
    if (!match) continue
    const matchName = match[1]
    const elemType = normElemTypeNames[normalizeName(matchName)]
    if (!elemType || elemType === "other") throw new Error(`not recognized spec: ${match[0]} (${matchName})`)

    const evs = events[elemType]
    const evProps = stateProps[elemType]
    for (const member of def.members) {
      assert(ts.isPropertySignature(member))
      assert(ts.isLiteralTypeNode(member.type!))
      const name = (member.name as ts.Identifier).text
      if (ts.isStringLiteral(member.type.literal)) {
        const text = member.type.literal.text
        evs[name] = text
        evProps[text] = name
      } else {
        evs[name] = true
      }
    }
  }

  // merge spec and element definitions
  for (const type of guiElementTypes) {
    const spec = specs[type]
    const element = elements[type]
    if (!spec) throw new Error(`Spec def for ${type} not found`)
    if (!elements) throw new Error(`Element def for ${type} not found`)

    const result: SpecDef = {}

    function merge(name: string, prop: SpecProp) {
      result[name] = Object.assign(result[name] || {}, prop)
    }

    // spec only
    for (const [name, attr] of Object.entries(spec)) {
      merge(name, {
        type: attr.type,
        optional: attr.optional,
        name,
        add: true,
      })
    }

    for (const [name, attr] of Object.entries(element)) {
      const specAttr = spec[name]
      let attrType = attr.type
      if (attr.optional) {
        attrType += " | nil"
      }
      const typeName = stateProps[type][name] ? `MaybeMutableState<${attrType}>` : `MaybeState<${attrType}>`
      merge(name, {
        name,
        type: typeName,
        optional: !specAttr || specAttr.optional,
        element: attr.setter ?? true,
      })
    }
    elementSpecs[type] = result

    const style = styles[type]
    if (!style) continue

    const styleResult: SpecDef = {}
    for (const [name, attr] of Object.entries(style)) {
      styleResult[name] = {
        name,
        type: `MaybeState<${attr.type}>`,
        optional: true,
      }
    }
    styleMods[type] = styleResult
  }
  elementSpecs.base.children = {
    name: "children",
    type: "Spec[]",
    optional: true,
  }
}

function getPropName(name: string): string | ts.StringLiteral {
  return name.includes("-") ? ts.factory.createStringLiteral(name) : name
}

function writeFile(filename: string, content: string, parser: prettier.Options["parser"]) {
  fs.writeFileSync(
    path.join(outDir, filename),
    prettier.format(content, {
      parser,
      printWidth: 120,
      semi: false,
    }),
  )
}

function printFile(filename: string, header: string, statements: ts.Statement[]) {
  let content = `// This file was auto-generated by ${path.relative(
    path.resolve(__dirname, ".."),
    __filename,
  )}. Do not edit directly!\n\n`
  content += header
  const printer = ts.createPrinter({
    omitTrailingSemicolon: true,
    newLine: ts.NewLineKind.LineFeed,
  })
  for (const statement of statements) {
    content += printer.printNode(ts.EmitHint.Unspecified, statement, classesFile)
    content += "\n\n"
  }
  writeFile(filename, content, "typescript")
}

// propInfo: Record<property, [guiSpecProp, elementProp, event?] | "event">
{
  const result: Record<string, unknown> = {}

  function set(name: string, value: unknown) {
    if (name in result) {
      if (JSON.stringify(value) !== JSON.stringify(result[name]))
        console.error(
          `Different prop attributes for different gui element types: ${name}` +
            JSON.stringify(value) +
            ", " +
            JSON.stringify(result[name]),
        )
    } else {
      result[name] = value
    }
  }

  for (const type of guiElementTypes) {
    for (const [name, attr] of Object.entries(elementSpecs[type])) {
      const value = [attr.add, attr.element]
      if (!attr.add && !attr.element) {
        set(name, null)
        continue
      }
      if (stateProps[type][name]) {
        value.push(stateProps[type][name])
      }
      set(
        name,
        value.map((x) => x ?? false),
      )
    }
    for (const event of Object.keys(events[type])) {
      set(event, "event")
    }
  }
  set("onCreate", null)
  set("styleMod", null)

  void writeFile("propInfo.json", JSON.stringify(result), "json")
}

// spec-types.d.ts
{
  function toPascalCase(str: string): string {
    return (
      capitalized[str] ??
      str
        .split(/[-_ ]/g)
        .map((str) => str[0].toUpperCase() + str.slice(1))
        .join("")
    )
  }

  const statements: ts.Statement[] = []

  // element spec
  function createMembers(
    name: string,
    from: typeof elementSpecs,
    manualFill: (type: GuiElementType, def: SpecDef) => ts.TypeElement[],
    events?: Record<GuiElementType, Record<string, string | true>>,
    // genHeritageClause?: (type: GuiElementType | "base", def: SpecDef) => ts.ExpressionWithTypeArguments[] | undefined,
  ) {
    for (const [type, def] of Object.entries(from)) {
      const members: ts.TypeElement[] = []
      // all members
      for (const [name, attr] of Object.entries(def)) {
        members.push(
          ts.factory.createPropertySignature(
            undefined,
            getPropName(name),
            attr.optional ? ts.factory.createToken(ts.SyntaxKind.QuestionToken) : undefined,
            ts.factory.createTypeReferenceNode(attr.type),
          ),
        )
      }
      // events
      if (events)
        for (const name of Object.keys(events[type as GuiElementType])) {
          const type = ts.factory.createTypeReferenceNode("GuiEventHandler", [
            ts.factory.createTypeReferenceNode(toPascalCase(name) + "Event"),
          ])
          members.push(
            ts.factory.createPropertySignature(
              undefined,
              getPropName(name),
              ts.factory.createToken(ts.SyntaxKind.QuestionToken),
              type,
            ),
          )
        }
      if (type !== "base") members.push(...manualFill(type as GuiElementType, def))

      // extends BaseElementSpec
      const superTypes = [
        ts.factory.createExpressionWithTypeArguments(ts.factory.createIdentifier("Base" + name), undefined),
      ]
      // if (genHeritageClause) {
      //   const typeElements = genHeritageClause(type as GuiElementType | "base", def)
      //   if (typeElements) {
      //     superTypes.push(...typeElements)
      //   }
      // }
      const heritageClause = ts.factory.createHeritageClause(ts.SyntaxKind.ExtendsKeyword, superTypes)

      statements.push(
        ts.factory.createInterfaceDeclaration(
          undefined,
          [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
          toPascalCase(type) + name,
          undefined,
          type !== "base" ? [heritageClause] : undefined,
          members,
        ),
      )
    }
  }
  createMembers(
    "ElementSpec",
    elementSpecs,
    (type) => [
      ts.factory.createPropertySignature(
        undefined,
        "onCreate",
        ts.factory.createToken(ts.SyntaxKind.QuestionToken),
        ts.factory.createTypeReferenceNode("OnCreateHandler", [
          ts.factory.createTypeReferenceNode(toPascalCase(type) + "GuiElement"),
        ]),
      ),
      ts.factory.createPropertySignature(
        undefined,
        "styleMod",
        ts.factory.createToken(ts.SyntaxKind.QuestionToken),
        ts.factory.createTypeReferenceNode((type in styleMods ? toPascalCase(type) : "Base") + "StyleMod"),
      ),
    ],
    events,
  )
  statements.push(
    ts.factory.createTypeAliasDeclaration(
      undefined,
      [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
      "ElementSpec",
      undefined,
      ts.factory.createUnionTypeNode(
        guiElementTypes.slice(1).map((type) => ts.factory.createTypeReferenceNode(`${toPascalCase(type)}ElementSpec`)),
      ),
    ),
  )
  createMembers("StyleMod", styleMods, () => [])

  const header = `
  import { MaybeMutableState, MaybeState } from "../observable"
  import { GuiEventHandler, OnCreateHandler, Spec } from "./spec"

`
  printFile("element-specs.d.ts", header, statements)
}
