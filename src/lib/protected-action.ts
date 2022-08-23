/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of BBPP3.
 *
 * BBPP3 is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * BBPP3 is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with BBPP3. If not, see <https://www.gnu.org/licenses/>.
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
  if (success) return result as T
  reportUnexpectedError(result)
}

function getErrorWithStacktrace(error: unknown): ErrorWithData {
  const errorToString = tostring(error)
  return [errorToString, debug.traceback(errorToString, 3)]
}

function reportUnexpectedError(error: ErrorWithData): void {
  const [message, traceback] = error
  log(["", "Protected action: unexpected error occurred:\n", traceback])
  game.print([L_Interaction.UnexpectedError, message])
}
