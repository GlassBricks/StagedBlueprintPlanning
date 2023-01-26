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

// noinspection JSUnusedGlobalSymbols

export type PRecord<K extends keyof any, V> = {
  [P in K]?: V
}
export type PRRecord<K extends keyof any, V> = {
  readonly [P in K]?: V
}

export type Mutable<T> = {
  -readonly [P in keyof T]: T[P]
}

export type WithMetatable<T, M> = T & {
  [P in keyof M]: M[P] extends (self: T, ...args: infer A) => infer R ? (this: T, ...args: A) => R : M[P]
}
