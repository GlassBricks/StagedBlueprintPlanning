import { deepCompare, Mutable, mutableShallowCopy, nilIfEmpty, PRecord, PRRecord } from "../lib"
import { Position } from "../lib/geometry"
import { getNilPlaceholder, NilPlaceholder, WithNilPlaceholder } from "./NilPlaceholder"

export interface Entity {
  readonly name: string
}

export type LayerNumber = number

export interface AssemblyEntity<out E extends Entity = Entity> {
  // the below 3 defines the entity and never change
  readonly position: Position
  readonly categoryName: string
  readonly direction: defines.direction | nil

  /** First layer this entity appears in */
  readonly layerNumber: LayerNumber
  /** Value at the first layer */
  readonly baseEntity: E
  /** Changes to properties at successive layers. */
  readonly layerChanges?: PRRecord<LayerNumber, LayerChange<E>>
  /** If this entity is a lost reference */
  readonly isLostReference?: true
}

export interface MutableAssemblyEntity<E extends Entity = Entity> extends AssemblyEntity<E> {
  layerNumber: LayerNumber
  baseEntity: E
  layerChanges?: PRecord<LayerNumber, LayerChange<E>>
  isLostReference?: true
}

export type LayerChanges = PRecord<LayerNumber, LayerChange>

export type LayerChange<E extends Entity = Entity> = {
  readonly [P in keyof E]?: WithNilPlaceholder<E[P]>
}

export function createAssemblyEntity<E extends Entity>(
  entity: E,
  position: Position,
  direction: defines.direction | nil,
  layerNumber: LayerNumber,
): AssemblyEntity<E> {
  return {
    categoryName: getCategoryName(entity),
    position,
    direction: direction === 0 ? nil : direction,
    layerNumber,
    baseEntity: entity,
  }
}

export function getCategoryName(entity: Entity): string {
  // todo: group into categories
  return entity.name
}

/** Does not check position */
export function isCompatibleEntity(
  a: AssemblyEntity,
  categoryName: string,
  direction: defines.direction | nil,
): boolean {
  return a.categoryName === categoryName && a.direction === direction
}

const ignoredProps = newLuaSet<keyof any>("position", "direction")

export function getEntityDiff<E extends Entity = Entity>(below: E, above: E): LayerChange | nil {
  const nilPlaceholder: NilPlaceholder = getNilPlaceholder()
  const changes: any = {}
  for (const [key, value] of pairs(above)) {
    if (!ignoredProps.has(key) && !deepCompare(value, below[key])) {
      changes[key] = value
    }
  }
  for (const [key] of pairs(below)) {
    if (!ignoredProps.has(key) && above[key] === nil) changes[key] = nilPlaceholder
  }
  return nilIfEmpty(changes)
}

export function applyDiffToDiff<E extends Entity = Entity>(
  existing: Mutable<LayerChange<E>>,
  diff: LayerChange<E>,
): void {
  for (const [key, value] of pairs(diff)) {
    existing[key] = value as any
  }
}

export function getValueAtLayer<E extends Entity>(entity: AssemblyEntity<E>, layer: LayerNumber): E | nil {
  assert(layer >= 1, "layer must be >= 1")
  if (entity.layerNumber > layer) return nil
  const { layerChanges, baseEntity } = entity
  if (!layerChanges) return baseEntity
  const firstChangedLayer = next(layerChanges)[0]
  if (!firstChangedLayer || firstChangedLayer > layer) return baseEntity

  const result = mutableShallowCopy(baseEntity)
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
