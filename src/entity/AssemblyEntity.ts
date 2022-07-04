import { PRecord, PRRecord, shallowCopy } from "../lib"
import { Position } from "../lib/geometry"
import { getNilPlaceholder, WithNilPlaceholder } from "./NilPlaceholder"

export interface Entity {
  readonly name: string

  readonly position: Position

  readonly direction?: defines.direction
}

export type AssemblyEntity<E extends Entity = Entity> = E & {
  readonly layerChanges?: PRRecord<number, Readonly<LayerChange<E>>>
}

export type MutableAssemblyEntity<E extends Entity = Entity> = E & {
  layerChanges?: PRecord<number, LayerChange<E>>
}

export type LayerChange<E extends Entity> = {
  [P in keyof E]?: WithNilPlaceholder<E[P]>
}

export function getValueAtLayer<E extends Entity>(entity: AssemblyEntity<E>, layer: number): E {
  assert(layer >= 1, "layer must be >= 1")
  const { layerChanges } = entity
  if (!layerChanges) return entity
  const firstChangedLayer = next(layerChanges)[0]
  if (!firstChangedLayer || firstChangedLayer > layer) return entity

  const result: MutableAssemblyEntity<E> = shallowCopy(entity)
  result.layerChanges = nil
  const nilPlaceholder = getNilPlaceholder()
  for (const [changeLayer, changed] of pairs(layerChanges)) {
    // iterates in ascending order
    if (changeLayer > layer) break
    for (const [k, v] of pairs(changed as LayerChange<E>)) {
      if (v === nilPlaceholder) {
        delete result[k]
      } else {
        result[k] = v as E[typeof k]
      }
    }
  }
  return result
}
