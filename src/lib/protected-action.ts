// Copyright (c) 2022-2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { L_Interaction } from "../locale"

export type ErrorWithData = [message: string, traceback: string]

export function protectedAction<R, T, A extends any[]>(
  action: (this: T, ...args: A) => R,
  thisArg: T,
  ...args: A
): R | nil
export function protectedAction<R, A extends any[]>(action: (this: void, ...args: A) => R, ...args: A): R | nil
export function protectedAction<T, A extends any[]>(action: (...args: A) => T, ...args: A): T | nil {
  const [success, result] = xpcall(action, getErrorWithStacktrace, ...args)
  if (success) return result
  reportUnexpectedError(result)
}

export function getErrorWithStacktrace(error: unknown): ErrorWithData {
  // if (__DebugAdapter) __DebugAdapter.breakpoint()
  const errorToString = tostring(error)
  return [errorToString, debug.traceback(errorToString, 3)]
}

function reportUnexpectedError(error: ErrorWithData): void {
  const [message, traceback] = error
  log(["", "Protected action: unexpected error occurred:\n", traceback])
  game.print([L_Interaction.UnexpectedError, message])
}
