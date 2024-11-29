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
import { isEmpty, PRecord, RegisterClass } from "../lib"
import { BBox, Position } from "../lib/geometry"
import { EntityIdentification } from "./Entity"
import { LinkedMap2D, newLinkedMap2d, newMap2d, ReadonlyMap2D } from "./map2d"
import { ProjectEntity, StageNumber, UndergroundBeltProjectEntity } from "./ProjectEntity"
import { ProjectTile } from "./ProjectTile"
import {
  isPreviewEntity,
  isRollingStockType,
  OnPrototypeInfoLoaded,
  PrototypeInfo,
  rollingStockTypes,
  RotationType,
} from "./prototype-info"
import { getRegisteredProjectEntity } from "./registration"
import { getUndergroundDirection } from "./underground-belt"

/**
 * A collection of project entities: the actual data of a project.
 *
 * Also keeps track of info spanning multiple entities (wire/circuit connections).
 */
export interface ProjectContent {
  hasEntity(entity: ProjectEntity): boolean

  findCompatibleEntity(
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
  findEntityExact(entity: LuaEntity, position: Position, stage: StageNumber): ProjectEntity | nil

  findCompatibleFromPreview(previewEntity: LuaEntity, stage: StageNumber): ProjectEntity | nil
  findCompatibleFromPreviewOrLuaEntity(entity: LuaEntity, stage: StageNumber): ProjectEntity | nil

  countNumEntities(): number
  allEntities(): ReadonlyLuaSet<ProjectEntity>

  // getTile(x: number, y: number): ProjectTile | nil
  readonly tiles: ReadonlyMap2D<ProjectTile>
  /**
   * Will return slightly larger than actual
   */
  computeBoundingBox(): BoundingBox | nil
}

export interface MutableProjectContent extends ProjectContent {
  addEntity(entity: ProjectEntity): void
  /** Deleted entities should be able to be re-added, preserving connections. */
  deleteEntity(entity: ProjectEntity): void

  setTile(tile: ProjectTile): void
  deleteTile(tile: ProjectTile): boolean

  changeEntityPosition(entity: ProjectEntity, position: Position): boolean
  /** Modifies all entities */
  insertStage(stageNumber: StageNumber): void
  deleteStage(stageNumber: StageNumber): void
}

let nameToType: PrototypeInfo["nameToType"]
let nameToCategory: PrototypeInfo["nameToCategory"]
let pasteCompatibleRotations: PrototypeInfo["rotationTypes"]
OnPrototypeInfoLoaded.addListener((i) => {
  ;({ nameToType, nameToCategory, rotationTypes: pasteCompatibleRotations } = i)
})

@RegisterClass("EntityMap")
class ProjectContentImpl implements MutableProjectContent {
  readonly byPosition: LinkedMap2D<ProjectEntity> = newLinkedMap2d()
  entities = new LuaSet<ProjectEntity>()

  tiles = newMap2d<ProjectTile>()

  hasEntity(entity: ProjectEntity): boolean {
    return this.entities.has(entity)
  }

  findCompatibleEntity(
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
      const found = this.findCompatibleEntity(type, entity.position, nil, stage)
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
      return this.findCompatibleEntity(name, entity.position, previousDirection ?? entity.direction, stage)
    }
    if (pasteRotatableType == RotationType.AnyDirection) {
      return this.findCompatibleEntity(name, entity.position, nil, stage)
    }
    if (pasteRotatableType == RotationType.Flippable) {
      const direction = previousDirection ?? entity.direction
      const position = entity.position
      if (direction % 2 == 1) {
        // if diagonal, we _do_ care about the direction
        return this.findCompatibleEntity(name, position, direction, stage)
      }
      return (
        this.findCompatibleEntity(name, position, direction, stage) ??
        this.findCompatibleEntity(name, position, oppositedirection(direction), stage)
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
    return this.findCompatibleEntity(actualName, previewEntity.position, direction, stage)
  }

  findCompatibleFromPreviewOrLuaEntity(entity: LuaEntity, stage: StageNumber): ProjectEntity | nil {
    if (isPreviewEntity(entity)) {
      return this.findCompatibleFromPreview(entity, stage)
    }
    return this.findCompatibleWithLuaEntity(entity, nil, stage)
  }

  findEntityExact(entity: LuaEntity, position: Position, stage: StageNumber): ProjectEntity | nil {
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
  allEntities(): ReadonlyLuaSet<ProjectEntity> {
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
    for (const [x, row] of pairs<PRecord<number, PRecord<number, ProjectTile>>>(this.tiles)) {
      for (const [y] of pairs(row)) {
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }
    return BBox.expand(BBox.coords(minX, minY, maxX, maxY), 20)
  }

  addEntity(entity: ProjectEntity): void {
    const { entities } = this
    if (entities.has(entity)) return
    entities.add(entity)
    const { x, y } = entity.position
    this.byPosition.add(x, y, entity)

    entity.syncIngoingConnections(entities)
  }

  deleteEntity(entity: ProjectEntity): void {
    const { entities } = this
    if (!entities.has(entity)) return
    entities.delete(entity)
    const { x, y } = entity.position
    this.byPosition.delete(x, y, entity)

    entity.removeIngoingConnections()
  }

  setTile(tile: ProjectTile): void {
    const { x, y } = tile.position
    this.tiles.set(x, y, tile)
  }

  deleteTile(tile: ProjectTile): boolean {
    const { x, y } = tile.position
    if (this.tiles[x]?.[y] != tile) return false
    this.tiles.delete(x, y)
    return true
  }

  changeEntityPosition(entity: ProjectEntity, position: Position): boolean {
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
    for (const [, r] of pairs<PRecord<number, PRecord<number, ProjectTile>>>(this.tiles)) {
      for (const [, tile] of pairs(r)) {
        tile.insertStage(stageNumber)
      }
    }
  }
  deleteStage(stageNumber: StageNumber): void {
    for (const entity of this.entities) {
      entity.deleteStage(stageNumber)
    }
    for (const [, r] of pairs<PRecord<number, PRecord<number, ProjectTile>>>(this.tiles)) {
      for (const [, tile] of pairs(r)) {
        tile.deleteStage(stageNumber)
      }
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
    const points = entity.wireConnections
    if (points) {
      for (const [otherEntity, connections] of points) {
        assert(entities.has(otherEntity))
        for (const connection of connections) {
          assert(otherEntity.wireConnections?.get(entity)?.has(connection))
        }
      }
    }
  }
}

export function newProjectContent(): MutableProjectContent {
  return new ProjectContentImpl()
}
