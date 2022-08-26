/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of 100% Blueprint Planning.
 *
 * 100% Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * 100% Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with 100% Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

/// <reference types="typescript-to-lua/language-extensions" />

declare const newLuaSet: (<T>(...values: T[]) => LuaSet<T>) & {
  __newLuaSetBrand: any
}

/** Translated directly to nil in lua */
declare const nil: undefined
// declare type nil = undefined

/**
 * Calls to this function must be in the form (a.b) or (a[b]), and will be split into 2 arguments.
 */
type AccessSplit<T extends (this: void, value: any) => any> = T & {
  __accessSplitBrand: any
}
