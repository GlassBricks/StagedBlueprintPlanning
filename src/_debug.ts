// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./declarations/debugadapter.d.ts" />
// eslint-disable-next-line import/no-commonjs
require("__debugadapter__/debugadapter.lua")

declare const __DebugAdapter: DebugAdapter
export const _breakpoint = __DebugAdapter.breakpoint
