import { Mutable } from "./util-types"

export function shallowCopy<T extends object>(obj: T): T {
  const result: Partial<T> = {}
  for (const [k, v] of pairs(obj)) {
    result[k] = v
  }
  return result as T
}
export const mutableShallowCopy: <T extends object>(obj: T) => Mutable<T> = shallowCopy

// does NOT copy metatables
export function deepCopy<T extends object>(obj: T): T {
  const seen = new LuaMap()
  function copy(value: any): any {
    if (type(value) !== "table") return value
    if (type(value.__self) === "userdata") return value
    if (seen.has(value)) return seen.get(value)
    const result: any = {}
    seen.set(value, result)
    for (const [k, v] of pairs(value as Record<any, any>)) {
      result[copy(k)] = copy(v)
    }
    return result
  }
  return copy(obj)
}

export function deepCompare<T>(a: T, b: T): boolean {
  if (a === b) return true
  if (typeof a !== "object" || typeof b !== "object") return false
  // ignore null
  for (const [k, v] of pairs(a)) {
    if (!deepCompare(v, b[k])) return false
  }
  for (const [k] of pairs(b)) {
    if (a[k] === undefined) return false
  }
  return true
}

export function shallowCompareRecords(a: Record<any, any> | undefined, b: Record<any, any> | undefined): boolean {
  if (a === b) return true
  if (a === undefined || b === undefined) return false
  for (const [k, v] of pairs(a)) {
    if (b[k] !== v) return false
  }
  for (const [k] of pairs(b)) {
    if (a[k] === undefined) return false
  }
  return true
}

export function isEmpty(obj: object): boolean {
  return next(obj)[0] === undefined
}
export function nilIfEmpty<T extends object>(obj: T): T | undefined {
  return next(obj)[0] && obj
}

export function assertNever(value: never): never {
  error("should not be reachable: " + serpent.block(value))
}
