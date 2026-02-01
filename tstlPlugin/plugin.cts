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

import * as path from "path"
import * as ts from "typescript"
import * as tstl from "typescript-to-lua"
import {
  getEmitOutDir,
  isCallExpression,
  isTableIndexExpression,
  Plugin,
  TransformationContext,
  Visitors,
} from "typescript-to-lua"
import { createSerialDiagnosticFactory } from "typescript-to-lua/dist/utils"

const invalidAccessSplitCall = createSerialDiagnosticFactory((node: ts.Node) => ({
  file: ts.getOriginalNode(node).getSourceFile(),
  start: ts.getOriginalNode(node).getStart(),
  length: ts.getOriginalNode(node).getWidth(),
  messageText: "This must be called with either a property access or an element access.",
  category: ts.DiagnosticCategory.Error,
}))
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
// noinspection JSUnusedGlobalSymbols
export default function plugin(): Plugin {
  const visitors: Visitors = {
    [ts.SyntaxKind.CallExpression](node: ts.CallExpression, context: TransformationContext) {
      const type = context.checker.getTypeAtLocation(node.expression)
      if (type.getProperty("__accessSplitBrand")) {
        return transformAccessSplitCall(context, node)
      }
      return context.superTransformExpression(node)
    },
    [ts.SyntaxKind.SourceFile](node: ts.SourceFile, context: TransformationContext) {
      const firstStatement = node.statements[0]
      if (
        !(
          context.isModule &&
          firstStatement &&
          ts.isBlock(firstStatement) &&
          (firstStatement as any)?.jsDoc?.[0]?.getText()?.includes("@beforeImports")
        )
      ) {
        return (context.superTransformNode(node) as [tstl.File])[0]
      }
      const [superResult] = context.superTransformNode(ts.factory.updateSourceFile(node, node.statements.slice(1))) as [
        tstl.File,
      ]
      const [block] = context.transformNode(firstStatement) as [tstl.DoStatement]
      superResult.statements.unshift(block)
      return superResult
    },
  }

  const beforeEmit: Plugin["beforeEmit"] = function (program, __, ___, files) {
    if (files.length === 0) return // also if there are errors and noEmitOnError
    for (const file of files) {
      if (file.outputPath.endsWith("lualib_bundle.lua")) {
        file.code = "local coroutine = {} -- temp workaround for tstl bug\n" + file.code
        continue
      }
      const outPath = file.outputPath
      if (!outPath.endsWith(".lua")) continue
      const fileName = path.basename(outPath, ".lua")
      // replace . with - in file name
      const newFileName = fileName.replace(/\./g, "-")
      if (fileName === newFileName) continue
      file.outputPath = path.join(path.dirname(outPath), newFileName + ".lua")
    }
  }

  return {
    visitors,
    beforeEmit,
  }
}
