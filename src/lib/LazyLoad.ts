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
/** Returns just a metatable for {@link LazyLoadClass}. */
export function lazyLoadMt<V extends object, T extends object>(load: (self: V) => T): LuaMetatable<T> {
  const instances = setmetatable(new LuaMap<V, T>(), { __mode: "k" })
  return {
    __index(this: V, key: keyof T): any {
      let instance = instances.get(this)
      if (!instance) {
        instance = load(this)
        instances.set(this, instance)
      }
      return instance[key]
    },
    instances,
  } as LuaMetatable<T>
}

/**
 * Creates a class that will lazily load its methods when they are first called.
 * This allows you to use a closure-based class, while being able to be stored/loaded in global.
 */
export function LazyLoadClass<V extends object, T extends object>(
  registeredName: string,
  load: (value: V) => T,
): (value: V) => V & T {
  const mt = lazyLoadMt(load)
  script.register_metatable(registeredName, mt)
  return (value: any) => setmetatable(value, mt)
}
