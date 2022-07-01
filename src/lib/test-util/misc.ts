export function getPlayer(): LuaPlayer {
  // noinspection LoopStatementThatDoesntLoopJS
  for (const [, player] of pairs(game.players)) {
    return player
  }
  error("Could not find any player")
}

declare global {
  let __TS__sourcemap: Record<string, Record<string, number | Source> | nil> | nil
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
  return typeof data === "number" ? { file: fileName + ".ts", line: data } : data
}

// noinspection JSUnusedGlobalSymbols
export function debugPrint(...values: unknown[]): void {
  const info = debug.getinfo(2, "Sl")!
  const source = tryUseSourcemap(info.source, info.currentline)
  const sourceString = source ? `${source.file}:${source.line ?? 1}` : "<unknown source>"
  const output = values
    .map((value) => (typeof value === "number" || typeof value === "string" ? value.toString() : serpent.block(value)))
    .join(" ")
  const message: LocalisedString = ["", sourceString, ": ", output]
  game?.print(message)
  log(message)
}
