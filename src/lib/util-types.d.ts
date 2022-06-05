// noinspection JSUnusedGlobalSymbols

export type PRecord<K extends keyof any, V> = {
  [P in K]?: V
}
export type RRecord<K extends keyof any, V> = {
  readonly [P in K]: V
}
export type PRRecord<K extends keyof any, V> = {
  readonly [P in K]?: V
}

export type Mutable<T> = {
  -readonly [P in keyof T]: T[P]
}
