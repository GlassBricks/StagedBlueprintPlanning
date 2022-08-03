/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of BBPP3.
 *
 * BBPP3 is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * BBPP3 is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with BBPP3. If not, see <https://www.gnu.org/licenses/>.
 */

import { Mutable, mutableShallowCopy, PRecord, PRRecord, RegisterClass } from "../lib"
import { Position } from "../lib/geometry"
import { applyDiffToDiff, applyDiffToEntity, getEntityDiff, LayerDiff } from "./diff"
import { Entity, EntityPose } from "./Entity"

export type LayerNumber = number

export interface AssemblyEntity<out T extends Entity = Entity> extends EntityPose {
  readonly categoryName: string
  direction: defines.direction | nil
  /** If this entity is a lost reference */
  isLostReference?: true

  readonly _highlights: PRecord<LayerNumber, EntityHighlights>

  getBaseLayer(): LayerNumber
  getBaseValue(): T

  /** Applies a diff at a given layer. */
  applyDiffAtLayer(layer: LayerNumber, diff: LayerDiff<T>): void
  /** @return if this entity has any changes after the first layer. */
  hasLayerChanges(): boolean
  _getLayerChanges(): LayerChanges<T>

  /** @return the value at a given layer. Nil if below the first layer. */
  getValueAtLayer(layer: LayerNumber): T | nil
  iterateValues(start: LayerNumber, end: LayerNumber): LuaIterable<LuaMultiReturn<[LayerNumber, T]>>

  /** Adjusts layerValues to move the entity to a lower layer. */
  moveEntityDown(lowerLayer: LayerNumber): LayerNumber
  moveEntityDown(lowerLayer: LayerNumber, newValue: T, createDiffAtOldLayer?: boolean): LayerNumber
  /** Move the entity to a *higher* layer. New base value includes all changes between the old and new layer. */
  moveEntityUp(higherLayer: LayerNumber): void

  moveEntityTo(layer: LayerNumber): void

  getWorldEntity(layer: LayerNumber): LuaEntity | nil
  destroyWorldEntity(layer: LayerNumber): void
  replaceOrDestroyWorldEntity(layer: LayerNumber, entity: LuaEntity | nil): void
  iterateWorldEntities(): LuaIterable<LuaMultiReturn<[LayerNumber, LuaEntity]>>
}

export type LayerChanges<E extends Entity = Entity> = PRRecord<LayerNumber, LayerDiff<E>>

export interface EntityHighlights {
  error?: HighlightBoxEntity
}

@RegisterClass("AssemblyEntity")
class AssemblyEntityImpl<T extends Entity = Entity> implements AssemblyEntity<T> {
  public readonly categoryName: string
  public readonly position: Position
  public direction: defines.direction | nil

  public isLostReference?: true

  private baseLayer: LayerNumber
  private baseValue: T
  private readonly layerChanges: Mutable<LayerChanges<T>> = {}

  private readonly worldEntities: PRecord<LayerNumber, LuaEntity> = {}
  // todo: make private
  readonly _highlights: PRecord<LayerNumber, EntityHighlights> = {}

  constructor(baseLayer: LayerNumber, baseEntity: T, position: Position, direction: defines.direction | nil) {
    this.categoryName = getCategoryName(baseEntity)
    this.position = position
    this.direction = direction === 0 ? nil : direction
    this.baseValue = baseEntity
    this.baseLayer = baseLayer
  }

  getBaseLayer(): LayerNumber {
    return this.baseLayer
  }
  getBaseValue(): T {
    return this.baseValue
  }

  applyDiffAtLayer(layer: LayerNumber, diff: LayerDiff<T>): void {
    const { baseLayer, layerChanges } = this
    assert(layer >= baseLayer, "layer must be >= first layer")
    if (layer === baseLayer) {
      applyDiffToEntity(this.baseValue, diff)
      return
    }
    const existingDiff = layerChanges[layer]
    if (existingDiff) {
      applyDiffToDiff(existingDiff, diff)
    } else {
      layerChanges[layer] = diff
    }
  }
  hasLayerChanges(): boolean {
    return next(this.layerChanges)[0] !== nil
  }
  _getLayerChanges(): LayerChanges<T> {
    return this.layerChanges
  }

  getValueAtLayer(layer: LayerNumber): T | nil {
    assert(layer >= 1, "layer must be >= 1")
    if (layer < this.baseLayer) return nil
    const value = mutableShallowCopy(this.baseValue)
    for (const [changedLayer, diff] of pairs(this.layerChanges)) {
      if (changedLayer > layer) break
      applyDiffToEntity(value, diff)
    }
    return value
  }
  iterateValues(start: LayerNumber, end: LayerNumber): LuaIterable<LuaMultiReturn<[LayerNumber, T]>>
  iterateValues(start: LayerNumber, end: LayerNumber) {
    const value = this.getValueAtLayer(start)!
    function next(layerValues: LayerChanges, prevLayer: LayerNumber | nil) {
      if (!prevLayer) return $multi(start, value)
      const nextLayer = prevLayer + 1
      if (nextLayer > end) return $multi()
      const diff = layerValues[nextLayer]
      if (diff) applyDiffToEntity(value, diff)
      return $multi(nextLayer, value)
    }
    return $multi<any>(next, this.layerChanges, nil)
  }

  moveEntityDown(lowerLayer: LayerNumber, newValue?: T, createDiffAtOldLayer?: boolean): LayerNumber {
    const { baseLayer: higherLayer, baseValue: higherValue } = this
    assert(lowerLayer < higherLayer, "new layer number must be greater than old layer number")
    const lowerValue = newValue ?? higherValue
    this.baseLayer = lowerLayer
    this.baseValue = lowerValue
    const newDiff = createDiffAtOldLayer ? getEntityDiff(lowerValue, higherValue) : nil
    this.layerChanges[higherLayer] = newDiff
    return higherLayer
  }
  moveEntityUp(higherLayer: LayerNumber): void {
    const { baseLayer: lowerLayer, baseValue } = this
    assert(higherLayer > lowerLayer, "new layer number must be greater than old layer number")
    const { layerChanges } = this
    for (const [changeLayer, changed] of pairs(layerChanges)) {
      if (changeLayer > higherLayer) break
      applyDiffToEntity(baseValue, changed)
      layerChanges[changeLayer] = nil
    }
    this.baseLayer = higherLayer
  }
  moveEntityTo(layer: LayerNumber): void {
    const { baseLayer } = this
    if (layer > baseLayer) {
      this.moveEntityUp(layer)
    } else if (layer < baseLayer) {
      this.moveEntityDown(layer)
    }
    // else do nothing
  }

  getWorldEntity(layer: LayerNumber): LuaEntity | nil {
    const { worldEntities } = this
    const worldEntity = worldEntities[layer]
    if (!worldEntity || !worldEntity.valid) {
      delete worldEntities[layer]
      return nil
    }
    return worldEntity
  }
  destroyWorldEntity(layer: LayerNumber): void {
    const { worldEntities } = this
    const worldEntity = worldEntities[layer]
    if (worldEntity && worldEntity.valid) worldEntity.destroy()
    delete worldEntities[layer]
  }
  replaceOrDestroyWorldEntity(layer: LayerNumber, entity: LuaEntity | nil): void {
    const { worldEntities } = this
    const existing = worldEntities[layer]
    if (existing && existing.valid && existing !== entity) existing.destroy()
    worldEntities[layer] = entity
  }
  iterateWorldEntities(): LuaIterable<LuaMultiReturn<[LayerNumber, LuaEntity]>> {
    const { worldEntities } = this
    let curKey = next(worldEntities)[0]
    return function () {
      while (true) {
        const key = curKey
        if (!key) return nil
        curKey = next(worldEntities, key)[0]
        const entity = worldEntities[key]!
        if (entity.valid) return $multi(key, entity)
      }
    } as any
  }
}

export function createAssemblyEntity<E extends Entity>(
  entity: E,
  position: Position,
  direction: defines.direction | nil,
  layerNumber: LayerNumber,
): AssemblyEntity<E> {
  return new AssemblyEntityImpl(layerNumber, entity, position, direction)
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
