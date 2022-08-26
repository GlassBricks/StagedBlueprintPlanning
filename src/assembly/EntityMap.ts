/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of 100% Blueprint Planning.
 *
 * 100% Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * 100% Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with 100% Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { oppositedirection } from "util"
import { AssemblyEntity, StageNumber } from "../entity/AssemblyEntity"
import { AssemblyWireConnection, wireConnectionEquals } from "../entity/AssemblyWireConnection"
import { BasicEntityInfo, Entity } from "../entity/Entity"
import { getEntityCategory, getPastRotatableType, PasteRotatableType } from "../entity/entity-info"
import { isEmpty, RegisterClass } from "../lib"
import { Position } from "../lib/geometry"
import { MutableMap2D, newMap2D } from "../lib/map2d"

export interface EntityMap {
  has(entity: AssemblyEntity): boolean
  findCompatibleBasic(entityName: string, position: Position, direction: defines.direction | nil): AssemblyEntity | nil
  findCompatible(
    entity: BasicEntityInfo,
    position: Position,
    previousDirection: defines.direction | nil,
  ): AssemblyEntity | nil
  findCompatibleAnyDirection(entityName: string, position: Position): AssemblyEntity | nil

  getWireConnections(entity: AssemblyEntity): AssemblyEntityConnections | nil

  countNumEntities(): number
  iterateAllEntities(): LuaPairsKeyIterable<AssemblyEntity>
}

export interface MutableEntityMap extends EntityMap {
  add<E extends Entity = Entity>(entity: AssemblyEntity<E>): void
  delete<E extends Entity = Entity>(entity: AssemblyEntity<E>): void

  /** Returns if connection was successfully added. */
  addWireConnection(wireConnection: AssemblyWireConnection): boolean
  removeWireConnection(wireConnection: AssemblyWireConnection): void

  /** Modifies all entities */
  insertStage(stageNumber: StageNumber): void
  deleteStage(stageNumber: StageNumber): void
}

export type AssemblyEntityConnections = LuaMap<AssemblyEntity, LuaSet<AssemblyWireConnection>>
type EntityData = LuaMap<AssemblyEntity, LuaSet<AssemblyWireConnection>>

@RegisterClass("EntityMap")
class EntityMapImpl implements MutableEntityMap {
  private readonly byPosition: MutableMap2D<AssemblyEntity> = newMap2D()
  private readonly entities = new LuaMap<AssemblyEntity, EntityData>()

  has(entity: AssemblyEntity): boolean {
    return this.entities.has(entity)
  }

  findCompatibleBasic(
    entityName: string,
    position: Position,
    direction: defines.direction | nil,
  ): AssemblyEntity | nil {
    const { x, y } = position
    const atPos = this.byPosition.get(x, y)
    if (!atPos) return
    const categoryName = getEntityCategory(entityName)
    if (direction === 0) direction = nil
    for (const candidate of atPos) {
      if (candidate.categoryName === categoryName && candidate.direction === direction) return candidate
    }
  }
  findCompatibleAnyDirection(entityName: string, position: Position): AssemblyEntity | nil {
    const { x, y } = position
    const atPos = this.byPosition.get(x, y)
    if (!atPos) return
    const categoryName = getEntityCategory(entityName)
    for (const candidate of atPos) {
      if (candidate.categoryName === categoryName) return candidate
    }
  }

  findCompatible(
    entity: BasicEntityInfo,
    position: Position,
    previousDirection?: defines.direction | nil,
  ): AssemblyEntity | nil {
    const type = entity.type
    if (type === "underground-belt") {
      const direction = entity.belt_to_ground_type === "output" ? oppositedirection(entity.direction) : entity.direction
      return this.findCompatibleBasic(type, position, direction)
    }
    const name = entity.name
    const pasteRotatableType = getPastRotatableType(name)
    if (pasteRotatableType === PasteRotatableType.None) {
      return this.findCompatibleBasic(name, position, previousDirection ?? entity.direction)
    }
    if (pasteRotatableType === PasteRotatableType.Square) {
      return this.findCompatibleAnyDirection(name, position)
    }
    if (pasteRotatableType === PasteRotatableType.Rectangular) {
      const direction = previousDirection ?? entity.direction
      return (
        this.findCompatibleBasic(name, position, direction) ??
        this.findCompatibleBasic(name, position, oppositedirection(direction))
      )
    }
  }

  countNumEntities(): number {
    return table_size(this.entities)
  }
  iterateAllEntities(): LuaPairsKeyIterable<AssemblyEntity> {
    return this.entities as any
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

  getWireConnections(entity: AssemblyEntity): AssemblyEntityConnections | nil {
    const value = this.entities.get(entity)
    if (value && next(value)[0] !== nil) return value as AssemblyEntityConnections
  }
  addWireConnection(wireConnection: AssemblyWireConnection): boolean {
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

  removeWireConnection(wireConnection: AssemblyWireConnection): void {
    const { entities } = this
    const { fromEntity, toEntity } = wireConnection

    const fromData = entities.get(fromEntity),
      toData = entities.get(toEntity)
    if (fromData) {
      const fromSet = fromData.get(toEntity)
      if (fromSet) {
        fromSet.delete(wireConnection)
        if (isEmpty(fromSet)) fromData.delete(toEntity)
      }
    }
    if (toData) {
      const toSet = toData.get(fromEntity)
      if (toSet) {
        toSet.delete(wireConnection)
        if (isEmpty(toSet)) toData.delete(fromEntity)
      }
    }
  }

  insertStage(stageNumber: StageNumber): void {
    for (const [entity] of this.entities) {
      entity.insertStage(stageNumber)
    }
  }
  deleteStage(stageNumber: StageNumber): void {
    for (const [entity] of this.entities) {
      entity.deleteStage(stageNumber)
    }
  }
}

export function newEntityMap(): MutableEntityMap {
  return new EntityMapImpl()
}
