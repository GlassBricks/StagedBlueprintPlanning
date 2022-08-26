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

import * as assert from "assert"
import * as path from "path"
import * as ts from "typescript"
import {
  createAssignmentStatement,
  createBooleanLiteral,
  createNilLiteral,
  createStringLiteral,
  createTableExpression,
  createTableFieldExpression,
  createTableIndexExpression,
  File,
  getEmitOutDir,
  getSourceDir,
  isCallExpression,
  isTableIndexExpression,
  LuaLibFeature,
  Plugin,
  TransformationContext,
  Visitors,
} from "typescript-to-lua"
import { transformExpressionList } from "typescript-to-lua/dist/transformation/visitors/expression-list"
import { createSerialDiagnosticFactory } from "typescript-to-lua/dist/utils"

const useNilInstead = createSerialDiagnosticFactory((node: ts.Node) => ({
  file: ts.getOriginalNode(node).getSourceFile(),
  start: ts.getOriginalNode(node).getStart(),
  length: ts.getOriginalNode(node).getWidth(),
  messageText: "Use nil instead of undefined.",
  category: ts.DiagnosticCategory.Warning,
}))
const spreadNotSupported = createSerialDiagnosticFactory((node: ts.Node) => ({
  file: ts.getOriginalNode(node).getSourceFile(),
  start: ts.getOriginalNode(node).getStart(),
  length: ts.getOriginalNode(node).getWidth(),
  messageText: "Spread is not supported in newLuaSet.",
  category: ts.DiagnosticCategory.Error,
}))
const invalidAccessSplitCall = createSerialDiagnosticFactory((node: ts.Node) => ({
  file: ts.getOriginalNode(node).getSourceFile(),
  start: ts.getOriginalNode(node).getStart(),
  length: ts.getOriginalNode(node).getWidth(),
  messageText: "This must be called with either a property access or an element access.",
  category: ts.DiagnosticCategory.Error,
}))

function transformLuaSetNewCall(context: TransformationContext, node: ts.CallExpression) {
  let args = node.arguments ?? []
  if (args.length === 1 && ts.isSpreadElement(args[0]) && ts.isArrayLiteralExpression(args[0].expression)) {
    args = args[0].expression.elements
  }
  if (args.some(ts.isSpreadElement)) {
    context.diagnostics.push(spreadNotSupported(node))
  }

  const expressions = transformExpressionList(context, args)
  return createTableExpression(
    expressions.map((e) => createTableFieldExpression(createBooleanLiteral(true), e)),
    node,
  )
}

// func(a[b]) -> func(a, b)
function transformAccessSplitCall(context: TransformationContext, node: ts.CallExpression) {
  const luaCall = context.superTransformExpression(node)
  if (!isCallExpression(luaCall) || luaCall.params.length !== 1 || !isTableIndexExpression(luaCall.params[0])) {
    context.diagnostics.push(invalidAccessSplitCall(node))
    return luaCall
  }
  const param = luaCall.params[0]
  luaCall.params = [param.table, param.index]

  return luaCall
}

function createPlugin(options: { testPattern?: string }): Plugin {
  const testPattern = options.testPattern ? RegExp(options.testPattern) : undefined
  function getTestFiles(context: TransformationContext) {
    const rootDir = getSourceDir(context.program)
    const sourceFiles = context.program.getSourceFiles()
    const fields = sourceFiles
      .filter((f) => testPattern!.test(f.fileName))
      .map((f) => {
        let filePath = path.relative(rootDir, f.fileName).replace(/\\/g, "/")
        // remove extension
        filePath = filePath.substring(0, filePath.lastIndexOf("."))
        // replace remaining . with -
        filePath = filePath.replace(/\./g, "-")
        return createTableFieldExpression(createStringLiteral(filePath))
      })
    return createTableExpression(fields)
  }
  const visitors: Visitors = {
    [ts.SyntaxKind.DeleteExpression](node: ts.DeleteExpression, context: TransformationContext) {
      const deleteCall = context.superTransformExpression(node)
      assert(isCallExpression(deleteCall))
      // replace with set property to nil
      const table = deleteCall.params[0]
      const key = deleteCall.params[1]
      context.addPrecedingStatements(
        createAssignmentStatement(createTableIndexExpression(table, key), createNilLiteral(), node),
      )
      return createBooleanLiteral(true)
    },
    [ts.SyntaxKind.SourceFile](node, context) {
      const [result] = context.superTransformNode(node) as [File]
      context.usedLuaLibFeatures.delete(LuaLibFeature.Delete) // replaced by above
      return result
    },
    [ts.SyntaxKind.CallExpression](node: ts.CallExpression, context: TransformationContext) {
      // handle special case when call = __getTestFiles(), replace with list of files
      const type = context.checker.getTypeAtLocation(node.expression)
      if (ts.isIdentifier(node.expression)) {
        if (testPattern && node.expression.text === "__getTestFiles") {
          return getTestFiles(context)
        }
        if (node.expression.text === "newLuaSet") {
          if (type.getProperty("__newLuaSetBrand")) {
            return transformLuaSetNewCall(context, node)
          }
        }
      }
      if (type.getProperty("__accessSplitBrand")) {
        return transformAccessSplitCall(context, node)
      }
      return context.superTransformExpression(node)
    },
    [ts.SyntaxKind.Identifier](node: ts.Identifier, context: TransformationContext) {
      if (node.text === "nil") {
        const declaration = context.checker.getSymbolAtLocation(node)?.valueDeclaration
        // check if declaration matches `declare const nil: undefined`
        if (
          declaration &&
          ts.isVariableDeclaration(declaration) &&
          declaration.initializer === undefined &&
          declaration.type !== undefined &&
          context.checker.getTypeFromTypeNode(declaration.type).getFlags() === ts.TypeFlags.Undefined
        ) {
          return createNilLiteral(node)
        }
      }
      if (node.originalKeywordKind === ts.SyntaxKind.UndefinedKeyword) {
        context.diagnostics.push(useNilInstead(node))
      }
      return context.superTransformExpression(node)
    },
  }

  const plugin: Plugin = {
    visitors,
    beforeEmit(program, __, ___, files) {
      if (files.length === 0) return // also if there are errors and noEmitOnError
      for (const file of files) {
        const outPath = file.outputPath
        if (!outPath.endsWith(".lua")) continue
        const fileName = path.basename(outPath, ".lua")
        // replace . with - in file name
        const newFileName = fileName.replace(/\./g, "-")
        if (fileName === newFileName) continue
        file.outputPath = path.join(path.dirname(outPath), newFileName + ".lua")
        if (!testPattern) {
          console.warn(`Replaced ${fileName} with ${newFileName}, but tests are disabled.`)
        }
      }

      if (testPattern) {
        const currentTimestampString = new Date().toLocaleString()
        const outDir = getEmitOutDir(program)
        files.push({
          outputPath: path.join(outDir, "last-compile-time.lua"),
          code: `return ${JSON.stringify(currentTimestampString)}`,
        })
      }
    },
  }
  return plugin
}
// noinspection JSUnusedGlobalSymbols
export default createPlugin
