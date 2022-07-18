/// <reference types="typescript-to-lua/language-extensions" />

declare const newLuaSet: (<T>(...values: T[]) => LuaSet<T>) & {
  __newLuaSetBrand: any
}

/** Translated directly to nil in lua */
declare const nil: nil
declare type nil = undefined
