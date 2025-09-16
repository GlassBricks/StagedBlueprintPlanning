// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Mutable, MutableProperty, property } from "../lib"
import { DiffValue } from "./diff-value"
import { DiffedProperty } from "./DiffedProperty"

export type PropertiesTable<T extends object> = {
  readonly [K in keyof T]: MutableProperty<T[K]>
}

export type NestedPropertiesTable<T extends Record<keyof T, object>> = {
  readonly [K in keyof T]: PropertiesTable<T[K]>
}

export type PropertyOverrideTable<T extends object> = {
  readonly [K in keyof T]: MutableProperty<DiffValue<T[K]> | nil>
}

export type OverrideTable<T extends object> = {
  readonly [K in keyof T]: DiffValue<T[K]> | nil
}

export function getCurrentValues<T extends object>(propertiesTable: PropertiesTable<T>): T {
  const result = {} as T
  for (const [key, value] of pairs(propertiesTable)) {
    result[key] = value.get()
  }
  return result
}

export function getCurrentValuesOf<T extends object>(propertiesTable: PropertiesTable<T>, keys: Array<keyof T>): T {
  const result = {} as T
  for (const key of keys) {
    result[key] = propertiesTable[key].get()
  }
  return result
}

export function setCurrentValuesOf<T extends object>(
  propertiesTable: PropertiesTable<T>,
  values: Partial<T>,
  keys: Array<keyof T>,
): void {
  for (const key of keys) {
    if (values[key] != nil) {
      propertiesTable[key].set(values[key])
    }
  }
}

export function createPropertiesTable<T extends object>(
  keys: Array<keyof T>,
  values: T,
  result: Partial<PropertiesTable<T>> = {},
): PropertiesTable<T> {
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
