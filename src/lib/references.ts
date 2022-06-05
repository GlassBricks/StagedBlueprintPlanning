// noinspection JSUnusedGlobalSymbols

import { Events } from "./Events"
import { Registry } from "./registry"

// --- Classes ---
export const OnLoad: unique symbol = Symbol("OnLoad")

export interface WithOnLoad {
  [OnLoad]?(): void
}

// on a class it marks if the class was processed
// on an instance (prototype) it returns the class name
const RClassInfo: unique symbol = Symbol("ClassInfo")

export interface Class<T> {
  name: string
  prototype: T
}

export type ClassName = string & { _classNameBrand: any }

interface RClass {
  name: string
  prototype: ClassInstance & LuaMetatable<ClassInstance>
  ____super?: RClass
  [RClassInfo]?: {
    processed?: true
    boundFuncKeys?: (keyof any)[]
  }
}

interface ClassInstance extends WithOnLoad {
  constructor: RClass
  [RClassInfo]: ClassName
  ____constructor(...args: any): void
}

declare const global: {
  __classes: LuaTable<ClassInstance, ClassName>
  // __instances: Record<object, ClassInstance>
  // __nextInstanceId: InstanceId
}

Events.on_init(() => {
  global.__classes = setmetatable({}, { __mode: "k" })
})

Events.on_load(() => {
  setmetatable(global.__classes, { __mode: "k" })
  for (const [table, className] of pairs(global.__classes)) {
    const type = Classes.getOrNil(className)
    if (!type) {
      error(
        `Could not find a class with the name "${className}". Check that the class was registered properly, and/or migrations are correct.`,
      )
      // continue
    }
    setmetatable(table, type.prototype as LuaMetatable<object>)
  }
  for (const [table] of pairs(global.__classes)) {
    table[OnLoad]?.()
  }
})

function processRegisteredClass(item: RClass, name: ClassName) {
  const prototype = item.prototype
  prototype[RClassInfo] = name
  // make sure __call meta-method works for subclasses
  rawset(prototype, "__call", prototype.__call)

  function bindFuncsInConstructor(prototype: ClassInstance & LuaMetatable<ClassInstance>, keys: (keyof any)[]) {
    const originalConstructor = prototype.____constructor
    prototype.____constructor = function (this: Record<keyof any, ContextualFun>, ...args: any[]) {
      for (const funcKey of keys) {
        this[funcKey] = boundPrototypeFunc(this, funcKey)
      }
      originalConstructor.call(this, ...args)
    }
  }
  function registerInstanceInConstructor(prototype: ClassInstance & LuaMetatable<ClassInstance>) {
    const originalConstructor = prototype.____constructor
    prototype.____constructor = function (this: ClassInstance, ...args: any[]) {
      global.__classes.set(this, this[RClassInfo])
      originalConstructor.call(this, ...args)
    }
  }

  function processConstructors(currentClass: RClass, info: RClass[typeof RClassInfo] & object) {
    const thisPrototype = currentClass.prototype
    if (info.boundFuncKeys) bindFuncsInConstructor(thisPrototype, info.boundFuncKeys)
    if (currentClass.____super === undefined) registerInstanceInConstructor(thisPrototype)
  }

  function registerStaticFunctions(currentClass: RClass) {
    for (const [key, value] of pairs(currentClass)) {
      // noinspection SuspiciousTypeOfGuard
      if (typeof value === "function" && typeof key === "string") {
        Functions.registerRaw((name + "." + key) as FuncName, value)
      }
    }
  }

  let currentClass: RClass | undefined = item
  while (currentClass !== undefined) {
    registerStaticFunctions(currentClass)
    // process constructors
    const info: RClass[typeof RClassInfo] = rawget(currentClass, RClassInfo) ?? (currentClass[RClassInfo] = {})
    if (!info.processed) {
      info.processed = true
      processConstructors(currentClass, info)
    }
    currentClass = currentClass.____super
  }
}

export const Classes = new Registry<Class<any>, ClassName>(
  "class",
  (item) => item.name ?? "Cannot register anonymous class without explicitly given name",
  (item) => serpent.block(item),
  processRegisteredClass,
)

/** Intended to be used with migrations. */
export function getAllInstances<T>(type: Class<T>): T[] {
  const typeName = Classes.nameOf(type)
  const result: T[] = []
  for (const [instance, name] of pairs(global.__classes)) {
    if (name === typeName) result.push(instance as any)
  }
  return result
}

export function rebindFuncs<T>(type: Class<T>): T[] {
  const instances = getAllInstances(type)
  const classInfo = assert(rawget(type as unknown as RClass, RClassInfo))
  const boundFuncKeys = classInfo.boundFuncKeys
  if (boundFuncKeys) {
    for (const instance of instances as any[]) {
      for (const funcKey of boundFuncKeys) {
        instance[funcKey] = boundPrototypeFunc(instance, funcKey)
      }
    }
  }
  return instances
}

// -- functions --

// eslint-disable-next-line @typescript-eslint/ban-types
export type AnyFunction = Function
export type ContextualFun = (this: any, ...args: any) => any
export type SelflessFun = (this: void, ...args: any) => any

export type Registered = { _registeredBrand: true }
export type Func<F extends ContextualFun> = (F extends (this: any, ...args: infer A) => infer R
  ? (this: unknown, ...args: A) => R
  : ContextualFun) &
  Registered

export type FuncName = string & { _funcNameBrand: any }

export const Functions = new Registry<AnyFunction, FuncName>(
  "function",
  () => {
    error("name must be explicitly given to register functions")
  },
  (func: AnyFunction) => serpent.block(type(func) === "function" ? debug.getinfo(func) : func, { nocode: true }),
  () => {
    // do nothing
  },
)

export function isCallable(obj: unknown): boolean {
  const objType = type(obj)
  if (objType === "function") {
    return true
  }
  if (objType === "table") {
    const metatable = getmetatable(obj)
    return metatable !== undefined && metatable.__call !== undefined
  }
  return false
}

export type Callback = ((this: unknown) => void) & Registered

// func classes
interface FuncClassTemplate {
  func: SelflessFun
  funcName?: FuncName
  [key: string]: unknown
}
function funcRefBasedClass<C extends unknown[], A extends unknown[], R>(
  init: (this: FuncClassTemplate, ...args: C) => void,
  __call: (this: FuncClassTemplate, thisArg: unknown, ...args: A) => R,
  name: string,
): {
  new (func: AnyFunction, ...args: C): Func<(...args: A) => R>
  func: SelflessFun
  funcName?: FuncName
} {
  const fullName = `funcRef: ${name}` as ClassName
  const resultPrototype: any = {
    __call,
    [RClassInfo]: fullName,
  }
  resultPrototype.__index = resultPrototype
  resultPrototype.constructor = {
    prototype: resultPrototype,
    name: fullName,
  }

  const initialPrototype: any = {
    __call(this: FuncClassTemplate, ...args: any[]) {
      if (this.funcName) {
        this.func = Functions.get(this.funcName)
      }
      setmetatable(this, resultPrototype)
      return (this as unknown as SelflessFun)(...args)
    },
    ____constructor(this: FuncClassTemplate, func: SelflessFun, ...args: C) {
      this.func = func
      if (typeof func === "function") {
        this.funcName = Functions.nameOf(func)
      } else {
        const meta = getmetatable(func)
        assert(meta && meta.__call, "func must be callable")
        if (meta === FuncRef.prototype) {
          this.func = (func as FuncClassTemplate).func
          this.funcName = (func as FuncClassTemplate).funcName
        }
      }
      init.call(this, ...args)
      setmetatable(this, resultPrototype)
    },
    [RClassInfo]: fullName,
    [OnLoad](this: FuncClassTemplate) {
      if (this.funcName) Functions.get(this.funcName)
      // check existence, but do not change value yet
      // else possible error on load
    },
  }
  initialPrototype.__index = initialPrototype
  const initialClass = {
    prototype: initialPrototype,
    name: fullName,
  }
  initialPrototype.constructor = initialClass

  Classes.registerRaw(fullName, initialClass)

  return initialClass as any
}

const FuncRef = funcRefBasedClass(
  () => {
    // nothing
  },
  function (this: FuncClassTemplate, _thisArg: unknown, ...args: unknown[]) {
    return this.func(...args)
  },
  "FuncRef",
)

/** Requires function to be registered. Resulting func takes "this" parameter. */
export function funcRef<F extends (this: void, ...args: any) => any>(
  func: F,
): Func<F extends (this: void, ...args: infer A) => infer R ? (this: unknown, ...args: A) => R : never> {
  return new FuncRef(func) as any
}

const Bound0 = funcRefBasedClass(
  function (this: FuncClassTemplate, thisArg: unknown) {
    this.thisArg = thisArg
  },
  function (this: FuncClassTemplate, thisArg: unknown, ...args: unknown[]) {
    return this.func(this.thisArg, ...args)
  },
  "BoundThis",
)

const Bound1 = funcRefBasedClass(
  function (this: FuncClassTemplate, thisArg: unknown, arg1: unknown) {
    this.thisArg = thisArg
    this.arg1 = arg1
  },
  function (this: FuncClassTemplate, thisArg: unknown, ...args: unknown[]) {
    return this.func(this.thisArg, this.arg1, ...args)
  },
  "Bound1",
)

const Bound2 = funcRefBasedClass(
  function (this: FuncClassTemplate, thisArg: unknown, arg1: unknown, arg2: unknown) {
    this.thisArg = thisArg
    this.arg1 = arg1
    this.arg2 = arg2
  },
  function (this: FuncClassTemplate, thisArg: unknown, ...args: unknown[]) {
    return this.func(this.thisArg, this.arg1, this.arg2, ...args)
  },
  "Bound2",
)

const Bound3 = funcRefBasedClass(
  function (this: FuncClassTemplate, thisArg: unknown, arg1: unknown, arg2: unknown, arg3: unknown) {
    this.thisArg = thisArg
    this.arg1 = arg1
    this.arg2 = arg2
    this.arg3 = arg3
  },
  function (this: FuncClassTemplate, thisArg: unknown, ...args: unknown[]) {
    return this.func(this.thisArg, this.arg1, this.arg2, this.arg3, ...args)
  },
  "Bound3",
)

const Bound4 = funcRefBasedClass(
  function (this: FuncClassTemplate, thisArg: unknown, arg1: unknown, arg2: unknown, arg3: unknown, arg4: unknown) {
    this.thisArg = thisArg
    this.arg1 = arg1
    this.arg2 = arg2
    this.arg3 = arg3
    this.arg4 = arg4
  },
  function (this: FuncClassTemplate, thisArg: unknown, ...args: unknown[]) {
    return this.func(this.thisArg, this.arg1, this.arg2, this.arg3, this.arg4, ...args)
  },
  "Bound4",
)

const BoundN = funcRefBasedClass(
  function (this: FuncClassTemplate, ...args: unknown[]) {
    this.args = args
  },
  function (this: FuncClassTemplate, thisArg: unknown, ...args: unknown[]) {
    return this.func(...(this.args as any[]), ...args)
  },
  "BoundN",
)

const boundFuncClasses = [Bound0, Bound1, Bound2, Bound3, Bound4] as typeof BoundN[]

export function bind<T, A extends any[], R>(func: (this: T, ...args: A) => R, thisValue: T): Func<(...args: A) => R>
export function bind<T, A1, A extends any[], R>(
  func: (this: T, arg1: A1, ...args: A) => R,
  thisValue: T,
  arg1: A1,
): Func<(...args: A) => R>
export function bind<T, A1, A2, A extends any[], R>(
  func: (this: T, arg1: A1, arg2: A2, ...args: A) => R,
  thisValue: T,
  arg1: A1,
  arg2: A2,
): Func<(...args: A) => R>
export function bind<T, A1, A2, A3, A extends any[], R>(
  func: (this: T, arg1: A1, arg2: A2, arg3: A3, ...args: A) => R,
  thisValue: T,
  arg1: A1,
  arg2: A2,
  arg3: A3,
): Func<(...args: A) => R>
export function bind<T, A1, A2, A3, A4, A extends any[], R>(
  func: (this: T, arg1: A1, arg2: A2, arg3: A3, arg4: A4, ...args: A) => R,
  thisValue: T,
  arg1: A1,
  arg2: A2,
  arg3: A3,
  arg4: A4,
): Func<(...args: A) => R>
export function bind(func: ContextualFun, thisValue: unknown, ...args: unknown[]): ContextualFun {
  const argCount = select("#", ...args)
  const type = boundFuncClasses[argCount] ?? BoundN
  return new type(func, thisValue, ...args)
}

export const bindN: <T, AX, R>(
  func: (this: T, ...args: AX[]) => R,
  thisValue: T,
  ...args: AX[]
) => Func<(...args: AX[]) => R> = bind as any

@Classes.register()
class KeyFunc {
  constructor(private readonly instance: Record<keyof any, ContextualFun>, private readonly key: keyof any) {}

  __call(thisArg: unknown, ...args: unknown[]) {
    return this.instance[this.key](...args)
  }
}

export function funcOn<T extends Record<K, ContextualFun>, K extends keyof T>(obj: T, key: K): Func<T[K]> {
  return new KeyFunc(obj, key) as any
}

@Classes.register()
class BoundPrototypeFunc {
  constructor(private readonly instance: Record<keyof any, ContextualFun>, private readonly key: keyof any) {}

  __call(thisArg: unknown, ...args: unknown[]) {
    const instance = this.instance
    const prototype = getmetatable(instance)!.__index as Record<keyof any, ContextualFun>
    return prototype[this.key].call(instance, ...args)
  }
}

export function boundPrototypeFunc<T extends Record<K, ContextualFun>, K extends keyof T>(obj: T, key: K): Func<T[K]> {
  return new BoundPrototypeFunc(obj, key) as any
}

export function bound(this: unknown, target: unknown, name: keyof any): void {
  const prototype = target as ClassInstance
  const constructor = prototype.constructor

  const classInfo = rawget(constructor, RClassInfo) ?? (constructor[RClassInfo] = {})
  const boundFuncKeys = classInfo.boundFuncKeys ?? (classInfo.boundFuncKeys = [])
  boundFuncKeys.push(name)
}

/**
 * Asserts that the given function is registered. Returns the function.
 */
export function reg<F extends ContextualFun>(func: F): Func<F> {
  if (typeof func === "function") error("tried to pass raw function where registered function is needed")
  if (!func[RClassInfo]) error("This func class is not registered")

  return func
}

@Classes.register()
class ReturnsValue {
  constructor(private readonly value: unknown) {}

  __call() {
    return this.value
  }
}

export function returns<T>(value: T): Func<(this: unknown) => T> {
  return new ReturnsValue(value) as any
}
