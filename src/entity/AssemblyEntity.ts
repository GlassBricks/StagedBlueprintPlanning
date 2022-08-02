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

import { mutableShallowCopy, PRecord, RegisterClass } from "../lib"
import { Position } from "../lib/geometry"
import { applyDiffToEntity, LayerDiff } from "./diff"
import { Entity, EntityPose } from "./Entity"

export type LayerNumber = number

export interface AssemblyEntity<out E extends Entity = Entity> extends EntityPose {
  readonly categoryName: string
  direction: defines.direction | nil
  /** First layer this entity appears in */
  layerNumber: LayerNumber
  /** Value at the first layer */
  baseEntity: E
  /** Changes to properties at successive layers. */
  layerChanges?: Readonly<LayerChanges<E>>
  /** If this entity is a lost reference */
  isLostReference?: true

  readonly _worldEntities: PRecord<LayerNumber, LuaEntity>
  readonly _highlights: PRecord<LayerNumber, EntityHighlights>

  getValueAtLayer(layer: LayerNumber): E | nil
  getWorldEntity(layer: LayerNumber): LuaEntity | nil
  destroyWorldEntity(layer: LayerNumber): void
  replaceOrDestroyWorldEntity(layer: LayerNumber, entity: LuaEntity | nil): void
  iterateWorldEntities(entity: AssemblyEntity): LuaIterable<LuaMultiReturn<[LayerNumber, LuaEntity]>>
}

export type LayerChanges<E extends Entity = Entity> = PRecord<LayerNumber, LayerDiff<E>>

export interface EntityHighlights {
  error?: HighlightBoxEntity
}

@RegisterClass("AssemblyEntity")
class AssemblyEntityImpl<T extends Entity = Entity> implements AssemblyEntity<T> {
  readonly categoryName: string
  public direction: defines.direction | nil
  _worldEntities: PRecord<LayerNumber, LuaEntity> = {}
  _highlights: PRecord<LayerNumber, EntityHighlights> = {}
  layerChanges?: PRecord<LayerNumber, LayerDiff<T>>
  constructor(
    public layerNumber: LayerNumber,
    public baseEntity: T,
    public position: Position,
    direction: defines.direction | nil,
  ) {
    this.categoryName = getCategoryName(baseEntity)
    this.direction = direction === 0 ? nil : direction
  }

  getValueAtLayer(layer: LayerNumber): T | nil {
    assert(layer >= 1, "layer must be >= 1")
    if (this.layerNumber > layer) return nil
    const value = mutableShallowCopy(this.baseEntity)
    const { layerChanges } = this
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

  getWorldEntity(layer: LayerNumber): LuaEntity | nil {
    const { _worldEntities } = this
    const worldEntity = _worldEntities[layer]
    if (!worldEntity || !worldEntity.valid) {
      delete _worldEntities[layer]
      return nil
    }
    return worldEntity
  }
  destroyWorldEntity(layer: LayerNumber): void {
    const { _worldEntities } = this
    const worldEntity = _worldEntities[layer]
    if (worldEntity && worldEntity.valid) worldEntity.destroy()
    delete _worldEntities[layer]
  }
  replaceOrDestroyWorldEntity(layer: LayerNumber, entity: LuaEntity | nil): void {
    const { _worldEntities } = this
    const existing = _worldEntities[layer]
    if (existing && existing.valid && existing !== entity) existing.destroy()
    _worldEntities[layer] = entity
  }

  public iterateWorldEntities(entity: AssemblyEntity): LuaIterable<LuaMultiReturn<[LayerNumber, LuaEntity]>> {
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
