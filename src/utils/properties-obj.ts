import { MutableProperty, property } from "../lib"
import { DiffValue } from "./diff-value"
import { DiffedProperty } from "./DiffedProperty"

export type PropertiesTable<T extends table> = {
  readonly [K in keyof T]: MutableProperty<T[K]>
}

export type PropertyOverrideTable<T extends table> = {
  readonly [K in keyof T]: MutableProperty<DiffValue<T[K]> | nil>
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

export function createEmptyPropertyOverrideTable<T extends object>(keys: Array<keyof T>): PropertyOverrideTable<T> {
  const result = {} as Partial<PropertyOverrideTable<T>>
  for (const key of keys) {
    result[key] = property(nil)
  }
  return result as PropertyOverrideTable<T>
}

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
