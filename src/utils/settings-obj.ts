import { MutableProperty, property } from "../lib"

export type PropertiesTable<T extends table> = {
  readonly [K in keyof T]: MutableProperty<T[K]>
}

export function getCurrentValues<T extends object>(propertiesTable: PropertiesTable<T>): T {
  const result = {} as T
  for (const [key, value] of pairs(propertiesTable)) {
    result[key] = value.get()
  }
  return result
}

export function createPropertiesTable<T extends object>(keys: Array<keyof T>, values: T): PropertiesTable<T> {
  const result = {} as Partial<PropertiesTable<T>>
  for (const key of keys) {
    result[key] = property(values[key])
  }
  return result as PropertiesTable<T>
}
