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

import {
  deepCompare,
  isEmpty,
  Mutable,
  mutableShallowCopy,
  PRecord,
  PRRecord,
  RegisterClass,
  shallowCopy,
} from "../lib"
import { Position } from "../lib/geometry"
import { applyDiffToDiff, applyDiffToEntity, getEntityDiff, LayerDiff, mergeDiff } from "./diff"
import { Entity, EntityPose } from "./Entity"
import { getEntityCategory } from "./entity-info"

export type LayerNumber = number

export interface AssemblyEntity<out T extends Entity = Entity> extends EntityPose {
  readonly categoryName: string
  direction: defines.direction | nil
  /** If this entity is a lost reference */
  isLostReference?: true

  getBaseLayer(): LayerNumber
  getBaseValue(): Readonly<T>

  /** @return if this entity has any changes at the given layer, or any layer if nil */
  hasLayerChanges(layer?: LayerNumber): boolean
  _getLayerChanges(): LayerChanges<T>
  _applyDiffAtLayer(layer: LayerNumber, diff: LayerDiff<T>): void

  /** @return the value at a given layer. Nil if below the first layer. The result is a new table. */
  getValueAtLayer(layer: LayerNumber): T | nil

  /**
   * Adjusts diff so that the value at the given layer matches the given value.
   * Trims diff in higher layers if they no longer have any effect.
   * @return true if the value changed.
   */
  adjustValueAtLayer(layer: LayerNumber, value: T): boolean
  /**
   * Iterates the values of layers in the given range. More efficient than repeated calls to getValueAtLayer.
   * The same instance will be returned for each layer; its value is ephemeral.
   */
  iterateValues(start: LayerNumber, end: LayerNumber): LuaIterable<LuaMultiReturn<[LayerNumber, Readonly<T>]>>

  /** Moves the entity to a lower layer. */
  moveDown(lowerLayer: LayerNumber): LayerNumber
  /**
   * Moves an entity to a lower layer.
   * @param lowerLayer
   * @param newValue The value to set at the new layer.
   * @param createDiffAtOldLayer If a diff should be created at the old layer, so that the value at the old layer remains unchanged.
   * @return The old layer number.
   */
  moveDown(lowerLayer: LayerNumber, newValue: Mutable<T>, createDiffAtOldLayer?: boolean): LayerNumber
  /**
   * Move the entity to a higher layer
   * All layer changes from the old layer to the new layer will be applied (and then removed).
   */
  moveUp(higherLayer: LayerNumber): LayerNumber

  moveToLayer(layer: LayerNumber): void

  /** Returns nil if world entity does not exist or is invalid */
  getWorldEntity(layer: LayerNumber): LuaEntity | nil
  getWorldEntity<T extends WorldEntityType>(layer: LayerNumber, type: T): WorldEntities[T] | nil
  /** Destroys the old world entity, if exists. If `entity` is not nil, sets the new world entity. */
  replaceWorldEntity(layer: LayerNumber, entity: LuaEntity | nil): void
  replaceWorldEntity<T extends WorldEntityType>(layer: LayerNumber, entity: WorldEntities[T] | nil, type: T): void
  destroyWorldEntity<T extends WorldEntityType>(layer: LayerNumber, type: T): void
  hasAnyWorldEntity(type: WorldEntityType): boolean

  destroyAllWorldEntities(type: WorldEntityType): void
  /** Iterates all valid world entities. May skip layers. */
  iterateWorldEntities<T extends WorldEntityType>(type: T): LuaIterable<LuaMultiReturn<[LayerNumber, WorldEntities[T]]>>

  setProperty<T extends keyof LayerProperties>(layer: LayerNumber, key: T, value: LayerProperties[T] | nil): void
  getProperty<T extends keyof LayerProperties>(layer: LayerNumber, key: T): LayerProperties[T] | nil
  propertySetInAnyLayer(key: keyof LayerProperties): boolean
  clearProperty<T extends keyof LayerProperties>(key: T): void
}

export type LayerChanges<E extends Entity = Entity> = PRRecord<LayerNumber, LayerDiff<E>>

export interface WorldEntities {
  mainEntity?: LuaEntity
}
export type WorldEntityType = keyof WorldEntities
type AnyWorldEntity = WorldEntities[keyof WorldEntities]

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface LayerProperties {}

type LayerData = WorldEntities & LayerProperties

@RegisterClass("AssemblyEntity")
class AssemblyEntityImpl<T extends Entity = Entity> implements AssemblyEntity<T> {
  public readonly categoryName: string
  public readonly position: Position
  public direction: defines.direction | nil

  public isLostReference?: true

  private baseLayer: LayerNumber
  private baseValue: T
  private readonly layerChanges: Mutable<LayerChanges<T>> = {}

  private readonly layerProperties: {
    [P in keyof LayerData]?: PRecord<LayerNumber, LayerData[P]>
  } = {}

  constructor(baseLayer: LayerNumber, baseEntity: T, position: Position, direction: defines.direction | nil) {
    this.categoryName = getEntityCategory(baseEntity.name)
    this.position = position
    this.direction = direction === 0 ? nil : direction
    this.baseValue = shallowCopy(baseEntity)
    this.baseLayer = baseLayer
  }

  getBaseLayer(): LayerNumber {
    return this.baseLayer
  }
  getBaseValue(): T {
    return this.baseValue
  }

  hasLayerChanges(layer?: LayerNumber): boolean {
    if (layer) return this.layerChanges[layer] !== nil
    return next(this.layerChanges)[0] !== nil
  }
  _getLayerChanges(): LayerChanges<T> {
    return this.layerChanges
  }
  _applyDiffAtLayer(layer: LayerNumber, diff: LayerDiff<T>): void {
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
      layerChanges[layer] = shallowCopy(diff)
    }
  }

  getValueAtLayer(layer: LayerNumber): T | nil {
    // assert(layer >= 1, "layer must be >= 1")
    if (layer < this.baseLayer) return nil
    const value = mutableShallowCopy(this.baseValue)
    for (const [changedLayer, diff] of pairs(this.layerChanges)) {
      if (changedLayer > layer) break
      applyDiffToEntity(value, diff)
    }
    return value
  }

  public adjustValueAtLayer(layer: LayerNumber, value: T): boolean {
    const { baseLayer, layerChanges } = this
    assert(layer >= baseLayer, "layer must be >= first layer")
    const diff = this.setValueAndGetDiff(layer, value)
    if (!diff) return false

    // add a key at this layer so pairs works properly
    const thisDiff = layerChanges[layer]
    if (!thisDiff) layerChanges[layer] = {}

    // trim diffs in higher layers, remove those that are ineffectual
    for (const [layerNumber, changes] of this.iterateLayerChangesFrom(layer) as LuaIterable<
      LuaMultiReturn<[LayerNumber, LayerDiff<T>]>,
      any
    >) {
      for (const [k, v] of pairs(diff)) {
        if (deepCompare(changes[k], v)) {
          // changed to same value, remove
          delete changes[k]
        } else {
          // changed to different value, no longer need to consider for trimming
          delete diff[k]
        }
      }
      if (isEmpty(changes)) delete layerChanges[layerNumber]
      if (isEmpty(diff)) break
    }
    if (!thisDiff) delete layerChanges[layer]

    return true
  }

  private iterateLayerChangesFrom(layer: LayerNumber): any
  private iterateLayerChangesFrom(layer: LayerNumber) {
    return $multi(next, this.layerChanges, layer)
  }

  private setValueAndGetDiff(layer: LayerNumber, value: T): LayerDiff<T> | nil {
    if (layer === this.baseLayer) {
      const { baseValue } = this
      const diff = getEntityDiff(baseValue, value)
      if (diff) {
        applyDiffToEntity(baseValue, diff)
        return diff
      }
    } else {
      const valueAtPreviousLayer = assert(this.getValueAtLayer(layer - 1))
      const newLayerDiff = getEntityDiff(valueAtPreviousLayer, value)

      const { layerChanges } = this
      const oldLayerDiff = layerChanges[layer]
      const diff = mergeDiff(valueAtPreviousLayer, oldLayerDiff, newLayerDiff)
      if (diff) {
        layerChanges[layer] = newLayerDiff
        return diff
      }
    }
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

  moveDown(lowerLayer: LayerNumber, newValue?: Mutable<T>, createDiffAtOldLayer?: boolean): LayerNumber {
    const { baseLayer: higherLayer, baseValue: higherValue } = this
    assert(lowerLayer < higherLayer, "new layer number must be greater than old layer number")
    const lowerValue = newValue ?? higherValue
    this.baseLayer = lowerLayer
    this.baseValue = lowerValue
    const newDiff = createDiffAtOldLayer ? getEntityDiff(lowerValue, higherValue) : nil
    this.layerChanges[higherLayer] = newDiff
    return higherLayer
  }
  moveUp(higherLayer: LayerNumber): LayerNumber {
    const { baseLayer: lowerLayer, baseValue } = this
    assert(higherLayer > lowerLayer, "new layer number must be greater than old layer number")
    const { layerChanges } = this
    for (const [changeLayer, changed] of pairs(layerChanges)) {
      if (changeLayer > higherLayer) break
      applyDiffToEntity(baseValue, changed)
      layerChanges[changeLayer] = nil
    }
    this.baseLayer = higherLayer
    return lowerLayer
  }
  moveToLayer(layer: LayerNumber): void {
    const { baseLayer } = this
    if (layer > baseLayer) {
      this.moveUp(layer)
    } else if (layer < baseLayer) {
      this.moveDown(layer)
    }
    // else do nothing
  }

  getWorldEntity(layer: LayerNumber, type: WorldEntityType = "mainEntity") {
    const { layerProperties } = this
    const byType = layerProperties[type]
    if (!byType) return nil
    const worldEntity = byType[layer]
    if (worldEntity && worldEntity.valid) {
      return worldEntity as LuaEntity
    }
    // delete
    delete byType[layer]
    if (isEmpty(byType)) delete layerProperties[type]
  }
  replaceWorldEntity(layer: LayerNumber, entity: AnyWorldEntity | nil, type: WorldEntityType = "mainEntity"): void {
    if (entity === nil) return this.destroyWorldEntity(layer, type)
    const { layerProperties } = this
    const byType = layerProperties[type] || (layerProperties[type] = {})
    const existing = byType[layer]
    if (existing && existing.valid && existing !== entity) existing.destroy()
    byType[layer] = entity
  }
  destroyWorldEntity<T extends WorldEntityType>(layer: LayerNumber, type: T): void {
    const { layerProperties } = this
    const byType = layerProperties[type]
    if (!byType) return
    const entity = byType[layer]
    if (entity && entity.valid) entity.destroy()
    delete byType[layer]
    if (isEmpty(byType)) delete layerProperties[type]
  }
  hasAnyWorldEntity(type: WorldEntityType): boolean {
    const { layerProperties } = this
    const byType = layerProperties[type]
    if (!byType) return false
    for (const [key, entity] of pairs(byType)) {
      if (entity && entity.valid) return true
      byType[key] = nil
    }
    if (isEmpty(byType)) delete layerProperties[type]
    return false
  }
  destroyAllWorldEntities(type: WorldEntityType): void {
    const { layerProperties } = this
    const byType = layerProperties[type]
    if (!byType) return
    for (const [, entity] of pairs(byType)) {
      if (entity && entity.valid) entity.destroy()
    }
    delete layerProperties[type]
  }
  iterateWorldEntities(type: WorldEntityType): LuaIterable<LuaMultiReturn<[LayerNumber, any]>> {
    const byType = this.layerProperties[type]
    if (!byType) return (() => nil) as any
    let curKey = next(byType)[0]
    return function () {
      while (true) {
        const key = curKey
        if (!key) return nil
        curKey = next(byType, key)[0]
        const entity = byType[key]!
        if (entity.valid) return $multi(key, entity)
      }
    } as any
  }

  setProperty<T extends keyof LayerProperties>(layer: LayerNumber, key: T, value: LayerProperties[T] | nil): void {
    const { layerProperties } = this
    const byType: PRecord<LayerNumber, LayerProperties[T]> = layerProperties[key] || (layerProperties[key] = {})
    byType[layer] = value
    if (isEmpty(byType)) delete layerProperties[key]
  }
  getProperty<T extends keyof LayerProperties>(layer: LayerNumber, key: T): LayerProperties[T] | nil {
    const byType = this.layerProperties[key]
    return byType && byType[layer]
  }
  propertySetInAnyLayer(key: keyof LayerProperties): boolean {
    const byType = this.layerProperties[key]
    if (!byType) return false
    return next(byType)[0] !== nil
  }
  clearProperty<T extends keyof LayerProperties>(key: T): void {
    delete this.layerProperties[key]
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
