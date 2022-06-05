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
const indexFileName = path.resolve(__dirname, "../node_modules/typed-factorio/index.d.ts")
const classesFileName = path.resolve(__dirname, "../node_modules/typed-factorio/generated/classes.d.ts")
const guiEventsFileName = path.resolve(__dirname, "gui-events.ts")

const program = ts.createProgram({
  rootNames: [classesFileName, indexFileName, guiEventsFileName],
  options: {},
})

function error(msg: string): never {
  throw new Error(msg)
}
const classesFile = program.getSourceFile(classesFileName) ?? error("Could not find classes.d.ts")
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

const normElemTypeNames: Record<string, GuiElementType | "base"> = {}
for (const type of guiElementTypes) {
  normElemTypeNames[normalizeName(type)] = type
}
normElemTypeNames.base = "base"

interface PropDef {
  setter?: string
  type: string
  optional: boolean
}

type TypeDef = Record<string, PropDef>

interface Prop {
  name: string
  type: string
  optional: boolean
  add?: boolean
  element?: boolean | string
}

type SpecDef = Record<string, Prop>

const elementSpecs = {} as Record<GuiElementType | "base", SpecDef>
const styleMods = {} as Record<GuiElementType | "base", SpecDef>
const events = {} as Record<GuiElementType, Record<string, true | string>>
const stateProps = {} as Record<GuiElementType, Record<string, string>>

// read and process types
{
  // from gui.d.ts
  function mapDef(def: ts.InterfaceDeclaration, skipReadonly: boolean): TypeDef {
    const result: TypeDef = {}
    for (const member of def.members) {
      if (!(ts.isPropertySignature(member) || ts.isSetAccessorDeclaration(member))) continue
      const name = (member.name as ts.Identifier).text
      if (ts.isSetAccessorDeclaration(member) && name === "style") continue
      if (skipReadonly && member.modifiers?.some((x) => x.kind === ts.SyntaxKind.ReadonlyKeyword)) continue
      const type = (ts.isPropertySignature(member) ? member.type : member.parameters[0].type)!.getText(classesFile)
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
      if (!elemType) throw new Error(`not recognized spec: ${match[0]} (${matchName})`)
      if (elemType !== "base") capitalized[elemType] = matchName
      results[elemType] = mapDef(def, skipReadonly)
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
    optional: true,
  }
  sliderElem.discrete_slider = {
    setter: "set_slider_discrete_slider",
    type: "double",
    optional: true,
  }
  sliderElem.discrete_value = {
    setter: "set_slider_discrete_value",
    type: "double",
    optional: true,
  }
  sliderElem.minimum_value = {
    setter: "slider_minimum",
    type: "double",
    optional: true,
  }
  sliderElem.maximum_value = {
    setter: "slider_maximum",
    type: "double",
    optional: true,
  }

  // gui events

  for (const def of guiEventsFile.statements) {
    if (!ts.isInterfaceDeclaration(def)) continue
    const name = def.name.text

    const match = name.match(/^(.+?)Events/)
    if (!match) continue
    const matchName = match[1]
    const elemType = normElemTypeNames[normalizeName(matchName)]
    if (!elemType || elemType === "base") throw new Error(`not recognized spec: ${match[0]} (${matchName})`)

    events[elemType] = {}
    stateProps[elemType] = {}
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

    function merge(name: string, prop: Prop) {
      result[name] = Object.assign(result[name] || {}, prop)
    }

    // spec only
    for (const [name, attr] of Object.entries(spec)) {
      merge(name, {
        ...attr,
        name,
        add: true,
      })
    }

    for (const [name, attr] of Object.entries(element)) {
      const specAttr = spec[name]
      const typeName =
        type !== "base" && stateProps[type][name] ? `MaybeMutableState<${attr.type}>` : `MaybeState<${attr.type}>`
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

// propTypes: Record<property, [guiSpecProp, elementProp, event?] | "event">
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
      if (type !== "base" && stateProps[type][name]) {
        value.push(stateProps[type][name])
      }
      set(
        name,
        value.map((x) => x ?? false),
      )
    }
    if (type === "base") continue
    for (const event of Object.keys(events[type])) {
      set(event, "event")
    }
  }
  set("onCreate", null)
  set("styleMod", null)

  void writeFile("propTypes.json", JSON.stringify(result), "json")
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
      if (events && type !== "base")
        for (const [name, value] of Object.entries(events[type as GuiElementType])) {
          if (value !== true) continue
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
          ts.factory.createTypeReferenceNode(toPascalCase(type) + "GuiElementMembers"),
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
