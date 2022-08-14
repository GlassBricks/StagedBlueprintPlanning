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

import { AssemblyEntity, isCompatibleEntity } from "../entity/AssemblyEntity"
import { Entity } from "../entity/Entity"
import { getEntityCategory } from "../entity/entity-info"
import { WireConnection, wireConnectionEquals } from "../entity/WireConnection"
import { RegisterClass } from "../lib"
import { Position } from "../lib/geometry"
import { MutableMap2D, newMap2D } from "../lib/map2d"

export interface EntityMap {
  has(entity: AssemblyEntity): boolean
  findCompatible(entity: Entity, position: Position, direction: defines.direction | nil): AssemblyEntity | nil

  getWireConnections(entity: AssemblyEntity): ReadonlyLuaMap<AssemblyEntity, ReadonlyLuaSet<WireConnection>> | nil

  countNumEntities(): number
}

export interface MutableEntityMap extends EntityMap {
  findCompatible(entity: Entity, position: Position, direction: defines.direction | nil): AssemblyEntity | nil

  add<E extends Entity = Entity>(entity: AssemblyEntity<E>): void
  delete<E extends Entity = Entity>(entity: AssemblyEntity<E>): void

  /** Returns if connection was successfully added. */
  addWireConnection(wireConnection: WireConnection): boolean
  removeWireConnection(wireConnection: WireConnection): void
}

type EntityData = LuaMap<AssemblyEntity, LuaSet<WireConnection>>

@RegisterClass("EntityMap")
class EntityMapImpl implements MutableEntityMap {
  private readonly byPosition: MutableMap2D<AssemblyEntity> = newMap2D()
  private readonly entities = new LuaMap<AssemblyEntity, EntityData>()

  has(entity: AssemblyEntity): boolean {
    return this.entities.has(entity)
  }

  findCompatible(entity: Entity, position: Position, direction: defines.direction | nil): AssemblyEntity | nil {
    const { x, y } = position
    const atPos = this.byPosition.get(x, y)
    if (!atPos) return
    const categoryName = getEntityCategory(entity.name)
    if (direction === 0) direction = nil
    for (const candidate of atPos) {
      if (isCompatibleEntity(candidate, categoryName, direction)) return candidate
    }
  }

  countNumEntities(): number {
    return table_size(this.entities)
  }

  add<E extends Entity = Entity>(entity: AssemblyEntity<E>): void {
    const { entities } = this
    if (entities.has(entity)) return
    this.entities.set(entity, new LuaMap())
    const { x, y } = entity.position
    this.byPosition.add(x, y, entity)
  }

  delete<E extends Entity = Entity>(entity: AssemblyEntity<E>): void {
    const { entities } = this
    const entityData = entities.get(entity)
    if (!entityData) return
    entities.delete(entity)
    const { x, y } = entity.position
    this.byPosition.delete(x, y, entity)
    // remove wire connections
    for (const [otherEntity] of entityData) {
      entities.get(otherEntity)?.delete(entity)
    }
  }

  getWireConnections(entity: AssemblyEntity): ReadonlyLuaMap<AssemblyEntity, ReadonlyLuaSet<WireConnection>> | nil {
    return this.entities.get(entity) as ReadonlyLuaMap<AssemblyEntity, ReadonlyLuaSet<WireConnection>> | nil
  }
  addWireConnection(wireConnection: WireConnection): boolean {
    const { entities } = this
    const { fromEntity, toEntity } = wireConnection
    const fromData = entities.get(fromEntity),
      toData = entities.get(toEntity)
    if (!fromData || !toData) return false

    const fromSet = fromData.get(toEntity),
      toSet = toData.get(fromEntity)
    if (fromSet) {
      for (const otherConnection of fromSet) {
        if (wireConnectionEquals(wireConnection, otherConnection)) return false
      }
    }
    // add wire connection
    if (fromSet) {
      fromSet.add(wireConnection)
    } else {
      fromData.set(toEntity, newLuaSet(wireConnection))
    }
    if (toSet) {
      toSet.add(wireConnection)
    } else {
      toData.set(fromEntity, newLuaSet(wireConnection))
    }
    return true
  }

  removeWireConnection(wireConnection: WireConnection): void {
    const { entities } = this
    const { fromEntity, toEntity } = wireConnection

    const fromData = entities.get(fromEntity),
      toData = entities.get(toEntity)
    if (fromData) fromData.get(toEntity)?.delete(wireConnection)
    if (toData) toData.get(fromEntity)?.delete(wireConnection)
  }
}

export function newEntityMap(): MutableEntityMap {
  return new EntityMapImpl()
}
