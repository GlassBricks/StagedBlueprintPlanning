// Copyright (c) 2022-2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { BoundingBox, LuaEntity, MapPosition } from "factorio:runtime"
import { oppositedirection } from "util"
import { Prototypes } from "../constants"
import { isEmpty, PRecord, RegisterClass } from "../lib"
import { BBox, Position } from "../lib/geometry"
import { WorldEntityLookup } from "../project/WorldPresentation"
import { ProjectTile } from "../tiles/ProjectTile"
import { Entity, EntityIdentification, UnstagedEntityProps } from "./Entity"
import { LinkedMap2D, newLinkedMap2d, newMap2d, ReadonlyMap2D } from "./map2d"
import {
  InserterProjectEntity,
  NameAndQuality,
  ProjectEntity,
  StageDiffs,
  StageNumber,
  UndergroundBeltProjectEntity,
} from "./ProjectEntity"
import {
  isMovableEntity,
  isPreviewEntity,
  movableTypes,
  OnPrototypeInfoLoaded,
  PrototypeInfo,
  RotationType,
} from "./prototype-info"
import { getRegisteredProjectEntity } from "./registration"
import { getUndergroundDirection } from "./underground-belt"
import { ProjectWireConnection } from "./wire-connection"

export interface ContentObserver {
  onEntityAdded(entity: ProjectEntity): void
  onEntityDeleted(entity: ProjectEntity): void
  onEntityChanged(entity: ProjectEntity, fromStage: StageNumber): void
  onEntityLastStageChanged(entity: ProjectEntity, oldLastStage: StageNumber | nil): void
  onEntityBecameSettingsRemnant(entity: ProjectEntity): void
  onEntityRevived(entity: ProjectEntity): void
  onWiresChanged(entity: ProjectEntity): void

  onStageDiscarded(
    stageNumber: StageNumber,
    deleted: ProjectEntity[],
    updated: ProjectEntity[],
    updatedTiles: MapPosition[],
  ): void
}

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
  findEntityExact(
    entity: LuaEntity,
    position: Position,
    stage: StageNumber,
    worldEntities: WorldEntityLookup,
  ): ProjectEntity | nil

  findCompatibleFromPreview(previewEntity: LuaEntity, stage: StageNumber): ProjectEntity | nil
  findCompatibleFromPreviewOrLuaEntity(entity: LuaEntity, stage: StageNumber): ProjectEntity | nil

  countNumEntities(): number
  allEntities(): ReadonlyLuaSet<ProjectEntity>

  tiles: ReadonlyMap2D<ProjectTile>
  /**
   * Will return slightly larger than actual
   */
  computeBoundingBox(): BoundingBox | nil
}

export interface MutableProjectContent extends ProjectContent {
  setObserver(observer: ContentObserver | nil): void

  beginBatch(): void
  endBatch(): void
  batch(fn: () => void): void

  addEntity(entity: ProjectEntity): void
  /** Deleted entities should be able to be re-added, preserving connections. */
  deleteEntity(entity: ProjectEntity): void

  setTile(position: Position, tile: ProjectTile): void
  deleteTile(position: Position): boolean

  changeEntityPosition(entity: ProjectEntity, position: Position): boolean
  /** Modifies all entities */
  insertStage(stageNumber: StageNumber): void
  mergeStage(stageNumber: StageNumber): void
  discardStage(stageNumber: StageNumber): void

  setEntityDirection(entity: ProjectEntity, direction: defines.direction): void

  setEntityFirstStage(entity: ProjectEntity, stage: StageNumber): void
  setEntityLastStage(entity: ProjectEntity, stage: StageNumber | nil): void

  adjustEntityValue(entity: ProjectEntity, stage: StageNumber, value: Entity): boolean
  setEntityProp<T extends Entity, K extends keyof T>(
    entity: ProjectEntity<T>,
    stage: StageNumber,
    prop: K,
    value: T[K],
  ): boolean
  applyEntityUpgrade(entity: ProjectEntity, stage: StageNumber, upgrade: NameAndQuality): boolean
  resetEntityValue(entity: ProjectEntity, stage: StageNumber): boolean
  resetEntityProp<T extends Entity, K extends keyof T>(entity: ProjectEntity<T>, stage: StageNumber, prop: K): boolean
  moveEntityValueDown(entity: ProjectEntity, stage: StageNumber): StageNumber | nil
  moveEntityPropDown<T extends Entity, K extends keyof T>(
    entity: ProjectEntity<T>,
    stage: StageNumber,
    prop: K,
  ): StageNumber | nil

  setEntityValue(entity: ProjectEntity, firstValue: Entity, stageDiffs: StageDiffs | nil): void

  setEntityUnstagedValue(entity: ProjectEntity, stage: StageNumber, value: UnstagedEntityProps | nil): boolean
  clearEntityUnstagedValues(entity: ProjectEntity): void

  setEntityExcludedFromBlueprints(entity: ProjectEntity, stage: StageNumber, excluded: boolean): boolean

  makeEntitySettingsRemnant(entity: ProjectEntity): void
  reviveEntity(entity: ProjectEntity, stage: StageNumber): void

  addWireConnection(connection: ProjectWireConnection): void
  removeWireConnection(connection: ProjectWireConnection): void

  setTypeProperty(entity: UndergroundBeltProjectEntity, type: "input" | "output"): void
  setInserterPositions(entity: InserterProjectEntity, pickup: Position | nil, drop: Position | nil): void
}

let nameToType: PrototypeInfo["nameToType"]
let nameToCategory: PrototypeInfo["nameToCategory"]
let pasteCompatibleRotations: PrototypeInfo["rotationTypes"]
OnPrototypeInfoLoaded.addListener((i) => {
  ;({ nameToType, nameToCategory, rotationTypes: pasteCompatibleRotations } = i)
})

interface BatchedNotification {
  minChangedStage?: StageNumber
  lastStageChanged?: true
  firstOldLastStage?: StageNumber
  wiresChanged?: true
}

@RegisterClass("EntityMap")
class ProjectContentImpl implements MutableProjectContent {
  readonly byPosition: LinkedMap2D<ProjectEntity> = newLinkedMap2d()
  entities = new LuaSet<ProjectEntity>()
  private observer: ContentObserver | nil

  private batchDepth = 0
  private batchedNotifications: LuaMap<ProjectEntity, BatchedNotification> | nil

  tiles = newMap2d<ProjectTile>()

  setObserver(observer: ContentObserver | nil): void {
    this.observer = observer
  }

  beginBatch(): void {
    this.batchDepth++
    if (this.batchDepth == 1) this.batchedNotifications = new LuaMap()
  }

  endBatch(): void {
    assert(this.batchDepth > 0, "endBatch called without matching beginBatch")
    this.batchDepth--
    if (this.batchDepth == 0) {
      const batched = this.batchedNotifications!
      this.batchedNotifications = nil
      this.flushBatch(batched)
    }
  }

  batch(fn: () => void): void {
    this.beginBatch()
    try {
      fn()
    } finally {
      this.endBatch()
    }
  }

  private notifyEntityChanged(entity: ProjectEntity, fromStage: StageNumber): void {
    if (this.batchedNotifications) {
      const existing = this.batchedNotifications.get(entity)
      if (existing) {
        existing.minChangedStage = math.min(existing.minChangedStage ?? fromStage, fromStage)
      } else {
        this.batchedNotifications.set(entity, { minChangedStage: fromStage })
      }
      return
    }
    this.observer?.onEntityChanged(entity, fromStage)
  }

  private notifyLastStageChanged(entity: ProjectEntity, oldLastStage: StageNumber | nil): void {
    if (this.batchedNotifications) {
      const existing = this.batchedNotifications.get(entity)
      if (existing) {
        if (!existing.lastStageChanged) {
          existing.lastStageChanged = true
          existing.firstOldLastStage = oldLastStage
        }
      } else {
        this.batchedNotifications.set(entity, {
          lastStageChanged: true,
          firstOldLastStage: oldLastStage,
        })
      }
      return
    }
    this.observer?.onEntityLastStageChanged(entity, oldLastStage)
  }

  private notifyWiresChanged(entity: ProjectEntity): void {
    if (this.batchedNotifications) {
      const existing = this.batchedNotifications.get(entity)
      if (existing) {
        existing.wiresChanged = true
      } else {
        this.batchedNotifications.set(entity, { wiresChanged: true })
      }
      return
    }
    this.observer?.onWiresChanged(entity)
  }

  private flushBatch(batched: LuaMap<ProjectEntity, BatchedNotification>): void {
    const observer = this.observer
    if (!observer) return
    for (const [entity, notification] of batched) {
      if (notification.minChangedStage != nil) {
        observer.onEntityChanged(entity, notification.minChangedStage)
      }
      if (notification.lastStageChanged) {
        observer.onEntityLastStageChanged(entity, notification.firstOldLastStage)
      }
      if (notification.wiresChanged) {
        observer.onWiresChanged(entity)
      }
    }
  }

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
    if (movableTypes.has(type)) {
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
      if (direction % 4 == 2) {
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
        type: nameToType.get(name) ?? ("unknown" as never),
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
    const direction = isMovableEntity(actualName) ? 0 : previewEntity.direction
    return this.findCompatibleEntity(actualName, previewEntity.position, direction, stage)
  }

  findCompatibleFromPreviewOrLuaEntity(entity: LuaEntity, stage: StageNumber): ProjectEntity | nil {
    if (isPreviewEntity(entity)) {
      return this.findCompatibleFromPreview(entity, stage)
    }
    return this.findCompatibleWithLuaEntity(entity, nil, stage)
  }

  findEntityExact(
    entity: LuaEntity,
    position: Position,
    stage: StageNumber,
    worldEntities: WorldEntityLookup,
  ): ProjectEntity | nil {
    let cur = this.byPosition.get(position.x, position.y)
    while (cur != nil) {
      if (worldEntities.getWorldOrPreviewEntity(cur, stage) == entity) return cur
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
    if (isEmpty(this.entities) && isEmpty(this.tiles)) return nil
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

    entity._asMut().syncIngoingConnections(entities)
    this.observer?.onEntityAdded(entity)
  }

  deleteEntity(entity: ProjectEntity): void {
    const { entities } = this
    if (!entities.has(entity)) return
    entities.delete(entity)
    const { x, y } = entity.position
    this.byPosition.delete(x, y, entity)

    entity._asMut().removeIngoingConnections()
    this.observer?.onEntityDeleted(entity)
  }

  setTile(position: Position, tile: ProjectTile): void {
    const { x, y } = position
    this.tiles.set(x, y, tile)
  }

  deleteTile(position: Position): boolean {
    const { x, y } = position
    const tile = this.tiles[x]?.[y]
    if (!tile) return false
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
    entity._asMut().setPositionUnchecked(position)
    byPosition.add(newX, newY, entity)
    this.notifyEntityChanged(entity, entity.firstStage)
    return true
  }

  insertStage(stageNumber: StageNumber): void {
    for (const entity of this.entities) {
      entity._asMut().insertStage(stageNumber)
    }
    for (const [, r] of pairs<PRecord<number, PRecord<number, ProjectTile>>>(this.tiles)) {
      for (const [, tile] of pairs(r)) {
        tile.insertStage(stageNumber)
      }
    }
  }
  mergeStage(stageNumber: StageNumber): void {
    for (const entity of this.entities) {
      entity._asMut().mergeStage(stageNumber)
    }
    for (const [, r] of pairs<PRecord<number, PRecord<number, ProjectTile>>>(this.tiles)) {
      for (const [, tile] of pairs(r)) {
        tile.mergeStage(stageNumber)
      }
    }

  }

  discardStage(stageNumber: StageNumber): void {
    const deleted: ProjectEntity[] = []
    const updated: ProjectEntity[] = []
    const updatedTiles: MapPosition[] = []
    for (const entity of this.entities) {
      if (entity.firstStage == stageNumber) {
        this.deleteEntity(entity)
        deleted.push(entity)
      } else {
        if (entity._asMut().discardStage(stageNumber)) {
          updated.push(entity)
        }
      }
    }

    const tilesToRemove: Array<{ x: number; y: number }> = []
    for (const [x, r] of pairs<PRecord<number, PRecord<number, ProjectTile>>>(this.tiles)) {
      for (const [y, tile] of pairs(r)) {
        const hasChanges = tile.discardStage(stageNumber)
        if (hasChanges) {
          const position = { x, y }
          if (tile.isEmpty()) {
            tilesToRemove.push(position)
          }
          updatedTiles.push(position)
        }
      }
    }
    for (const pos of tilesToRemove) {
      this.deleteTile(pos)
    }
    this.observer?.onStageDiscarded(stageNumber, deleted, updated, updatedTiles)
  }

  setEntityDirection(entity: ProjectEntity, direction: defines.direction): void {
    entity._asMut().direction = direction
    this.notifyEntityChanged(entity, entity.firstStage)
  }

  setEntityFirstStage(entity: ProjectEntity, stage: StageNumber): void {
    const oldFirstStage = entity.firstStage
    const oldLastStage = entity.lastStage
    entity._asMut().setFirstStageUnchecked(stage)
    this.notifyEntityChanged(entity, math.min(stage, oldFirstStage))
    if (entity.lastStage != oldLastStage) {
      this.notifyLastStageChanged(entity, oldLastStage)
    }
  }

  setEntityLastStage(entity: ProjectEntity, stage: StageNumber | nil): void {
    const oldLastStage = entity.lastStage
    entity._asMut().setLastStageUnchecked(stage)
    this.notifyLastStageChanged(entity, oldLastStage)
  }

  adjustEntityValue(entity: ProjectEntity, stage: StageNumber, value: Entity): boolean {
    const changed = entity._asMut().adjustValueAtStage(stage, value)
    if (changed) this.notifyEntityChanged(entity, stage)
    return changed
  }

  setEntityProp<T extends Entity, K extends keyof T>(
    entity: ProjectEntity<T>,
    stage: StageNumber,
    prop: K,
    value: T[K],
  ): boolean {
    const changed = entity._asMut().setPropAtStage(stage, prop, value)
    if (changed) this.notifyEntityChanged(entity, stage)
    return changed
  }

  applyEntityUpgrade(entity: ProjectEntity, stage: StageNumber, upgrade: NameAndQuality): boolean {
    const changed = entity._asMut().applyUpgradeAtStage(stage, upgrade)
    if (changed) this.notifyEntityChanged(entity, stage)
    return changed
  }

  resetEntityValue(entity: ProjectEntity, stage: StageNumber): boolean {
    const changed = entity._asMut().resetValue(stage)
    if (changed) this.notifyEntityChanged(entity, stage)
    return changed
  }

  resetEntityProp<T extends Entity, K extends keyof T>(entity: ProjectEntity<T>, stage: StageNumber, prop: K): boolean {
    const changed = entity._asMut().resetProp(stage, prop)
    if (changed) this.notifyEntityChanged(entity, stage)
    return changed
  }

  moveEntityValueDown(entity: ProjectEntity, stage: StageNumber): StageNumber | nil {
    const result = entity._asMut().moveValueDown(stage)
    if (result != nil) this.notifyEntityChanged(entity, result)
    return result
  }

  moveEntityPropDown<T extends Entity, K extends keyof T>(
    entity: ProjectEntity<T>,
    stage: StageNumber,
    prop: K,
  ): StageNumber | nil {
    const result = entity._asMut().movePropDown(stage, prop)
    if (result != nil) this.notifyEntityChanged(entity, result)
    return result
  }

  setEntityValue(entity: ProjectEntity, firstValue: Entity, stageDiffs: StageDiffs | nil): void {
    const internal = entity._asMut()
    internal.setFirstValueDirectly(firstValue)
    internal.setStageDiffsDirectly(stageDiffs)
    this.notifyEntityChanged(entity, entity.firstStage)
  }

  setEntityUnstagedValue(entity: ProjectEntity, stage: StageNumber, value: UnstagedEntityProps | nil): boolean {
    const changed = entity._asMut().setUnstagedValue(stage, value)
    if (changed) this.notifyEntityChanged(entity, stage)
    return changed
  }

  clearEntityUnstagedValues(entity: ProjectEntity): void {
    entity._asMut().clearPropertyInAllStages("unstagedValue")
    this.notifyEntityChanged(entity, entity.firstStage)
  }

  setEntityExcludedFromBlueprints(entity: ProjectEntity, stage: StageNumber, excluded: boolean): boolean {
    const changed = entity._asMut().setExcludedFromBlueprints(stage, excluded)
    if (changed) this.notifyEntityChanged(entity, stage)
    return changed
  }

  makeEntitySettingsRemnant(entity: ProjectEntity): void {
    entity._asMut().isSettingsRemnant = true
    this.observer?.onEntityBecameSettingsRemnant(entity)
  }

  reviveEntity(entity: ProjectEntity, stage: StageNumber): void {
    const internal = entity._asMut()
    internal.isSettingsRemnant = nil
    internal.setFirstStageUnchecked(stage)
    this.observer?.onEntityRevived(entity)
  }

  addWireConnection(connection: ProjectWireConnection): void {
    connection.fromEntity._asMut().addOneWayWireConnection(connection)
    connection.toEntity._asMut().addOneWayWireConnection(connection)
    this.notifyWiresChanged(connection.fromEntity)
    this.notifyWiresChanged(connection.toEntity)
  }

  removeWireConnection(connection: ProjectWireConnection): void {
    connection.fromEntity._asMut().removeOneWayWireConnection(connection)
    connection.toEntity._asMut().removeOneWayWireConnection(connection)
    this.notifyWiresChanged(connection.fromEntity)
    this.notifyWiresChanged(connection.toEntity)
  }

  setTypeProperty(entity: UndergroundBeltProjectEntity, type: "input" | "output"): void {
    entity._asMut().setTypeProperty(type)
    this.notifyEntityChanged(entity, entity.firstStage)
  }

  setInserterPositions(entity: InserterProjectEntity, pickup: Position | nil, drop: Position | nil): void {
    const internal = entity._asMut()
    internal.setPickupPosition(pickup)
    internal.setDropPosition(drop)
    this.notifyEntityChanged(entity, entity.firstStage)
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
