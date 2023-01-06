import { MutableProperty } from "../lib"

export type AsProperties<T extends table> = {
  readonly [K in keyof T]: MutableProperty<T[K]>
}

export function getCurrentObjValue<T extends object>(settingsObj: AsProperties<T>): T {
  const result = {} as T
  for (const [key, value] of pairs(settingsObj)) {
    result[key] = value.get()
  }
  return result
}
