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
import { isEmpty, Mutable, RegisterClass } from "../lib"
import { BBox, Position } from "../lib/geometry"
import { ProjectCircuitConnection } from "./circuit-connection"
import { EntityIdentification } from "./Entity"
import {
  EntityPrototypeInfo,
  isPreviewEntity,
  isRollingStockType,
  OnEntityPrototypesLoaded,
  rollingStockTypes,
  RotationType,
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
  countNumEntities(): number
  iterateAllEntities(): LuaPairsKeyIterable<ProjectEntity>

  /**
   * Will return slightly larger than actual
   */
  computeBoundingBox(): BoundingBox | nil
}

export interface MutableProjectContent extends ProjectContent {
  add(entity: ProjectEntity): void
  /** Deleted entities should be able to be re-added, preserving connections. */
  delete(entity: ProjectEntity): void

  changePosition(entity: ProjectEntity, position: Position): boolean
  /** Modifies all entities */
  insertStage(stageNumber: StageNumber): void
  deleteStage(stageNumber: StageNumber): void
}

let nameToType: EntityPrototypeInfo["nameToType"]
let nameToCategory: EntityPrototypeInfo["nameToCategory"]
let pasteCompatibleRotations: EntityPrototypeInfo["rotationTypes"]
OnEntityPrototypesLoaded.addListener((i) => {
  ;({ nameToType, nameToCategory, rotationTypes: pasteCompatibleRotations } = i)
})

@RegisterClass("EntityMap")
class ProjectContentImpl implements MutableProjectContent {
  readonly byPosition: Map2D<ProjectEntity> = newMap2D()
  entities = new LuaSet<ProjectEntity>()

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
    if (pasteRotatableType == RotationType.AnyDirection) {
      return this.findCompatibleByProps(name, entity.position, nil, stage)
    }
    if (pasteRotatableType == RotationType.Flippable) {
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
    if (isPreviewEntity(entity)) {
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

    entity.addOrPruneIngoingConnections(entities)
  }

  delete(entity: ProjectEntity): void {
    const { entities } = this
    if (!entities.has(entity)) return
    entities.delete(entity)
    const { x, y } = entity.position
    this.byPosition.delete(x, y, entity)

    entity.removeIngoingConnections()
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
  for (const entity of entities) {
    const points = entity.circuitConnections
    if (points) {
      for (const [otherEntity, connections] of points) {
        assert(entities.has(otherEntity))
        for (const connection of connections) {
          assert(otherEntity.circuitConnections?.get(entity)?.has(connection))
        }
      }
    }
    if (entity.cableConnections) {
      for (const otherEntity of entity.cableConnections) {
        assert(entities.has(otherEntity))
        assert(otherEntity.cableConnections?.has(entity))
      }
    }
  }
}

export function newProjectContent(): MutableProjectContent {
  return new ProjectContentImpl()
}

export function _migrateProjectContent_0_18_0(content: MutableProjectContent): void {
  _migrateMap2DToLinkedList((content as ProjectContentImpl).byPosition)
}

export function _migrateWireConnections(content: MutableProjectContent): void {
  assume<ProjectContentImpl>(content)
  assume<
    ProjectContentImpl & {
      circuitConnections: LuaMap<ProjectEntity, LuaMap<ProjectEntity, LuaSet<ProjectCircuitConnection>>>
      cableConnections: LuaMap<ProjectEntity, LuaSet<ProjectEntity>>
    }
  >(content)
  const { circuitConnections, cableConnections } = content
  for (const [entity, connections] of cableConnections) {
    ;(entity as Mutable<ProjectEntity>).cableConnections = connections
  }
  for (const [entity, connections] of circuitConnections) {
    ;(entity as Mutable<ProjectEntity>).circuitConnections = connections
  }
}
