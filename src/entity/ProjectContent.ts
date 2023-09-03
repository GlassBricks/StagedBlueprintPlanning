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

import { BoundingBox, LuaEntity } from "factorio:runtime"
import { oppositedirection } from "util"
import { Prototypes } from "../constants"
import { isEmpty, RegisterClass } from "../lib"
import { BBox, Position } from "../lib/geometry"
import { circuitConnectionEquals, ProjectCircuitConnection } from "./circuit-connection"
import { EntityIdentification } from "./Entity"
import {
  EntityPrototypeInfo,
  isRollingStockType,
  OnEntityPrototypesLoaded,
  PasteCompatibleRotationType,
  rollingStockTypes,
} from "./entity-prototype-info"
import { _migrateMap2DToLinkedList, Map2D, newMap2D } from "./map2d"
import { ProjectEntity, StageNumber, UndergroundBeltProjectEntity } from "./ProjectEntity"
import { getRegisteredProjectEntity } from "./registration"
import { getUndergroundDirection } from "./underground-belt"

/**
 * A collection of project entities: the actual data of a project.
 *
 * Also keeps track of info spanning multiple entities (wire/circuit connections).
 */
export interface ProjectContent {
  has(entity: ProjectEntity): boolean

  findCompatibleByProps(
    entityName: string,
    position: Position,
    direction: defines.direction | nil,
    stage: StageNumber,
  ): ProjectEntity | nil
  findCompatibleWithLuaEntity(
    entity: EntityIdentification,
    previousDirection: defines.direction | nil,
    stage: StageNumber,
  ): ProjectEntity | nil
  findCompatibleWithExistingEntity(entity: ProjectEntity, stage: StageNumber): ProjectEntity | nil

  findExact(entity: LuaEntity, position: Position, stage: StageNumber): ProjectEntity | nil

  findCompatibleFromPreview(previewEntity: LuaEntity, stage: StageNumber): ProjectEntity | nil
  findCompatibleFromLuaEntityOrPreview(entity: LuaEntity, stage: StageNumber): ProjectEntity | nil

  getCircuitConnections(entity: ProjectEntity): ProjectEntityCircuitConnections | nil
  getCableConnections(entity: ProjectEntity): ProjectEntityCableConnections | nil

  countNumEntities(): number
  iterateAllEntities(): LuaPairsKeyIterable<ProjectEntity>

  /**
   * Will return slightly larger than actual
   */
  computeBoundingBox(): BoundingBox | nil
}

export const enum CableAddResult {
  Added = "Added",
  Error = "Error",
  AlreadyExists = "AlreadyExists",
  MaxConnectionsReached = "MaxConnectionsReached",
}
const MaxCableConnections = 5 // hard-coded in game

export interface MutableProjectContent extends ProjectContent {
  add(entity: ProjectEntity): void
  delete(entity: ProjectEntity): void

  changePosition(entity: ProjectEntity, position: Position): boolean

  /** Returns if connection was successfully added. */
  addCircuitConnection(circuitConnection: ProjectCircuitConnection): boolean
  removeCircuitConnection(circuitConnection: ProjectCircuitConnection): void

  addCableConnection(entity1: ProjectEntity, entity2: ProjectEntity): CableAddResult
  removeCableConnection(entity1: ProjectEntity, entity2: ProjectEntity): void

  /** Modifies all entities */
  insertStage(stageNumber: StageNumber): void
  deleteStage(stageNumber: StageNumber): void
}

export type ProjectEntityCircuitConnections = LuaMap<ProjectEntity, LuaSet<ProjectCircuitConnection>>
export type ProjectEntityCableConnections = LuaSet<ProjectEntity>

let nameToType: EntityPrototypeInfo["nameToType"]
let nameToCategory: EntityPrototypeInfo["nameToCategory"]
let pasteCompatibleRotations: EntityPrototypeInfo["pasteCompatibleRotations"]
OnEntityPrototypesLoaded.addListener((i) => {
  ;({ nameToType, nameToCategory, pasteCompatibleRotations } = i)
})

@RegisterClass("EntityMap")
class ProjectContentImpl implements MutableProjectContent {
  readonly byPosition: Map2D<ProjectEntity> = newMap2D()
  entities = new LuaSet<ProjectEntity>()
  circuitConnections = new LuaMap<ProjectEntity, ProjectEntityCircuitConnections>()
  cableConnections = new LuaMap<ProjectEntity, ProjectEntityCableConnections>()

  has(entity: ProjectEntity): boolean {
    return this.entities.has(entity)
  }

  findCompatibleByProps(
    entityName: string,
    position: Position,
    direction: defines.direction | nil,
    stage: StageNumber,
  ): ProjectEntity | nil {
    const { x, y } = position
    let cur = this.byPosition.get(x, y)
    if (!cur) return
    const category = nameToCategory.get(entityName)

    let candidate: ProjectEntity | nil = nil
    // out of possible candidates, find one with the smallest firstStage

    while (cur != nil) {
      const name = cur.firstValue.name
      if (
        (direction == nil || direction == cur.direction) &&
        (cur.lastStage == nil || cur.lastStage >= stage) &&
        (name == entityName || (category && nameToCategory.get(name) == category)) &&
        (candidate == nil || cur.firstStage < candidate.firstStage)
      ) {
        candidate = cur
      }
      cur = cur._next
    }
    return candidate
  }
  findCompatibleWithLuaEntity(
    entity: EntityIdentification,
    previousDirection: defines.direction | nil,
    stage: StageNumber,
  ): ProjectEntity | nil {
    const type = entity.type
    if (type == "underground-belt") {
      const found = this.findCompatibleByProps(type, entity.position, nil, stage)
      if (
        found &&
        getUndergroundDirection(found.direction, (found as UndergroundBeltProjectEntity).firstValue.type) ==
          getUndergroundDirection(entity.direction, entity.belt_to_ground_type)
      )
        return found
      return nil
    }
    if (rollingStockTypes.has(type)) {
      if (entity.object_name == "LuaEntity") {
        const registered = getRegisteredProjectEntity(entity as LuaEntity)
        if (registered && this.entities.has(registered)) return registered
      }
      return nil
    }
    // now, worldDirection == savedDirection
    const name = entity.name
    const pasteRotatableType = pasteCompatibleRotations.get(name)
    if (pasteRotatableType == nil) {
      return this.findCompatibleByProps(name, entity.position, previousDirection ?? entity.direction, stage)
    }
    if (pasteRotatableType == PasteCompatibleRotationType.AnyDirection) {
      return this.findCompatibleByProps(name, entity.position, nil, stage)
    }
    if (pasteRotatableType == PasteCompatibleRotationType.Flippable) {
      const direction = previousDirection ?? entity.direction
      const position = entity.position
      if (direction % 2 == 1) {
        // if diagonal, we _do_ care about the direction
        return this.findCompatibleByProps(name, position, direction, stage)
      }
      return (
        this.findCompatibleByProps(name, position, direction, stage) ??
        this.findCompatibleByProps(name, position, oppositedirection(direction), stage)
      )
    }
  }

  findCompatibleWithExistingEntity(entity: ProjectEntity, stage: StageNumber): ProjectEntity | nil {
    const name = entity.firstValue.name
    return this.findCompatibleWithLuaEntity(
      {
        name,
        type: nameToType.get(name) ?? "unknown",
        position: entity.position,
        direction: entity.direction,
        belt_to_ground_type: entity.isUndergroundBelt() ? entity.firstValue.type : nil,
      },
      nil,
      stage,
    )
  }

  findCompatibleFromPreview(previewEntity: LuaEntity, stage: StageNumber): ProjectEntity | nil {
    const actualName = previewEntity.name.substring(Prototypes.PreviewEntityPrefix.length)
    const direction = isRollingStockType(actualName) ? 0 : previewEntity.direction
    return this.findCompatibleByProps(actualName, previewEntity.position, direction, stage)
  }

  findCompatibleFromLuaEntityOrPreview(entity: LuaEntity, stage: StageNumber): ProjectEntity | nil {
    const name = entity.name
    if (name.startsWith(Prototypes.PreviewEntityPrefix)) {
      return this.findCompatibleFromPreview(entity, stage)
    }
    return this.findCompatibleWithLuaEntity(entity, nil, stage)
  }

  findExact(entity: LuaEntity, position: Position, stage: StageNumber): ProjectEntity | nil {
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
  iterateAllEntities(): LuaPairsKeyIterable<ProjectEntity> {
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

  add(entity: ProjectEntity): void {
    const { entities } = this
    if (entities.has(entity)) return
    entities.add(entity)
    const { x, y } = entity.position
    this.byPosition.add(x, y, entity)
  }

  delete(entity: ProjectEntity): void {
    const { entities } = this
    if (!entities.has(entity)) return
    entities.delete(entity)
    const { x, y } = entity.position
    this.byPosition.delete(x, y, entity)

    this.removeAllConnections(entity, this.circuitConnections)
    this.removeAllConnections(entity, this.cableConnections)
  }

  changePosition(entity: ProjectEntity, position: Position): boolean {
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
    entity: ProjectEntity,
    map: LuaMap<ProjectEntity, ProjectEntityCircuitConnections> | LuaMap<ProjectEntity, ProjectEntityCableConnections>,
  ) {
    const entityData = map.get(entity)
    if (!entityData) return
    map.delete(entity)

    for (const otherEntity of entityData as LuaSet<ProjectEntity>) {
      const otherData = map.get(otherEntity)
      if (otherData) {
        otherData.delete(entity)
        if (isEmpty(otherData)) map.delete(otherEntity)
      }
    }
  }

  getCircuitConnections(entity: ProjectEntity): ProjectEntityCircuitConnections | nil {
    return this.circuitConnections.get(entity)
  }
  addCircuitConnection(circuitConnection: ProjectCircuitConnection): boolean {
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

  removeCircuitConnection(circuitConnection: ProjectCircuitConnection): void {
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

  getCableConnections(entity: ProjectEntity): ProjectEntityCableConnections | nil {
    return this.cableConnections.get(entity)
  }

  addCableConnection(entity1: ProjectEntity, entity2: ProjectEntity): CableAddResult {
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

  removeCableConnection(entity1: ProjectEntity, entity2: ProjectEntity): void {
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
    return `ProjectContent(${this.countNumEntities()} entities)`
  }
}
export function _assertCorrect(content: ProjectContent): void {
  assume<ProjectContentImpl>(content)
  const { entities } = content
  for (const [entity, points] of content.circuitConnections) {
    assert(entities.has(entity))

    for (const [otherEntity, connections] of points) {
      assert(entities.has(otherEntity))
      for (const connection of connections) {
        assert(content.circuitConnections.get(otherEntity)!.get(entity)!.has(connection))
      }
    }
  }

  for (const [entity, connections] of content.cableConnections) {
    assert(entities.has(entity))

    for (const otherEntity of connections) {
      assert(entities.has(otherEntity))
      assert(content.cableConnections.get(otherEntity)!.has(entity))
    }
  }
}

export function newProjectContent(): MutableProjectContent {
  return new ProjectContentImpl()
}

export function _migrateProjectContent_0_18_0(content: MutableProjectContent): void {
  _migrateMap2DToLinkedList((content as ProjectContentImpl).byPosition)
}
