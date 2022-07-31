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
