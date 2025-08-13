import { Mutable, MutableProperty, property } from "../lib"
import { DiffValue } from "./diff-value"
import { DiffedProperty } from "./DiffedProperty"

export type PropertiesTable<T extends object> = {
  readonly [K in keyof T]: MutableProperty<T[K]>
}

export type PropertyOverrideTable<T extends object> = {
  readonly [K in keyof T]: MutableProperty<DiffValue<T[K]> | nil>
}

export function getCurrentValues<T extends object>(propertiesTable: PropertiesTable<T>): T {
  const result = {} as T
  for (const [key, value] of pairs(propertiesTable)) {
    result[key] = value.get()
  }
  return result
}

export function createPropertiesTable<T extends object>(
  keys: Array<keyof T>,
  values: T,
  result: Partial<PropertiesTable<T>> = {},
): PropertiesTable<T> {
  for (const key of keys) {
    const actualKey = (tonumber(key) as keyof T) ?? key
    result[actualKey] = property(values[actualKey])
  }
  return result as PropertiesTable<T>
}

export function createEmptyPropertyOverrideTable<T extends object>(keys: Array<keyof T>): PropertyOverrideTable<T> {
  const result = {} as Partial<PropertyOverrideTable<T>>
  for (const key of keys) {
    const actualKey = (tonumber(key) as keyof T) ?? key
    result[actualKey] = property(nil)
  }
  return result as PropertyOverrideTable<T>
}

// Uses keys in defaultValue
export function createdDiffedPropertyTableView<T extends object>(
  defaultValues: PropertiesTable<T>,
  overrideValues: PropertyOverrideTable<T>,
): PropertiesTable<T> {
  const result = {} as Partial<PropertiesTable<T>>
  for (const [key, defaultValue] of pairs(defaultValues)) {
    result[key] = new DiffedProperty(overrideValues[key], defaultValue)
  }
  return result as PropertiesTable<T>
}

export function copyKeys<T extends object>(
  source: PropertiesTable<T>,
  target: Mutable<PropertiesTable<T>>,
  keys: Array<keyof T>,
): void {
  for (const key of keys) {
    target[key] = source[key]
  }
}
