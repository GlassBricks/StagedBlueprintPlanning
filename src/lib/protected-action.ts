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

export type UserError = ["b2p2:_user_error", LocalisedString, "print" | "flying-text"]

export function raiseUserError(message: LocalisedString, reportMethod: "print" | "flying-text"): never {
  throw ["b2p2:_user_error", message, reportMethod]
}

export function isUserError(obj: unknown): obj is UserError {
  return Array.isArray(obj) && obj[0] === "b2p2:_user_error" && obj.length === 3
}

export type UnexpectedError = [message: string, traceback: string]

export function protectedAction<R, T, A extends any[]>(
  player: PlayerIdentification,
  action: (this: T, ...args: A) => R,
  thisArg: T,
  ...args: A
): R | nil
export function protectedAction<R, A extends any[]>(
  player: PlayerIdentification,
  action: (this: void, ...args: A) => R,
  ...args: A
): R | nil
export function protectedAction<T, A extends any[]>(
  player: PlayerIdentification,
  action: (...args: A) => T,
  ...args: A
): T | nil {
  const [success, result] = xpcall(action, getErrorWithStacktrace, ...args)
  if (success) return result as T

  player = typeof player === "object" ? player : game.get_player(player)!
  const error: UserError | UnexpectedError = result
  if (isUserError(error)) {
    const [, message, reportMethod] = error
    if (reportMethod === "print") {
      player.print(message)
    } else {
      player.create_local_flying_text({
        text: message,
        create_at_cursor: true,
      })
    }
  } else {
    reportUnexpectedError(error, player)
  }
}

function getErrorWithStacktrace(error: unknown): UserError | UnexpectedError {
  if (isUserError(error)) return error as UserError
  const errorToString = tostring(error)
  return [errorToString, debug.traceback(errorToString, 2)]
}

function reportUnexpectedError(error: UnexpectedError, player: LuaPlayer): void {
  const [message, traceback] = error
  log(["", "Unexpected error occurred running protected action:\n", traceback])
  player.print([L_Interaction.UnexpectedError, message])
}
