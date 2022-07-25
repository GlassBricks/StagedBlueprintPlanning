/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of BBPP3.
 *
 * BBPP3 is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * BBPP3 is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with Foobar. If not, see <https://www.gnu.org/licenses/>.
 */

// noinspection JSUnusedGlobalSymbols

import { Events } from "./Events"
import { Registry } from "./registry"
import { PRRecord } from "./util-types"

// --- Classes ---
export const OnLoad: unique symbol = Symbol("OnLoad")

export interface WithOnLoad {
  [OnLoad]?(): void
}

// on a class it marks if the class was processed
// on an instance (prototype) it returns the class name
const ClassInfo: unique symbol = Symbol("ClassInfo")

export interface Class<T> {
  name: string
  prototype: T
}

interface ClassInfo {
  processed?: true
  boundFuncKeys?: LuaMap<string, string> // original name, internal name
}
interface RegisteredClass {
  name: string
  prototype: ClassInstance & LuaMetatable<ClassInstance> & { [key: string]: unknown }
  ____super?: RegisteredClass
  [ClassInfo]?: ClassInfo
}

interface ClassInstance extends WithOnLoad {
  constructor: RegisteredClass
  [ClassInfo]: string
  ____constructor(...args: any): void
}

export const Classes = new Registry<Class<any>>("class", (item) => serpent.block(item))
declare const global: {
  __classes: LuaMap<ClassInstance, string>
}

Events.on_init(() => {
  global.__classes = new LuaMap()
  if (!__DebugAdapter) setmetatable(global.__classes, { __mode: "k" })
  setmetatable(global.__classes, { __mode: "k" })
})

Events.on_load(() => {
  if (!__DebugAdapter) setmetatable(global.__classes, { __mode: "k" })
  for (const [table, className] of global.__classes) {
    const _class = Classes.getOrNil(className)
    if (!_class) {
      error(
        `Could not find a class with the name "${className}". Check that the class was registered properly, and/or migrations are correct.`,
      )
    }
    setmetatable(table, _class.prototype)
  }
  for (const [table] of global.__classes) {
    table[OnLoad]?.()
  }
})

function onClassRegistered(name: string, item: RegisteredClass) {
  const info: ClassInfo = rawget(item, ClassInfo) ?? (item[ClassInfo] = {})
  const prototype = item.prototype
  prototype[ClassInfo] = name

  // make sure __call meta-method works for subclasses
  rawset(prototype, "__call", prototype.__call)

  // register static functions
  for (const [key, value] of pairs(item)) {
    // noinspection SuspiciousTypeOfGuard
    if (typeof value === "function" && typeof key === "string") {
      Functions.registerRaw((name + "." + key) as string, value)
    }
  }

  // bind funcs in constructor
  const { boundFuncKeys } = info
  if (boundFuncKeys) {
    const originalConstructor = prototype.____constructor
    prototype.____constructor = function (this: Record<keyof any, ContextualFun>, ...args: any[]) {
      for (const [key, internalKey] of boundFuncKeys) {
        this[key] = funcOn(this, internalKey)
      }
      originalConstructor.call(this, ...args)
    }
  }

  const superClass = item.____super
  if (superClass) {
    if (!classIsProcessed(superClass)) error(`The superclass of ${name} (${superClass.name}) was not processed.`)
  } else {
    // register this instance in constructor
    const originalConstructor = prototype.____constructor
    prototype.____constructor = function (this: ClassInstance, ...args: any[]) {
      global.__classes.set(this, this[ClassInfo])
      originalConstructor.call(this, ...args)
    }
  }

  let currentClass: RegisteredClass | nil = item
  while (currentClass) {
    const info = rawget(currentClass, ClassInfo)!
    const { boundFuncKeys } = info
    if (boundFuncKeys) {
      for (const [key, internalKey] of boundFuncKeys) {
        const override = rawget(prototype, key)
        if (override) prototype[internalKey] = override
      }
    }
    currentClass = currentClass.____super
  }

  info.processed = true

  function classIsProcessed(_class: RegisteredClass) {
    const info = rawget(_class, ClassInfo)
    return info && info.processed
  }
}

export function RegisterClass(name: string): (this: unknown, _class: Class<any>) => void {
  return (_class: Class<any>) => {
    Classes.registerRaw(name, _class)
    onClassRegistered(name, _class)
  }
}

/** Intended to be used with migrations. */
export function getAllInstances<T>(type: Class<T>): T[] {
  const typeName = Classes.nameOf(type)
  const result: T[] = []
  for (const [instance, name] of global.__classes) {
    if (name === typeName) result.push(instance as any)
  }
  return result
}

export function rebindFuncs<T>(type: Class<T>): T[] {
  const instances = getAllInstances(type) as any[]
  let currentClass: RegisteredClass | nil = type as unknown as RegisteredClass
  while (currentClass) {
    const classInfo = assert(rawget(currentClass, ClassInfo))
    const boundFuncKeys = classInfo.boundFuncKeys
    if (boundFuncKeys) {
      for (const instance of instances) {
        for (const [key, internalKey] of boundFuncKeys) {
          instance[key] = funcOn(instance, internalKey)
        }
      }
    }
    currentClass = currentClass.____super
  }
  return instances
}

// -- functions --

// eslint-disable-next-line @typescript-eslint/ban-types
export type AnyFunction = Function
export type ContextualFun = (this: any, ...args: any) => any
export type SelflessFun = (this: void, ...args: any) => any

// export type RegisteredFunc = { _registeredBrand: true }
export interface Func<F extends ContextualFun = ContextualFun> {
  invoke: F extends (...args: infer A) => infer R ? (this: this, ...args: A) => R : never
}

export type Callback = Func<() => void>

export const Functions = new Registry<AnyFunction>("function", (func: AnyFunction) =>
  serpent.block(type(func) === "function" ? debug.getinfo(func) : func, { nocode: true }),
)

export type Functions = PRRecord<string, AnyFunction>
export function registerFunctions(prefix: string, functions: Functions): void {
  prefix += ":"
  for (const [name, func] of pairs(functions)) {
    Functions.registerRaw(prefix + name, func)
  }
}
export function getCallerFile(): string {
  const source = debug.getinfo(3, "S")!.source!
  return string.match(source, "^.-/(.+)%.lua")[0]
}
export function registerFunctionsByFile(functions: Functions): void {
  registerFunctions(getCallerFile(), functions)
}

// func classes
@RegisterClass("FuncRef")
class FuncRef implements Func {
  funcName: string

  constructor(public func: SelflessFun) {
    this.funcName = Functions.nameOf(func)
  }

  invoke(...args: any[]): any {
    if (!this.func) {
      this.func = Functions.get(this.funcName) as SelflessFun
    }
    return this.func(...args)
  }

  [OnLoad]() {
    // assert func name exists, but do not set it yet
    Functions.get(this.funcName)
  }
}

/** Requires function to be registered. Resulting func takes "this" parameter. */
export function funcRef<F extends SelflessFun>(func: F): Func<F> {
  return new FuncRef(func) as any
}

type AddContextParameter<F extends ContextualFun> = F extends (this: infer T, ...args: infer A) => infer R
  ? (...args: A) => R
  : never
export function cfuncRef<F extends ContextualFun>(func: F): Func<AddContextParameter<F>> {
  return new FuncRef(func as any) as any
}

@RegisterClass("FuncBound1")
class Bound1 {
  constructor(public func: Func, public arg1: unknown) {}
  invoke(...args: any[]): any {
    return this.func.invoke(this.arg1, ...args)
  }
}

@RegisterClass("FuncBound2")
class Bound2 {
  constructor(public func: Func, public arg1: unknown, public arg2: unknown) {}
  invoke(...args: any[]): any {
    return this.func.invoke(this.arg1, this.arg2, ...args)
  }
}

@RegisterClass("FuncBound3")
class Bound3 {
  constructor(public func: Func, public arg1: unknown, public arg2: unknown, public arg3: unknown) {}
  invoke(...args: any[]): any {
    return this.func.invoke(this.arg1, this.arg2, this.arg3, ...args)
  }
}

@RegisterClass("FuncBound4")
class Bound4 {
  constructor(
    public func: Func,
    public arg1: unknown,
    public arg2: unknown,
    public arg3: unknown,
    public arg4: unknown,
  ) {}
  invoke(...args: any[]): any {
    return this.func.invoke(this.arg1, this.arg2, this.arg3, this.arg4, ...args)
  }
}

@RegisterClass("FuncBound5")
class Bound5 {
  constructor(
    public func: Func,
    public arg1: unknown,
    public arg2: unknown,
    public arg3: unknown,
    public arg4: unknown,
    public arg5: unknown,
  ) {}
  invoke(...args: any[]): any {
    return this.func.invoke(this.arg1, this.arg2, this.arg3, this.arg4, this.arg5, ...args)
  }
}

@RegisterClass("FuncBoundN")
class BoundN {
  private readonly args: unknown[]
  constructor(public func: Func, ...args: unknown[]) {
    this.args = args
  }
  invoke(...args: any[]): any {
    return this.func.invoke(...this.args, ...args)
  }
}

const boundFuncClasses = [Bound1, Bound2, Bound3, Bound4, Bound5] as {
  new (func: Func, ...args: unknown[]): Func
}[]

type FOrFunc<F extends SelflessFun> = F | Func<F>

export function bind<A1, A extends any[], R>(
  func: FOrFunc<(arg1: A1, ...args: A) => R>,
  arg1: A1,
): Func<(...args: A) => R>
export function bind<A1, A2, A extends any[], R>(
  func: FOrFunc<(arg1: A1, arg2: A2, ...args: A) => R>,
  arg1: A1,
  arg2: A2,
): Func<(...args: A) => R>
export function bind<A1, A2, A3, A extends any[], R>(
  func: FOrFunc<(arg1: A1, arg2: A2, arg3: A3, ...args: A) => R>,
  arg1: A1,
  arg2: A2,
  arg3: A3,
): Func<(...args: A) => R>
export function bind<A1, A2, A3, A4, A extends any[], R>(
  func: FOrFunc<(arg1: A1, arg2: A2, arg3: A3, arg4: A4, ...args: A) => R>,
  arg1: A1,
  arg2: A2,
  arg3: A3,
  arg4: A4,
): Func<(...args: A) => R>
export function bind<A1, A2, A3, A4, A5, A extends any[], R>(
  func: FOrFunc<(arg1: A1, arg2: A2, arg3: A3, arg4: A4, arg5: A5, ...args: A) => R>,
  arg1: A1,
  arg2: A2,
  arg3: A3,
  arg4: A4,
  arg5: A5,
): Func<(...args: A) => R>
export function bind<AX, R>(func: FOrFunc<(...args: AX[]) => R>, ...args: AX[]): Func<(...args: AX[]) => R>
export function bind(func: FOrFunc<SelflessFun>, ...args: unknown[]): Func {
  const argCount = select("#", ...args)
  const Class = boundFuncClasses[argCount - 1] ?? BoundN
  if (typeof func === "function") {
    func = funcRef(func)
  }
  return new Class(func, ...args)
}

@RegisterClass("KeyFunc")
class KeyFunc implements Func {
  constructor(private readonly instance: Record<keyof any, ContextualFun>, private readonly key: keyof any) {}

  invoke(...args: unknown[]) {
    return this.instance[this.key](...args)
  }

  __call(thisArg: unknown, ...args: unknown[]) {
    return this.instance[this.key](...args)
  }
}

export function funcOn<T extends Record<K, ContextualFun>, K extends keyof T>(
  obj: T,
  key: K,
): Func<T[K]> & OmitThisParameter<T[K]> {
  return new KeyFunc(obj, key) as any
}

const boundFuncPrefix = "$original "
export function bound(this: unknown, target: { constructor: AnyFunction }, name: string): void {
  const prototype = target as ClassInstance & { [key: string]: ContextualFun }
  const constructor = prototype.constructor
  const value = prototype[name]
  if (typeof value !== "function") {
    const className = constructor.name ?? "<anonymous>"
    error(`Not a function: ${className}.${name}`)
  }

  const internalName = boundFuncPrefix + name
  assert(!prototype[internalName])
  prototype[internalName] = value

  const classInfo = rawget(constructor, ClassInfo) ?? (constructor[ClassInfo] = {})
  const boundFuncKeys = classInfo.boundFuncKeys ?? (classInfo.boundFuncKeys = new LuaMap())
  boundFuncKeys.set(name, internalName)
}

/**
 * Asserts that the given function is registered. Returns the function.
 */
export function reg<F extends ContextualFun>(func: F): Func<F> {
  if (typeof func === "function") error("tried to pass raw function where registered function is needed")
  if (!func[ClassInfo]) error("This func class is not registered")

  return func
}

// @RegisterClass()
// class ReturnsValue {
//   constructor(private readonly value: unknown) {}
//
//   __call() {
//     return this.value
//   }
// }
//
// export function returns<T>(value: T): Func<(this: unknown) => T> {
//   return new ReturnsValue(value) as any
// }
