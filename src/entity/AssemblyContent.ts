/*
 * Copyright (c) 2022-2023 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { oppositedirection } from "util"
import { Prototypes } from "../constants"
import { isEmpty, RegisterClass } from "../lib"
import { BBox, Position } from "../lib/geometry"
import { AsmCircuitConnection, circuitConnectionEquals } from "./AsmCircuitConnection"
import { AssemblyEntity, StageNumber, UndergroundBeltAssemblyEntity } from "./AssemblyEntity"
import { BasicEntityInfo } from "./Entity"
import {
  getEntityCategory,
  getPasteRotatableType,
  isRollingStockType,
  nameToType,
  PasteRotatableType,
  rollingStockTypes,
} from "./entity-info"
import { _migrateMap2DToLinkedList, Map2D, newMap2D } from "./map2d"
import { getRegisteredAssemblyEntity } from "./registration"
import { getUndergroundDirection } from "./underground-belt"

/**
 * A collection of assembly entities: the actual data of an assembly.
 *
 * Also keeps tracks of info spanning multiple entities (wire/circuit connections).
 */
export interface AssemblyContent {
  findCompatibleByProps(
    entityName: string,
    position: Position,
    direction: defines.direction | nil,
    stage: StageNumber,
  ): AssemblyEntity | nil
  findCompatibleWithLuaEntity(
    entity: BasicEntityInfo,
    previousDirection: defines.direction | nil,
    stage: StageNumber,
  ): AssemblyEntity | nil

  findExact(entity: LuaEntity, position: Position, stage: StageNumber): AssemblyEntity | nil

  findCompatibleFromPreview(previewEntity: LuaEntity, stage: StageNumber): AssemblyEntity | nil
  findCompatibleFromLuaEntityOrPreview(entity: LuaEntity, stage: StageNumber): AssemblyEntity | nil

  getCircuitConnections(entity: AssemblyEntity): AsmEntityCircuitConnections | nil
  getCableConnections(entity: AssemblyEntity): AsmEntityCableConnections | nil

  countNumEntities(): number
  iterateAllEntities(): LuaPairsKeyIterable<AssemblyEntity>

  /**
   * Will return slightly larger than actual
   */
  computeBoundingBox(): BoundingBox | nil

  canMoveFirstStageDown(entity: AssemblyEntity, newStage: StageNumber): boolean
  canMoveLastStageUp(entity: AssemblyEntity, newStage: StageNumber): boolean
}

export const enum CableAddResult {
  Added,
  Error,
  AlreadyExists,
  MaxConnectionsReached,
}
const MaxCableConnections = 5 // hard-coded in game

export interface MutableAssemblyContent extends AssemblyContent {
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

@RegisterClass("EntityMap")
class AssemblyContentImpl implements MutableAssemblyContent {
  readonly byPosition: Map2D<AssemblyEntity> = newMap2D()
  entities = new LuaSet<AssemblyEntity>()
  circuitConnections = new LuaMap<AssemblyEntity, AsmEntityCircuitConnections>()
  cableConnections = new LuaMap<AssemblyEntity, AsmEntityCableConnections>()

  findCompatibleByProps(
    entityName: string,
    position: Position,
    direction: defines.direction | nil,
    stage: StageNumber,
  ): AssemblyEntity | nil {
    const { x, y } = position
    let cur = this.byPosition.get(x, y)
    if (!cur) return
    const category = getEntityCategory(entityName)

    let candidate: AssemblyEntity | nil = nil
    // out of possible candidates, find one with smallest firstStage

    while (cur != nil) {
      if (
        (direction == nil || direction == (cur.direction ?? 0)) &&
        (cur.lastStage == nil || cur.lastStage >= stage) &&
        (cur.firstValue.name == entityName || (category && getEntityCategory(cur.firstValue.name) == category)) &&
        (candidate == nil || cur.firstStage < candidate.firstStage)
      ) {
        candidate = cur
      }
      cur = cur._next
    }
    return candidate
  }

  findCompatibleWithLuaEntity(
    entity: {
      name: string
      type: string
      position: Position
      direction: defines.direction
      belt_to_ground_type?: "input" | "output"
      object_name?: string
    },
    previousDirection: defines.direction | nil,
    stage: StageNumber,
  ): AssemblyEntity | nil {
    const type = entity.type
    if (type == "underground-belt") {
      const found = this.findCompatibleByProps(type, entity.position, nil, stage)
      if (
        found &&
        getUndergroundDirection(found.getDirection(), (found as UndergroundBeltAssemblyEntity).firstValue.type) ==
          getUndergroundDirection(entity.direction, entity.belt_to_ground_type)
      )
        return found
      return nil
    } else if (rollingStockTypes.has(type)) {
      if (entity.object_name == "LuaEntity") {
        const registered = getRegisteredAssemblyEntity(entity as LuaEntity)
        if (registered && this.entities.has(registered)) return registered
      }
      return nil
    }
    // now, worldDirection == savedDirection
    const name = entity.name
    const pasteRotatableType = getPasteRotatableType(name)
    if (pasteRotatableType == nil) {
      return this.findCompatibleByProps(name, entity.position, previousDirection ?? entity.direction, stage)
    }
    if (pasteRotatableType == PasteRotatableType.Square) {
      return this.findCompatibleByProps(name, entity.position, nil, stage)
    }
    if (pasteRotatableType == PasteRotatableType.RectangularOrStraightRail) {
      const direction = previousDirection ?? entity.direction
      const position = entity.position
      if (direction % 2 == 1) {
        // if diagonal, we _do_ care about direction
        return this.findCompatibleByProps(name, position, direction, stage)
      }
      return (
        this.findCompatibleByProps(name, position, direction, stage) ??
        this.findCompatibleByProps(name, position, oppositedirection(direction), stage)
      )
    }
  }

  findCompatibleFromPreview(previewEntity: LuaEntity, stage: StageNumber): AssemblyEntity | nil {
    const actualName = previewEntity.name.substring(Prototypes.PreviewEntityPrefix.length)
    const direction = isRollingStockType(actualName) ? 0 : previewEntity.direction
    return this.findCompatibleByProps(actualName, previewEntity.position, direction, stage)
  }

  findCompatibleFromLuaEntityOrPreview(entity: LuaEntity, stage: StageNumber): AssemblyEntity | nil {
    const name = entity.name
    if (name.startsWith(Prototypes.PreviewEntityPrefix)) {
      return this.findCompatibleFromPreview(entity, stage)
    }
    return this.findCompatibleWithLuaEntity(entity, nil, stage)
  }

  findExact(entity: LuaEntity, position: Position, stage: StageNumber): AssemblyEntity | nil {
    let cur = this.byPosition.get(position.x, position.y)
    while (cur != nil) {
      if (cur.getWorldOrPreviewEntity(stage) == entity) return cur
      cur = cur._next
    }
    return nil
  }

  countNumEntities(): number {
    return table_size(this.entities)
  }
  iterateAllEntities(): LuaPairsKeyIterable<AssemblyEntity> {
    return this.entities
  }

  public canMoveFirstStageDown(entity: AssemblyEntity, newStage: StageNumber): boolean {
    const name = entity.firstValue.name
    const foundBelow = this.findCompatibleWithLuaEntity(
      {
        name,
        type: nameToType.get(name)!,
        position: entity.position,
        direction: entity.getDirection(),
      },
      nil,
      newStage,
    )

    return foundBelow == nil || foundBelow == entity
  }
  public canMoveLastStageUp(entity: AssemblyEntity, newStage: StageNumber): boolean {
    const { lastStage } = entity
    if (lastStage == nil) return true
    const name = entity.firstValue.name
    const foundAbove = this.findCompatibleWithLuaEntity(
      {
        name,
        type: nameToType.get(name)!,
        position: entity.position,
        direction: entity.getDirection(),
      },
      nil,
      lastStage + 1,
    )
    return foundAbove == nil || foundAbove.firstStage > newStage
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
    entities.add(entity)
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
    if (x == newX && y == newY) return false
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
    if (entity1 == entity2) return CableAddResult.Error
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

  __tostring(): string {
    return `AssemblyContent(${tostring(this.entities)}`
  }
}

export function newAssemblyContent(): MutableAssemblyContent {
  return new AssemblyContentImpl()
}

export function _migrateAssemblyContent0_18_0(content: MutableAssemblyContent): void {
  _migrateMap2DToLinkedList((content as AssemblyContentImpl).byPosition)
}
