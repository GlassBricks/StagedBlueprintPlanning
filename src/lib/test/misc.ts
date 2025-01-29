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

import { LocalisedString, LuaPlayer } from "factorio:runtime"

export function getPlayer(): LuaPlayer {
  return game.players[1]
}

declare global {
  let __TS__sourcemap: Record<string, Record<string, number | Source> | nil> | nil
}
declare const storage: {
  __lastDebugPrintCall: string | nil
}
export interface Source {
  readonly file?: string
  readonly line?: number
}

function tryUseSourcemap(rawFile: string | nil, line: number | nil): Source | nil {
  if (!rawFile || !line || !__TS__sourcemap) return nil
  const [fileName] = string.match(rawFile, "@?(%S+)%.lua")
  if (!fileName) return nil
  const fileSourceMap = __TS__sourcemap[fileName + ".lua"]
  if (!fileSourceMap) return nil
  const data = fileSourceMap[tostring(line)]
  if (!data) return nil
  return typeof data == "number" ? { file: fileName + ".ts", line: data } : data
}

export function getCallerSource(): Source | nil {
  const info = debug.getinfo(3, "Sl")!
  return tryUseSourcemap(info.source, info.currentline)
}

export function debugPrint(...values: unknown[]): void {
  const source = getCallerSource()
  const sourceString = source ? `${source.file}:${source.line ?? 1}` : "<unknown source>"
  const valueStrings = []
  for (const i of $range(1, select("#", ...values))) {
    const value = values[i - 1]
    valueStrings[i - 1] =
      typeof value == "number" || typeof value == "string"
        ? value.toString()
        : serpent.block(value, {
            maxlevel: 5,
            nocode: true,
          })
  }

  storage.__lastDebugPrintCall = sourceString

  const message: LocalisedString = ["", sourceString, ": ", valueStrings.join(", ")]
  game?.print(message, {
    sound: defines.print_sound.never,
    skip: defines.print_skip.never,
  })
  log(message)
}

export function getLastDebugPrintCall(): string | nil {
  const res = storage.__lastDebugPrintCall
  storage.__lastDebugPrintCall = nil
  return res
}

// noinspection JSUnusedGlobalSymbols
export function pauseTest(): void {
  game.tick_paused = true
  game.speed = 1
  async(1)
}
