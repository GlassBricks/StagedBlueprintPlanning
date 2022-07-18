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

export type Building<T> = {
  -readonly [P in keyof T]?: T[keyof T]
}

export type WithMetatable<T, M> = T & {
  [P in keyof M]: M[P] extends (self: T, ...args: infer A) => infer R ? (this: T, ...args: A) => R : M[P]
}
