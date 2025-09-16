// Copyright (c) 2022-2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

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
