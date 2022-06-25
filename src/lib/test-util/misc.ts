export function getPlayer(): LuaPlayer {
  // noinspection LoopStatementThatDoesntLoopJS
  for (const [, player] of pairs(game.players)) {
    return player
  }
  error("Could not find any player")
}

declare global {
  let __TS__sourcemap: Record<string, Record<string, number | Source> | undefined> | undefined
}
export interface Source {
  readonly file?: string
  readonly line?: number
}

function tryUseSourcemap(rawFile: string | undefined, line: number | undefined): Source | undefined {
  if (!rawFile || !line || !__TS__sourcemap) return undefined
  const [fileName] = string.match(rawFile, "@?(%S+)%.lua")
  if (!fileName) return undefined
  const fileSourceMap = __TS__sourcemap[fileName + ".lua"]
  if (!fileSourceMap) return undefined
  const data = fileSourceMap[tostring(line)]
  if (!data) return undefined
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
