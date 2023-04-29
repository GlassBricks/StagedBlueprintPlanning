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

function getErrorWithStacktrace(error: unknown): ErrorWithData {
  // if (__DebugAdapter) __DebugAdapter.breakpoint()
  const errorToString = tostring(error)
  return [errorToString, debug.traceback(errorToString, 3)]
}

function reportUnexpectedError(error: ErrorWithData): void {
  const [message, traceback] = error
  log(["", "Protected action: unexpected error occurred:\n", traceback])
  game.print([L_Interaction.UnexpectedError, message])
}
