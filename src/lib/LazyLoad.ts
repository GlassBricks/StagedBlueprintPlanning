/*
 * Copyright (c) 2023 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */
// export abstract class LazyLoad<T> implements LuaMetatable<T>, T {
//   protected abstract load(): T
//
//   private _loaded?: () => void
//
//   __index(this: LazyLoad<T> & T, key: keyof T): any {
//     if (this._loaded) return nil
//
//     const value = this.load()
//     for (const [k, v] of pairs(value)) {
//       ;(this as any)[k] = v
//     }
//     this._loaded = () => {}
//     return value[key]
//   }
// }

export function LazyLoadClass<V extends object, T extends object>(
  registeredName: string,
  load: (value: V) => T,
): (value: V) => V & T {
  const mt: LuaMetatable<T> = {
    __index(
      this: V &
        T & {
          _loaded?: () => void
        },
      key: keyof T,
    ): any {
      if (rawget(this, "_loaded")) return nil
      const value = load(this)
      for (const [k, v] of pairs(value)) {
        if (type(v) != "function") {
          error("LazyLoad only supports functions")
        }
        this[k] = v as any
      }
      this._loaded = () => {}
      return value[key]
    },
  }
  script.register_metatable(registeredName, mt)
  return (value: any) => setmetatable(value, mt) as V & T
}
