import { Mutable, PRecord, PRRecord, shallowCopy } from "../lib"
import { Position } from "../lib/geometry"
import { getNilPlaceholder, WithNilPlaceholder } from "./NilPlaceholder"

export interface Entity {
  readonly name: string

  readonly position: Position

  readonly direction?: defines.direction
}

export type LayerNumber = number

export type AssemblyEntity<E extends Entity = Entity> = E & {
  readonly layerNumber: LayerNumber
  readonly layerChanges?: PRRecord<LayerNumber, Readonly<LayerChange<E>>>
  readonly isLostReference?: true
}

export type MutableAssemblyEntity<E extends Entity = Entity> = Mutable<AssemblyEntity<E>> & {
  layerChanges?: PRecord<LayerNumber, LayerChange<E>>
}

export type LayerChanges = PRecord<LayerNumber, LayerChange>

export type LayerChange<E extends Entity = Entity> = {
  [P in keyof E]?: WithNilPlaceholder<E[P]>
}

export function getValueAtLayer<E extends Entity>(entity: AssemblyEntity<E>, layer: LayerNumber): E | nil {
  assert(layer >= 1, "layer must be >= 1")
  if (entity.layerNumber > layer) return nil
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
        result[k] = v as any
      }
    }
  }
  return result
}

/** Does not check position */
export function isCompatibleEntity(a: Entity, b: Entity): boolean {
  return a.name === b.name && (a.direction ?? 0) === (b.direction ?? 0)
}
