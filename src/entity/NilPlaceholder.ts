import { Events } from "../lib"

declare const NilPlaceholder: unique symbol
export type NilPlaceholder = typeof NilPlaceholder

declare const global: {
  nilPlaceholder: NilPlaceholder
}
Events.on_init(() => {
  global.nilPlaceholder = {} as any
})

export function getNilPlaceholder(): NilPlaceholder {
  return global.nilPlaceholder
}

export type WithNilPlaceholder<T> = T extends nil ? NilPlaceholder : T
