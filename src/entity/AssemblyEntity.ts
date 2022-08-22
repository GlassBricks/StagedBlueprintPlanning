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
import { CategoryName, getEntityCategory } from "./entity-info"

export type LayerNumber = number

export interface AssemblyEntity<out T extends Entity = Entity> extends EntityPose {
  readonly categoryName: CategoryName
  direction: defines.direction | nil
  /** If this entity is a settings remnant */
  isSettingsRemnant?: true

  getBaseLayer(): LayerNumber
  getBaseValue(): Readonly<T>

  /** @return if this entity has any changes at the given layer, or any layer if nil */
  hasLayerChange(layer?: LayerNumber): boolean
  getLayerChange(layer: LayerNumber): LayerDiff<T> | nil
  _getLayerChanges(): LayerChanges<T>
  _applyDiffAtLayer(layer: LayerNumber, diff: LayerDiff<T>): void

  /** @return the value at a given layer. Nil if below the first layer. The result is a new table. */
  getValueAtLayer(layer: LayerNumber): T | nil
  /** Gets the entity name at the given layer. If below the first layer, returns the base entity name. */
  getNameAtLayer(layer: LayerNumber): string
  /**
   * Iterates the values of layers in the given range. More efficient than repeated calls to getValueAtLayer.
   * The same instance will be returned for each layer; its value is ephemeral.
   */
  iterateValues(start: LayerNumber, end: LayerNumber): LuaIterable<LuaMultiReturn<[LayerNumber, Readonly<T> | nil]>>

  /**
   * Adjusts layer changes so that the value at the given layer matches the given value.
   * Trims layer changes in higher layers if they no longer have any effect.
   * If there is diff, also clears oldLayer (see {@link getOldLayer}).
   * @return true if the value changed.
   */
  adjustValueAtLayer(layer: LayerNumber, value: T): boolean

  /**
   *
   * @param layer the layer to move to. If moving up, deletes/merges all layer changes from old layer to new layer.
   * @param recordOldLayer if true, records the old layer (so the entity can be moved back). Otherwise, clears the old layer.
   * @return the previous base layer
   */
  moveToLayer(layer: LayerNumber, recordOldLayer?: boolean): LayerNumber

  /**
   * The last layer before moveToLayer() was called with recordOldLayer.
   * The layer memo is cleared when adjustValueAtLayer() is called with changes on a layer that is not the base layer.
   */
  getOldLayer(): LayerNumber | nil

  /** Returns nil if world entity does not exist or is invalid */
  getWorldEntity(layer: LayerNumber): WorldEntities["mainEntity"] | nil
  getWorldEntity<T extends WorldEntityType>(layer: LayerNumber, type: T): WorldEntities[T] | nil
  /** Destroys the old world entity, if exists. If `entity` is not nil, sets the new world entity. */
  replaceWorldEntity(layer: LayerNumber, entity: WorldEntities["mainEntity"] | nil): void
  replaceWorldEntity<T extends WorldEntityType>(layer: LayerNumber, entity: WorldEntities[T] | nil, type: T): void
  destroyWorldEntity<T extends WorldEntityType>(layer: LayerNumber, type: T): void
  hasAnyWorldEntity(type: WorldEntityType): boolean
  destroyAllWorldEntities(type: WorldEntityType): void
  /** Iterates all valid world entities. May skip layers. */
  iterateWorldEntities<T extends WorldEntityType>(
    type: T,
  ): LuaIterable<LuaMultiReturn<[LayerNumber, NonNullable<WorldEntities[T]>]>>

  setProperty<T extends keyof LayerProperties>(layer: LayerNumber, key: T, value: LayerProperties[T] | nil): void
  getProperty<T extends keyof LayerProperties>(layer: LayerNumber, key: T): LayerProperties[T] | nil
  propertySetInAnyLayer(key: keyof LayerProperties): boolean
  clearPropertyInAllLayers<T extends keyof LayerProperties>(key: T): void
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
  public readonly categoryName: CategoryName
  public readonly position: Position
  public direction: defines.direction | nil

  public isSettingsRemnant: true | nil

  private baseLayer: LayerNumber
  private readonly baseValue: T
  private readonly layerChanges: Mutable<LayerChanges<T>> = {}
  private oldLayer: LayerNumber | nil

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

  hasLayerChange(layer?: LayerNumber): boolean {
    if (layer) return this.layerChanges[layer] !== nil
    return next(this.layerChanges)[0] !== nil
  }
  public getLayerChange(layer: LayerNumber): LayerDiff<T> | nil {
    return this.layerChanges[layer]
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
  getNameAtLayer(layer: LayerNumber): string {
    let name = this.baseValue.name
    if (layer <= this.baseLayer) return name
    for (const [changedLayer, diff] of pairs(this.layerChanges)) {
      if (changedLayer > layer) break
      if (diff.name) name = diff.name
    }
    return name
  }

  iterateValues(start: LayerNumber, end: LayerNumber): LuaIterable<LuaMultiReturn<[LayerNumber, Readonly<T> | nil]>>
  iterateValues(start: LayerNumber, end: LayerNumber) {
    const { baseLayer, baseValue } = this
    let value = this.getValueAtLayer(start)
    function next(layerValues: LayerChanges, prevLayer: LayerNumber | nil) {
      if (!prevLayer) {
        return $multi(start, value)
      }
      const nextLayer = prevLayer + 1
      if (nextLayer < baseLayer) return $multi(nextLayer, nil)
      if (nextLayer > end) return $multi()
      if (nextLayer === baseLayer) {
        value = shallowCopy(baseValue)
      } else {
        const diff = layerValues[nextLayer]
        if (diff) applyDiffToEntity(value!, diff)
      }
      return $multi(nextLayer, value)
    }
    return $multi<any>(next, this.layerChanges, nil)
  }

  adjustValueAtLayer(layer: LayerNumber, value: T): boolean {
    const { baseLayer, layerChanges } = this
    assert(layer >= baseLayer, "layer must be >= first layer")
    const diff = this.setValueAndGetDiff(layer, value)
    if (!diff) return false

    // trim diffs in higher layers, remove those that are ineffectual
    for (const [layerNumber, changes] of pairs(layerChanges)) {
      if (layerNumber <= layer) continue
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

    this.oldLayer = nil
    return true
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
  private moveUp(higherLayer: LayerNumber): void {
    const { baseValue } = this
    const { layerChanges } = this
    for (const [changeLayer, changed] of pairs(layerChanges)) {
      if (changeLayer > higherLayer) break
      applyDiffToEntity(baseValue, changed)
      layerChanges[changeLayer] = nil
    }
    this.baseLayer = higherLayer
  }
  moveToLayer(layer: LayerNumber, recordOldLayer?: boolean): LayerNumber {
    const { baseLayer } = this
    if (layer > baseLayer) {
      this.moveUp(layer)
    } else if (layer < baseLayer) {
      this.baseLayer = layer
    }
    this.oldLayer = recordOldLayer && baseLayer !== layer ? baseLayer : nil
    return baseLayer
    // else do nothing
  }
  getOldLayer(): LayerNumber | nil {
    return this.oldLayer
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
      while (curKey) {
        const key = curKey
        curKey = next(byType, key)[0]
        const entity = byType[key]!
        if (entity.valid) return $multi(key, entity)
        delete byType[key]
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
    return this.layerProperties[key] !== nil
  }
  clearPropertyInAllLayers<T extends keyof LayerProperties>(key: T): void {
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
