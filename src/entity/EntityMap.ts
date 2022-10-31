/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { oppositedirection } from "util"
import { isEmpty, RegisterClass } from "../lib"
import { BBox, Position } from "../lib/geometry"
import { AsmCircuitConnection, circuitConnectionEquals } from "./AsmCircuitConnection"
import { AssemblyEntity, StageNumber } from "./AssemblyEntity"
import { BasicEntityInfo } from "./Entity"
import { getEntityCategory, getPasteRotatableType, PasteRotatableType, rollingStockTypes } from "./entity-info"
import { getRegisteredAssemblyEntity } from "./entity-registration"
import { migrateMap2d060, MutableMap2D, newMap2D } from "./map2d"

/**
 * A collection of assembly entities: the actual data of an assembly.
 *
 * Also keeps tracks of wires and circuit connections.
 */
export interface EntityMap {
  findCompatibleByName(entityName: string, position: Position, direction: defines.direction | nil): AssemblyEntity | nil
  findCompatible(entity: BasicEntityInfo, previousDirection: defines.direction | nil): AssemblyEntity | nil
  findCompatibleAnyDirection(entityName: string, position: Position): AssemblyEntity | nil
  findExactAtPosition(entity: LuaEntity, expectedStage: StageNumber, oldPosition: Position): AssemblyEntity | nil

  getCircuitConnections(entity: AssemblyEntity): AsmEntityCircuitConnections | nil
  getCableConnections(entity: AssemblyEntity): AsmEntityCableConnections | nil

  countNumEntities(): number
  iterateAllEntities(): LuaPairsKeyIterable<AssemblyEntity>

  /**
   * Will return slightly larger than actual
   */
  computeBoundingBox(): BoundingBox | nil
}

export const enum CableAddResult {
  Added,
  Error,
  AlreadyExists,
  MaxConnectionsReached,
}
const MaxCableConnections = 5 // hard-coded in game

export interface MutableEntityMap extends EntityMap {
  add(entity: AssemblyEntity): void
  delete(entity: AssemblyEntity): void

  changePosition(entity: AssemblyEntity, position: Position): boolean

  /** Returns if connection was successfully added. */
  addCircuitConnection(circuitConnection: AsmCircuitConnection): boolean
  removeCircuitConnection(circuitConnection: AsmCircuitConnection): void

  addCableConnection(entity1: AssemblyEntity, entity2: AssemblyEntity): CableAddResult
  removeCableConnection(entity1: AssemblyEntity, entity2: AssemblyEntity): void

  /** Modifies all entities */
  insertStage(stageNumber: StageNumber): void
  deleteStage(stageNumber: StageNumber): void
}

export type AsmEntityCircuitConnections = LuaMap<AssemblyEntity, LuaSet<AsmCircuitConnection>>
export type AsmEntityCableConnections = LuaSet<AssemblyEntity>

function isSingle(entity: AssemblyEntity | readonly AssemblyEntity[]): entity is AssemblyEntity {
  return (entity as AssemblyEntity).firstStage !== nil
}

@RegisterClass("EntityMap")
class EntityMapImpl implements MutableEntityMap {
  readonly byPosition: MutableMap2D<AssemblyEntity> = newMap2D()
  entities = new LuaSet<AssemblyEntity>()
  circuitConnections = new LuaMap<AssemblyEntity, AsmEntityCircuitConnections>()
  cableConnections = new LuaMap<AssemblyEntity, AsmEntityCableConnections>()

  findCompatibleByName(
    entityName: string,
    position: Position,
    direction: defines.direction | nil,
  ): AssemblyEntity | nil {
    const { x, y } = position
    const atPos = this.byPosition.get(x, y)
    if (!atPos) return
    if (direction === 0) direction = nil
    const category = getEntityCategory(entityName)

    if (isSingle(atPos)) {
      if (atPos.direction !== direction) return nil
      if (category === nil) {
        if (atPos.firstValue.name === entityName) return atPos
        return nil
      }
      if (getEntityCategory(atPos.firstValue.name) === category) return atPos
      return nil
    }

    if (category === nil) {
      for (const candidate of atPos) {
        if (candidate.direction === direction && candidate.firstValue.name === entityName) return candidate
      }
      return nil
    }
    for (const candidate of atPos) {
      if (candidate.direction === direction && getEntityCategory(candidate.firstValue.name) === category)
        return candidate
    }
    return nil
  }

  findCompatibleAnyDirection(entityName: string, position: Position): AssemblyEntity | nil {
    const { x, y } = position
    const atPos = this.byPosition.get(x, y)
    const category = getEntityCategory(entityName)
    if (!atPos) return
    if (isSingle(atPos)) {
      if (atPos.firstValue.name === entityName) return atPos
      if (category === nil) {
        if (atPos.firstValue.name === entityName) return atPos
        return nil
      }
      if (getEntityCategory(atPos.firstValue.name) === category) return atPos
      return nil
    }

    if (category === nil) {
      for (const candidate of atPos) {
        if (candidate.firstValue.name === entityName) return candidate
      }
      return nil
    }
    for (const candidate of atPos) {
      if (getEntityCategory(candidate.firstValue.name) === category) return candidate
    }
    return nil
  }

  findCompatible(
    entity: BasicEntityInfo | LuaEntity,
    previousDirection?: defines.direction | nil,
  ): AssemblyEntity | nil {
    const type = entity.type
    if (type === "underground-belt") {
      const direction = entity.belt_to_ground_type === "output" ? oppositedirection(entity.direction) : entity.direction
      return this.findCompatibleByName(type, entity.position, direction)
    } else if (rollingStockTypes.has(type)) {
      if (entity.object_name === "LuaEntity") {
        const registered = getRegisteredAssemblyEntity(entity as LuaEntity)
        if (registered && this.entities.has(registered)) return registered
      }
      return nil
    }
    const name = entity.name
    const pasteRotatableType = getPasteRotatableType(name)
    if (pasteRotatableType === nil) {
      return this.findCompatibleByName(name, entity.position, previousDirection ?? entity.direction)
    }
    if (pasteRotatableType === PasteRotatableType.Square) {
      return this.findCompatibleAnyDirection(name, entity.position)
    }
    if (pasteRotatableType === PasteRotatableType.Rectangular) {
      const direction = previousDirection ?? entity.direction
      const position = entity.position
      return (
        this.findCompatibleByName(name, position, direction) ??
        this.findCompatibleByName(name, position, oppositedirection(direction))
      )
    }
  }

  findExactAtPosition(entity: LuaEntity, expectedStage: StageNumber, oldPosition: Position): AssemblyEntity | nil {
    const atPos = this.byPosition.get(oldPosition.x, oldPosition.y)
    if (!atPos) return
    if (isSingle(atPos)) {
      if (atPos.getWorldOrPreviewEntity(expectedStage) === entity) return atPos
      return nil
    }
    for (const candidate of atPos) {
      if (candidate.getWorldOrPreviewEntity(expectedStage) === entity) return candidate
    }
    return nil
  }

  countNumEntities(): number {
    return table_size(this.entities)
  }
  iterateAllEntities(): LuaPairsKeyIterable<AssemblyEntity> {
    return this.entities
  }

  computeBoundingBox(): BoundingBox | nil {
    if (isEmpty(this.entities)) return nil
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity
    for (const entity of this.entities) {
      const { x, y } = entity.position
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
    return BBox.expand(BBox.coords(minX, minY, maxX, maxY), 20)
  }

  add(entity: AssemblyEntity): void {
    const { entities } = this
    if (entities.has(entity)) return
    this.entities.add(entity)
    const { x, y } = entity.position
    this.byPosition.add(x, y, entity)
  }

  delete(entity: AssemblyEntity): void {
    const { entities } = this
    if (!entities.has(entity)) return
    entities.delete(entity)
    const { x, y } = entity.position
    this.byPosition.delete(x, y, entity)

    this.removeAllConnections(entity, this.circuitConnections)
    this.removeAllConnections(entity, this.cableConnections)
  }

  changePosition(entity: AssemblyEntity, position: Position): boolean {
    if (!this.entities.has(entity)) return false
    const { x, y } = entity.position
    const { x: newX, y: newY } = position
    if (x === newX && y === newY) return false
    const { byPosition } = this
    byPosition.delete(x, y, entity)
    entity.setPositionUnchecked(position)
    byPosition.add(newX, newY, entity)
    return true
  }

  private removeAllConnections(
    entity: AssemblyEntity,
    map: LuaMap<AssemblyEntity, AsmEntityCircuitConnections> | LuaMap<AssemblyEntity, AsmEntityCableConnections>,
  ) {
    const entityData = map.get(entity)
    if (!entityData) return
    map.delete(entity)

    for (const otherEntity of entityData as LuaSet<AssemblyEntity>) {
      const otherData = map.get(otherEntity)
      if (otherData) {
        otherData.delete(entity)
        if (isEmpty(otherData)) map.delete(otherEntity)
      }
    }
  }

  getCircuitConnections(entity: AssemblyEntity): AsmEntityCircuitConnections | nil {
    return this.circuitConnections.get(entity)
  }
  addCircuitConnection(circuitConnection: AsmCircuitConnection): boolean {
    const { entities, circuitConnections } = this
    const { fromEntity, toEntity } = circuitConnection
    if (!entities.has(fromEntity) || !entities.has(toEntity)) return false

    let fromConnections = circuitConnections.get(fromEntity)

    if (fromConnections) {
      const fromSet = fromConnections.get(toEntity)
      if (fromSet) {
        for (const otherConnection of fromSet) {
          if (circuitConnectionEquals(circuitConnection, otherConnection)) {
            return false
          }
        }
      }
    }

    if (!fromConnections) {
      fromConnections = new LuaMap()
      circuitConnections.set(fromEntity, fromConnections)
    }

    let toConnections = circuitConnections.get(toEntity)
    if (!toConnections) {
      toConnections = new LuaMap()
      circuitConnections.set(toEntity, toConnections)
    }

    const fromSet = fromConnections.get(toEntity),
      toSet = toConnections.get(fromEntity)

    if (fromSet) {
      fromSet.add(circuitConnection)
    } else {
      fromConnections.set(toEntity, newLuaSet(circuitConnection))
    }
    if (toSet) {
      toSet.add(circuitConnection)
    } else {
      toConnections.set(fromEntity, newLuaSet(circuitConnection))
    }
    return true
  }

  removeCircuitConnection(circuitConnection: AsmCircuitConnection): void {
    const { circuitConnections } = this
    const { fromEntity, toEntity } = circuitConnection

    const fromConnections = circuitConnections.get(fromEntity),
      toConnections = circuitConnections.get(toEntity)
    if (!fromConnections || !toConnections) return
    const fromSet = fromConnections.get(toEntity)
    if (fromSet) {
      fromSet.delete(circuitConnection)
      if (isEmpty(fromSet)) {
        fromConnections.delete(toEntity)
        if (isEmpty(fromConnections)) {
          circuitConnections.delete(fromEntity)
        }
      }
    }
    const toSet = toConnections.get(fromEntity)
    if (toSet) {
      toSet.delete(circuitConnection)
      if (isEmpty(toSet)) {
        toConnections.delete(fromEntity)
        if (isEmpty(toConnections)) {
          circuitConnections.delete(toEntity)
        }
      }
    }
  }

  getCableConnections(entity: AssemblyEntity): AsmEntityCableConnections | nil {
    return this.cableConnections.get(entity)
  }

  addCableConnection(entity1: AssemblyEntity, entity2: AssemblyEntity): CableAddResult {
    if (entity1 === entity2) return CableAddResult.Error
    const { entities, cableConnections } = this
    if (!entities.has(entity1) || !entities.has(entity2)) return CableAddResult.Error
    let data1 = cableConnections.get(entity1)
    let data2 = cableConnections.get(entity2)

    if (data1) {
      if (data1.has(entity2)) return CableAddResult.AlreadyExists
      if (table_size(data1) >= MaxCableConnections) return CableAddResult.MaxConnectionsReached
    }
    if (data2) {
      if (data2.has(entity1)) return CableAddResult.AlreadyExists
      if (table_size(data2) >= MaxCableConnections) return CableAddResult.MaxConnectionsReached
    }

    if (data1) {
      data1.add(entity2)
    } else {
      data1 = newLuaSet(entity2)
      cableConnections.set(entity1, data1)
    }

    if (data2) {
      data2.add(entity1)
    } else {
      data2 = newLuaSet(entity1)
      cableConnections.set(entity2, data2)
    }

    return CableAddResult.Added
  }

  removeCableConnection(entity1: AssemblyEntity, entity2: AssemblyEntity): void {
    const { cableConnections } = this
    const data1 = cableConnections.get(entity1)
    if (data1) {
      data1.delete(entity2)
      if (isEmpty(data1)) {
        cableConnections.delete(entity1)
      }
    }
    const data2 = cableConnections.get(entity2)
    if (data2) {
      data2.delete(entity1)
      if (isEmpty(data2)) {
        cableConnections.delete(entity2)
      }
    }
  }

  insertStage(stageNumber: StageNumber): void {
    for (const entity of this.entities) {
      entity.insertStage(stageNumber)
    }
  }
  deleteStage(stageNumber: StageNumber): void {
    for (const entity of this.entities) {
      entity.deleteStage(stageNumber)
    }
  }
}

export function newEntityMap(): MutableEntityMap {
  return new EntityMapImpl()
}

export function migrateMap030(_content: MutableEntityMap): void {
  interface OldEntityMap {
    entities: LuaMap<AssemblyEntity, AsmEntityCircuitConnections>
  }
  const content = _content as EntityMapImpl

  const oldEntities = (content as unknown as OldEntityMap).entities
  content.circuitConnections = oldEntities
  const entities = (content.entities = new LuaSet<AssemblyEntity>())
  for (const [entity] of oldEntities) {
    entities.add(entity)
  }
  content.cableConnections = new LuaMap()
}

export function migrateMap060(content: MutableEntityMap): void {
  migrateMap2d060((content as EntityMapImpl).byPosition)
}
