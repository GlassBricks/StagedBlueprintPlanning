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
import { AsmCircuitConnection, circuitConnectionEquals } from "../entity/AsmCircuitConnection"
import { AssemblyEntity, StageNumber } from "../entity/AssemblyEntity"
import { BasicEntityInfo, Entity } from "../entity/Entity"
import { getEntityCategory, getPasteRotatableType, PasteRotatableType } from "../entity/entity-info"
import { isEmpty, MutableMap2D, newMap2D, RegisterClass } from "../lib"
import { Position } from "../lib/geometry"

export interface EntityMap {
  has(entity: AssemblyEntity): boolean
  findCompatibleBasic(entityName: string, position: Position, direction: defines.direction | nil): AssemblyEntity | nil
  findCompatible(
    entity: BasicEntityInfo,
    position: Position,
    previousDirection: defines.direction | nil,
  ): AssemblyEntity | nil
  findCompatibleAnyDirection(entityName: string, position: Position): AssemblyEntity | nil

  getCircuitConnections(entity: AssemblyEntity): AsmEntityCircuitConnections | nil

  countNumEntities(): number
  iterateAllEntities(): LuaPairsKeyIterable<AssemblyEntity>
}

export interface MutableEntityMap extends EntityMap {
  add<E extends Entity = Entity>(entity: AssemblyEntity<E>): void
  delete<E extends Entity = Entity>(entity: AssemblyEntity<E>): void

  /** Returns if connection was successfully added. */
  addCircuitConnection(circuitConnection: AsmCircuitConnection): boolean
  removeCircuitConnection(circuitConnection: AsmCircuitConnection): void

  /** Modifies all entities */
  insertStage(stageNumber: StageNumber): void
  deleteStage(stageNumber: StageNumber): void
}

export type AsmEntityCircuitConnections = LuaMap<AssemblyEntity, LuaSet<AsmCircuitConnection>>
type EntityData = AsmEntityCircuitConnections

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
    const pasteRotatableType = getPasteRotatableType(name)
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

  getCircuitConnections(entity: AssemblyEntity): AsmEntityCircuitConnections | nil {
    const value = this.entities.get(entity)
    if (value && next(value)[0] !== nil) return value as AsmEntityCircuitConnections
  }
  addCircuitConnection(circuitConnection: AsmCircuitConnection): boolean {
    const { entities } = this
    const { fromEntity, toEntity } = circuitConnection
    const fromData = entities.get(fromEntity),
      toData = entities.get(toEntity)
    if (!fromData || !toData) return false

    const fromSet = fromData.get(toEntity),
      toSet = toData.get(fromEntity)
    if (fromSet) {
      for (const otherConnection of fromSet) {
        if (circuitConnectionEquals(circuitConnection, otherConnection)) return false
      }
    }
    if (fromSet) {
      fromSet.add(circuitConnection)
    } else {
      fromData.set(toEntity, newLuaSet(circuitConnection))
    }
    if (toSet) {
      toSet.add(circuitConnection)
    } else {
      toData.set(fromEntity, newLuaSet(circuitConnection))
    }
    return true
  }

  removeCircuitConnection(circuitConnection: AsmCircuitConnection): void {
    const { entities } = this
    const { fromEntity, toEntity } = circuitConnection

    const fromData = entities.get(fromEntity),
      toData = entities.get(toEntity)
    if (fromData) {
      const fromSet = fromData.get(toEntity)
      if (fromSet) {
        fromSet.delete(circuitConnection)
        if (isEmpty(fromSet)) fromData.delete(toEntity)
      }
    }
    if (toData) {
      const toSet = toData.get(fromEntity)
      if (toSet) {
        toSet.delete(circuitConnection)
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
