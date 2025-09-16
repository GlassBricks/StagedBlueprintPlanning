// Copyright (c) 2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

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
