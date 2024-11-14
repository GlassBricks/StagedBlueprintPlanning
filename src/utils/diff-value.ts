import { deepCompare, Events, registerFunctions } from "../lib"

declare const NilPlaceholder: unique symbol
export type NilPlaceholder = typeof NilPlaceholder
declare const storage: {
  nilPlaceholder: NilPlaceholder
}
let nilPlaceholder: NilPlaceholder
export function getNilPlaceholder(): NilPlaceholder {
  return assert(nilPlaceholder)
}
Events.on_init(() => {
  nilPlaceholder = storage.nilPlaceholder = {} as any
})
Events.on_load(() => {
  nilPlaceholder = storage.nilPlaceholder
})
export type DiffValue<T> = T | NilPlaceholder
export function fromDiffValue<T>(value: DiffValue<T>): T {
  if (value == nilPlaceholder) return nil!
  return value
}
export function toDiffValue<T>(value: T): DiffValue<T> {
  return value == nil ? nilPlaceholder : value
}
export function getResultValue<T>(defaultValue: T, overrideValue: DiffValue<T> | nil): T {
  if (overrideValue == nil) return defaultValue
  if (overrideValue == nilPlaceholder) return nil!
  return overrideValue
}
registerFunctions("diff-value", {
  getActualValue: getResultValue,
})
export function getDiff<E>(before: E, after: E): DiffValue<E> | nil {
  if (deepCompare(before, after)) return nil
  return after == nil ? nilPlaceholder : after
}
