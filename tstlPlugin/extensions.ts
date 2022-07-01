import * as assert from "assert"
import * as path from "path"
import * as ts from "typescript"
import {
  createAssignmentStatement,
  createBlock,
  createBooleanLiteral,
  createCallExpression,
  createForInStatement,
  createIdentifier,
  createNilLiteral,
  createStringLiteral,
  createTableExpression,
  createTableFieldExpression,
  createTableIndexExpression,
  Expression,
  getSourceDir,
  isCallExpression,
  Plugin,
  TransformationContext,
} from "typescript-to-lua"
import { unsupportedBuiltinOptionalCall } from "typescript-to-lua/dist/transformation/utils/diagnostics"
import { getFunctionTypeForCall } from "typescript-to-lua/dist/transformation/utils/typescript"
import { transformExpressionList } from "typescript-to-lua/dist/transformation/visitors/expression-list"
import { transformForInitializer, transformLoopBody } from "typescript-to-lua/dist/transformation/visitors/loops/utils"
import {
  getOptionalContinuationData,
  OptionalContinuation,
  transformOptionalChain,
} from "typescript-to-lua/dist/transformation/visitors/optional-chaining"

const testPattern = /-test\.tsx?$/

function getTestFiles(context: TransformationContext) {
  const rootDir = getSourceDir(context.program)
  const fields = context.program
    .getSourceFiles()
    .filter((f) => testPattern.test(f.fileName))
    .map((f) => {
      const value = path
        .relative(rootDir, f.fileName)
        .replace(/\\/g, "/")
        .substring(0, f.fileName.length - 3)
      return createTableFieldExpression(createStringLiteral(value))
    })
  return createTableExpression(fields)
}

function transformLuaTableAddMethod(
  context: TransformationContext,
  node: ts.CallExpression,
  optionalContinuation: OptionalContinuation | undefined,
) {
  if (optionalContinuation) {
    context.diagnostics.push(unsupportedBuiltinOptionalCall(node))
    return createNilLiteral()
  }
  const args = node.arguments.slice()
  assert(ts.isPropertyAccessExpression(node.expression) || ts.isElementAccessExpression(node.expression))
  args.unshift(node.expression.expression)
  const [table, accessExpression] = transformExpressionList(context, args)
  context.addPrecedingStatements(
    createAssignmentStatement(createTableIndexExpression(table, accessExpression), createBooleanLiteral(true), node),
  )
  return createNilLiteral()
}

function transformLuaSetNewCall(context: TransformationContext, node: ts.NewExpression) {
  const args = node.arguments?.slice() ?? []
  const expressions = transformExpressionList(context, args)
  return createTableExpression(
    expressions.map((e) => createTableFieldExpression(createBooleanLiteral(true), e)),
    node,
  )
}

function wrapInParenthesis(expression: Expression) {
  return createCallExpression(createIdentifier(""), [expression])
}

function transformLuaTableFirstMethod(
  context: TransformationContext,
  node: ts.CallExpression,
  optionalContinuation: OptionalContinuation | undefined,
) {
  if (optionalContinuation) {
    context.diagnostics.push(unsupportedBuiltinOptionalCall(node))
    return createNilLiteral()
  }
  assert(ts.isPropertyAccessExpression(node.expression) || ts.isElementAccessExpression(node.expression))
  const table = context.transformExpression(node.expression.expression)
  return wrapInParenthesis(createCallExpression(createIdentifier("next"), [table], node))
}

const plugin: Plugin = {
  visitors: {
    [ts.SyntaxKind.DeleteExpression]: (node: ts.DeleteExpression, context: TransformationContext) => {
      const deleteCall = context.superTransformExpression(node)
      if (isCallExpression(deleteCall)) {
        // replace with set property to nil
        const table = deleteCall.params[0]
        const key = deleteCall.params[1]
        context.addPrecedingStatements(
          createAssignmentStatement(createTableIndexExpression(table, key), createNilLiteral(), node),
        )
        return createBooleanLiteral(true)
      }
      return deleteCall
    },
    [ts.SyntaxKind.CallExpression]: (node: ts.CallExpression, context: TransformationContext) => {
      // handle special case when call = __getTestFiles(), replace with list of files
      if (ts.isIdentifier(node.expression) && node.expression.text === "__getTestFiles") {
        return getTestFiles(context)
      }

      if (ts.isOptionalChain(node)) {
        return transformOptionalChain(context, node)
      }

      const optionalContinuation = ts.isIdentifier(node.expression)
        ? getOptionalContinuationData(node.expression)
        : undefined

      const type = getFunctionTypeForCall(context, node)
      if (type?.getProperty("__luaTableAddMethodBrand")) {
        return transformLuaTableAddMethod(context, node, optionalContinuation)
      }
      if (type?.getProperty("__luaTableFirstMethodBrand")) {
        return transformLuaTableFirstMethod(context, node, optionalContinuation)
      }
      return context.superTransformExpression(node)
    },
    [ts.SyntaxKind.NewExpression]: (node: ts.NewExpression, context: TransformationContext) => {
      const type = context.checker.getTypeAtLocation(node.expression)
      if (type?.getProperty("__luaSetNewBrand")) {
        return transformLuaSetNewCall(context, node)
      }
      return context.superTransformExpression(node)
    },
    [ts.SyntaxKind.ForOfStatement]: (node: ts.ForOfStatement, context: TransformationContext) => {
      const expression = node.expression
      const exprType = context.checker.getTypeAtLocation(expression)
      // __luaSetIterableBrand
      if (exprType?.getProperty("__luaSetIterableBrand")) {
        const body = createBlock(transformLoopBody(context, node))
        const valueVariable = transformForInitializer(context, node.initializer, body)
        const pairsCall = createCallExpression(createIdentifier("pairs"), [
          context.transformExpression(node.expression),
        ])
        return createForInStatement(body, [valueVariable], [pairsCall], node)
      }
      return context.superTransformStatements(node)
    },
  },
}
// noinspection JSUnusedGlobalSymbols
export default plugin
