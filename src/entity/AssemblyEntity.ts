/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of BBPP3.
 *
 * BBPP3 is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * BBPP3 is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with Foobar. If not, see <https://www.gnu.org/licenses/>.
 */

import { deepCompare, Events, Mutable, mutableShallowCopy, nilIfEmpty, PRecord, PRRecord } from "../lib"
import { Position } from "../lib/geometry"

export interface Entity {
  readonly name: string
}

export type LayerNumber = number

export interface EntityPose {
  readonly position: Position
  readonly direction: defines.direction | nil
}

/**
 * Not a class because performance!
 */
export interface AssemblyEntity<out E extends Entity = Entity> extends EntityPose {
  readonly categoryName: string
  /** First layer this entity appears in */
  readonly layerNumber: LayerNumber
  /** Value at the first layer */
  readonly baseEntity: E
  /** Changes to properties at successive layers. */
  readonly layerChanges?: PRRecord<LayerNumber, LayerDiff<E>>
  /** If this entity is a lost reference */
  readonly isLostReference?: true

  readonly _worldEntities: PRecord<LayerNumber, LuaEntity>
  readonly _highlights: PRecord<LayerNumber, EntityHighlights>
}

export interface MutableAssemblyEntity<E extends Entity = Entity> extends AssemblyEntity<E> {
  direction: defines.direction | nil
  layerNumber: LayerNumber
  baseEntity: E
  layerChanges?: PRecord<LayerNumber, LayerDiff<E>>
  isLostReference?: true
}

export type LayerChanges = PRecord<LayerNumber, LayerDiff>

export type LayerDiff<E extends Entity = Entity> = {
  readonly [P in keyof E]?: WithNilPlaceholder<E[P]>
}

export interface EntityHighlights {
  error?: HighlightBoxEntity
}

export function createAssemblyEntity<E extends Entity>(
  entity: E,
  position: Position,
  direction: defines.direction | nil,
  layerNumber: LayerNumber,
): MutableAssemblyEntity<E> {
  return {
    categoryName: getCategoryName(entity),
    position,
    direction: direction === 0 ? nil : direction,
    layerNumber,
    baseEntity: entity,
    _worldEntities: {},
    _highlights: {},
  }
}

export function getCategoryName(entity: Entity): string {
  // todo: group into categories
  return entity.name
}

export function isWorldEntityAssemblyEntity(luaEntity: LuaEntity): boolean {
  return luaEntity.is_entity_with_owner && luaEntity.has_flag("player-creation")
}

/** Does not check position */
export function isCompatibleEntity(
  a: AssemblyEntity,
  categoryName: string,
  direction: defines.direction | nil,
): boolean {
  return a.categoryName === categoryName && a.direction === direction
}

declare const NilPlaceholder: unique symbol
export type NilPlaceholder = typeof NilPlaceholder
export type WithNilPlaceholder<T> = T extends nil ? NilPlaceholder : T

declare const global: {
  nilPlaceholder: NilPlaceholder
}
let nilPlaceholder: NilPlaceholder
Events.on_init(() => {
  nilPlaceholder = global.nilPlaceholder = {} as any
})
Events.on_load(() => {
  nilPlaceholder = global.nilPlaceholder
})
export function getNilPlaceholder(): NilPlaceholder {
  return assert(nilPlaceholder)
}

const ignoredProps = newLuaSet<keyof any>("position", "direction")
export function getEntityDiff<E extends Entity = Entity>(below: E, above: E): LayerDiff | nil {
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

export function applyDiffToDiff<E extends Entity = Entity>(existing: Mutable<LayerDiff<E>>, diff: LayerDiff<E>): void {
  for (const [key, value] of pairs(diff)) {
    existing[key] = value as any
  }
}

export function applyDiffToEntity<E extends Entity = Entity>(entity: Mutable<E>, diff: LayerDiff<E>): void {
  for (const [key, value] of pairs(diff)) {
    if (value === nilPlaceholder) {
      delete entity[key]
    } else {
      entity[key] = value as any
    }
  }
}

export function getValueAtLayer<E extends Entity>(entity: AssemblyEntity<E>, layer: LayerNumber): E | nil {
  assert(layer >= 1, "layer must be >= 1")
  if (entity.layerNumber > layer) return nil
  const value = mutableShallowCopy(entity.baseEntity)
  const { layerChanges } = entity
  if (!layerChanges) return value
  const firstChangedLayer = next(layerChanges)[0]
  if (!firstChangedLayer || firstChangedLayer > layer) return value

  for (const [changeLayer, changed] of pairs(layerChanges)) {
    // iterates in ascending order
    if (changeLayer > layer) break
    applyDiffToEntity(value, changed)
  }
  return value
}

export function getWorldEntity(entity: AssemblyEntity, layerNumber: LayerNumber): LuaEntity | nil {
  const { _worldEntities } = entity
  const worldEntity = _worldEntities[layerNumber]
  if (!worldEntity || !worldEntity.valid) {
    delete _worldEntities[layerNumber]
    return
  }
  return worldEntity
}

export function destroyWorldEntity(entity: AssemblyEntity, layerNumber: LayerNumber): void {
  const { _worldEntities } = entity
  const worldEntity = _worldEntities[layerNumber]
  if (worldEntity && worldEntity.valid) worldEntity.destroy()
  delete _worldEntities[layerNumber]
}

export function replaceOrDestroyWorldEntity(
  assemblyEntity: MutableAssemblyEntity,
  luaEntity: LuaEntity | nil,
  layerNumber: LayerNumber,
): void {
  const { _worldEntities } = assemblyEntity
  const existing = _worldEntities[layerNumber]
  if (existing && existing.valid && existing !== luaEntity) existing.destroy()
  _worldEntities[layerNumber] = luaEntity
}

export const replaceWorldEntity: (
  assemblyEntity: MutableAssemblyEntity,
  luaEntity: LuaEntity,
  layerNumber: LayerNumber,
) => void = replaceOrDestroyWorldEntity

export function destroyAllWorldEntities(entity: MutableAssemblyEntity): void {
  for (const [, worldEntity] of pairs(entity._worldEntities)) {
    if (worldEntity.valid) worldEntity.destroy()
  }
}

export function iterateWorldEntities(entity: AssemblyEntity): LuaIterable<LuaMultiReturn<[LayerNumber, LuaEntity]>> {
  const { _worldEntities } = entity
  let curKey = next(_worldEntities)[0]
  return function () {
    while (true) {
      const key = curKey
      if (!key) return nil
      curKey = next(_worldEntities, key)[0]
      const entity = _worldEntities[key]!
      if (entity.valid) return $multi(key, entity)
    }
  } as any
}
