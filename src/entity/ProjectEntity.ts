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

import { LuaEntity, nil, RealOrientation } from "factorio:runtime"
import { oppositedirection } from "util"
import {
  deepCompare,
  isEmpty,
  Mutable,
  PRecord,
  PRRecord,
  RegisterClass,
  shallowCopy,
  shiftNumberKeysDown,
  shiftNumberKeysUp,
} from "../lib"
import { Position } from "../lib/geometry"
import { DiffValue, fromDiffValue, getDiff, toDiffValue } from "../utils/diff-value"
import { circuitConnectionEquals, getDirectionalInfo, ProjectCircuitConnection } from "./circuit-connection"
import { Entity, InserterEntity, LoaderEntity, RollingStockEntity, UndergroundBeltEntity } from "./Entity"
import {
  isPreviewEntity,
  isRollingStockType,
  OnEntityPrototypesLoaded,
  PrototypeInfo,
  rollingStockTypes,
} from "./prototype-info"
import { registerEntity } from "./registration"
import { applyDiffToEntity, getDiffDiff, getEntityDiff, StageDiff, StageDiffInternal } from "./stage-diff"
import { BaseStagedValue, StagedValue } from "./StagedValue"
import floor = math.floor

let nameToType: PrototypeInfo["nameToType"]
OnEntityPrototypesLoaded.addListener((info) => {
  nameToType = info.nameToType
})

/** 1 indexed */
export type StageNumber = number

export type CableConnections = ReadonlyLuaSet<ProjectEntity>
export type CircuitConnections = ReadonlyLuaMap<ProjectEntity, LuaSet<ProjectCircuitConnection>>

export const enum CableAddResult {
  MaybeAdded = "Added",
  Error = "Error",
  MaxConnectionsReached = "MaxConnectionsReached",
}
const MaxCableConnections = 5 // hard-coded in game

/**
 * All the data about one entity in a project, across all stages.
 */
export interface ProjectEntity<out T extends Entity = Entity> extends StagedValue<T, StageDiff<T>> {
  readonly position: Position
  setPositionUnchecked(position: Position): void

  direction: defines.direction

  isSettingsRemnant?: true

  /** Sets the first stage. If moving up, deletes/merges stage diffs from old stage to new stage. */
  setFirstStageUnchecked(stage: StageNumber): void
  /** Sets the last stage. If moving down, delete all diffs after the new last stage. */
  setLastStageUnchecked(stage: StageNumber | nil): void

  readonly cableConnections?: CableConnections
  readonly circuitConnections?: CircuitConnections

  canAddCableConnection(): boolean

  tryAddOneWayCableConnection(entity: ProjectEntity): boolean

  tryAddDualCableConnection(entity: ProjectEntity): CableAddResult

  removeOneWayCableConnection(entity: ProjectEntity): void
  removeDualCableConnection(entity: ProjectEntity): void

  addOneWayCircuitConnection(connection: ProjectCircuitConnection): boolean
  removeOneWayCircuitConnection(connection: ProjectCircuitConnection): void

  addOrPruneIngoingConnections(existingEntities: ReadonlyLuaSet<ProjectEntity>): void
  removeIngoingConnections(): void

  isRollingStock(): this is RollingStockProjectEntity
  isUndergroundBelt(): this is UndergroundBeltProjectEntity
  isInserter(): this is InserterProjectEntity

  setTypeProperty(this: UndergroundBeltProjectEntity, direction: "input" | "output"): void
  setDropPosition(this: InserterProjectEntity, position: Position | nil): void
  setPickupPosition(this: InserterProjectEntity, position: Position | nil): void

  /** If this is a rolling stock, the direction is based off of orientation instead. */
  getPreviewDirection(): defines.direction

  hasErrorAt(stage: StageNumber): boolean

  getFirstStageDiffForProp<K extends keyof T>(prop: K): LuaMultiReturn<[] | [StageNumber | nil, T[K]]>
  _applyDiffAtStage(stage: StageNumber, diff: StageDiffInternal<T>): void

  /** Linked list for Map2D */
  _next: ProjectEntity | nil

  /** @return the value of a property at a given stage, or at the first stage if below the first stage. Also returns the stage in which the property is affected. */
  getPropAtStage<K extends keyof T>(stage: StageNumber, prop: K): LuaMultiReturn<[T[K], StageNumber]>
  getNameAtStage(stage: StageNumber): string
  /**
   * Iterates the values of stages in the given range. More efficient than repeated calls to getValueAtStage.
   * The same instance will be returned for each stage; its value is ephemeral.
   *
   * Changed: if the value returned is the same value as last iteration.
   * Undefined value on very first iteration.
   */
  iterateValues(
    start: StageNumber,
    end: StageNumber,
  ): LuaIterable<LuaMultiReturn<[StageNumber, Readonly<T> | nil, changed: boolean]>>

  /**
   * Adjusts stage diffs so that the value at the given stage matches the given value.
   * Rolling stock entities are ignored if not at the first stage.
   * Trims stage diffs in higher stages if they no longer have any effect.
   * @return true if the value changed.
   */
  adjustValueAtStage(stage: StageNumber, value: T): boolean
  /**
   * Adjusts stage diffs to set a property at the given stage to the given value.
   * Rolling stock is not supported.
   * See {@link adjustValueAtStage} for more info.
   * @return true if the value changed.
   */
  setPropAtStage<K extends keyof T>(stage: StageNumber, prop: K, value: T[K]): boolean
  /** Same as `setPropAtStage("name", stage, name)`. */
  applyUpgradeAtStage(stage: StageNumber, newName: string): boolean

  /**
   * Removes all stage-diffs at the given stage.
   * @return true if there was a stage diff at the given stage.
   */
  resetValue(stage: StageNumber): boolean
  /**
   * Applies stage diffs at the give stage to the next lower applicable stage.
   * @return The stage to which the diffs were applied, or `nil` if no diffs were applied.
   */
  moveValueDown(stage: StageNumber): StageNumber | nil
  /**
   * Removes a property from a stage diff property.
   * @return true if the property was removed.
   */
  resetProp<K extends keyof T>(stage: StageNumber, prop: K): boolean
  /**
   * Applies a stage diff property to the next lower applicable stage.
   * @return the stage number that the property was applied to, or nil if no property or applicable stage.
   */
  movePropDown<K extends keyof T>(stage: StageNumber, prop: K): StageNumber | nil

  getWorldEntity(stage: StageNumber): LuaEntity | nil
  getWorldOrPreviewEntity(stage: StageNumber): LuaEntity | nil

  replaceWorldEntity(stage: StageNumber, entity: LuaEntity | nil): void
  replaceWorldOrPreviewEntity(stage: StageNumber, entity: LuaEntity | nil): void

  destroyWorldOrPreviewEntity(stage: StageNumber): void
  destroyAllWorldOrPreviewEntities(): void

  iterateWorldOrPreviewEntities(): LuaIterable<LuaMultiReturn<[StageNumber, LuaEntity]>>
  hasWorldEntityInRange(startStage: StageNumber, endStage: StageNumber): boolean

  getExtraEntity<T extends keyof ExtraEntities>(type: T, stage: StageNumber): ExtraEntities[T] | nil
  replaceExtraEntity<T extends ExtraEntityType>(type: T, stage: StageNumber, entity: ExtraEntities[T] | nil): void
  destroyExtraEntity<T extends ExtraEntityType>(type: T, stage: StageNumber): void
  destroyAllExtraEntities(type: ExtraEntityType): void
  hasAnyExtraEntities(type: ExtraEntityType): boolean

  setProperty<T extends keyof StageProperties>(key: T, stage: StageNumber, value: StageProperties[T] | nil): void
  getProperty<T extends keyof StageProperties>(key: T, stage: StageNumber): StageProperties[T] | nil
  propertySetInAnyStage(key: keyof StageProperties): boolean
  clearPropertyInAllStages<T extends keyof StageProperties>(key: T): void
}

export type StageDiffs<E extends Entity = Entity> = PRRecord<StageNumber, StageDiff<E>>
export type StageDiffsInternal<E extends Entity = Entity> = PRRecord<StageNumber, StageDiffInternal<E>>

export interface ExtraEntities {}
export type ExtraEntityType = keyof ExtraEntities

export interface StageProperties {
  _?: never
}

export type RollingStockProjectEntity = ProjectEntity<RollingStockEntity>
export type UndergroundBeltProjectEntity = ProjectEntity<UndergroundBeltEntity>
export type LoaderProjectEntity = ProjectEntity<LoaderEntity>
export type InserterProjectEntity = ProjectEntity<InserterEntity>

type StageData = ExtraEntities & StageProperties

export function orientationToDirection(orientation: RealOrientation | nil): defines.direction {
  if (orientation == nil) return 0
  return floor(orientation * 8 + 0.5) % 8
}

const { raise_script_destroy } = script

@RegisterClass("AssemblyEntity")
class ProjectEntityImpl<T extends Entity = Entity>
  extends BaseStagedValue<T, StageDiff<T>>
  implements ProjectEntity<T>
{
  position: Position
  direction: defines.direction

  isSettingsRemnant: true | nil

  cableConnections?: LuaSet<ProjectEntity>
  circuitConnections?: LuaMap<ProjectEntity, LuaSet<ProjectCircuitConnection>>

  _next: ProjectEntityImpl<T> | nil;

  [stage: StageNumber]: LuaEntity | nil // world entities and preview entities are stored in the same table
  stageProperties?: {
    [P in keyof StageData]?: PRecord<StageNumber, StageData[P]>
  }

  constructor(firstStage: StageNumber, firstValue: T, position: Position, direction: defines.direction | nil) {
    super(firstStage, firstValue)
    this.position = position
    this.direction = direction ?? 0
    if (this.isRollingStock()) {
      this.lastStage = firstStage
    }
  }

  getPreviewDirection(): defines.direction {
    if (this.isRollingStock()) {
      return orientationToDirection((this.firstValue as RollingStockEntity).orientation)
    }
    return this.direction
  }

  setPositionUnchecked(position: Position): void {
    this.position = position
  }

  isRollingStock(): this is RollingStockProjectEntity {
    return isRollingStockType(this.firstValue.name)
  }
  isUndergroundBelt(): this is UndergroundBeltProjectEntity {
    return nameToType.get(this.firstValue.name) == "underground-belt"
  }
  isInserter(): this is InserterProjectEntity {
    return nameToType.get(this.firstValue.name) == "inserter"
  }

  hasErrorAt(stage: StageNumber): boolean {
    // if this gets complicated enough, it may move out of this class
    if (!this.isInStage(stage)) return false
    const worldEntity = this.getWorldEntity(stage)
    return (
      worldEntity == nil ||
      (worldEntity.type == "underground-belt" &&
        worldEntity.belt_to_ground_type != (this.firstValue as unknown as UndergroundBeltEntity).type)
    )
  }

  canAddCableConnection() {
    const cableConnections = this.cableConnections
    return cableConnections == nil || table_size(cableConnections) < MaxCableConnections
  }
  tryAddOneWayCableConnection(entity: ProjectEntity): boolean {
    if (this == entity || !this.canAddCableConnection()) return false
    ;(this.cableConnections ??= newLuaSet()).add(entity)
    return true
  }
  tryAddDualCableConnection(entity: ProjectEntity): CableAddResult {
    if (this == entity) return CableAddResult.Error
    if (!(this.canAddCableConnection() && entity.canAddCableConnection())) return CableAddResult.MaxConnectionsReached
    ;(this.cableConnections ??= newLuaSet()).add(entity)
    ;((entity as ProjectEntityImpl).cableConnections ??= newLuaSet()).add(this)
    return CableAddResult.MaybeAdded
  }

  removeOneWayCableConnection(entity: ProjectEntity): void {
    const connections = this.cableConnections
    if (!connections) return
    connections.delete(entity)
    if (connections.isEmpty()) delete this.cableConnections
  }
  removeDualCableConnection(entity: ProjectEntity): void {
    this.removeOneWayCableConnection(entity)
    entity.removeOneWayCableConnection(this)
  }

  addOneWayCircuitConnection(connection: ProjectCircuitConnection): boolean {
    const [toEntity] = getDirectionalInfo(connection, this)
    let connections = this.circuitConnections
    if (connections) {
      const existingConnections = connections.get(toEntity)
      if (existingConnections)
        for (const existingConnection of existingConnections) {
          if (circuitConnectionEquals(existingConnection, connection)) return false
        }
    }
    connections ??= this.circuitConnections = new LuaMap()
    const existingConnections = connections.get(toEntity)
    if (existingConnections) existingConnections.add(connection)
    else connections.set(toEntity, newLuaSet(connection))
    return true
  }
  removeOneWayCircuitConnection(connection: ProjectCircuitConnection): void {
    const [toEntity] = getDirectionalInfo(connection, this)
    const connections = this.circuitConnections
    if (!connections) return
    const existingConnections = connections.get(toEntity)
    if (!existingConnections) return
    existingConnections.delete(connection)
    if (existingConnections.isEmpty()) {
      connections.delete(toEntity)
      if (connections.isEmpty()) delete this.circuitConnections
    }
  }

  addOrPruneIngoingConnections(existing: ReadonlyLuaSet<ProjectEntity>): void {
    const cableConnections = this.cableConnections
    if (cableConnections) {
      for (const otherEntity of cableConnections) {
        if (!existing.has(otherEntity)) {
          cableConnections.delete(otherEntity)
        } else {
          otherEntity.tryAddOneWayCableConnection(this)
        }
      }
      if (cableConnections.isEmpty()) delete this.cableConnections
    }

    const circuitConnections = this.circuitConnections
    if (circuitConnections) {
      for (const [otherEntity, connections] of circuitConnections) {
        if (!existing.has(otherEntity)) {
          circuitConnections.delete(otherEntity)
        } else {
          for (const connection of connections) {
            otherEntity.addOneWayCircuitConnection(connection)
          }
        }
      }
      if (circuitConnections.isEmpty()) delete this.circuitConnections
    }
  }
  removeIngoingConnections(): void {
    const cableConnections = this.cableConnections
    if (cableConnections)
      for (const otherEntity of cableConnections) {
        otherEntity.removeOneWayCableConnection(this)
      }
    const circuitConnections = this.circuitConnections
    if (circuitConnections)
      for (const [otherEntity, connections] of circuitConnections) {
        for (const connection of connections) {
          otherEntity.removeOneWayCircuitConnection(connection)
        }
      }
  }

  setTypeProperty(this: ProjectEntityImpl<UndergroundBeltEntity>, direction: "input" | "output"): void {
    // assume compiler asserts this is correct
    this.firstValue.type = direction
  }

  setDropPosition(this: ProjectEntityImpl<InserterEntity>, position: Position | nil): void {
    this.firstValue.drop_position = position
  }
  setPickupPosition(this: ProjectEntityImpl<InserterEntity>, position: Position | nil): void {
    this.firstValue.pickup_position = position
  }
  private getStageDiffProp<K extends keyof T>(
    stage: StageNumber,
    prop: K,
  ): LuaMultiReturn<[found: boolean, value?: T[K]]> {
    const { stageDiffs } = this
    if (!stageDiffs) return $multi(false)
    const stageDiff = stageDiffs[stage]
    if (!stageDiff) return $multi(false)
    const val = stageDiff[prop]
    if (val == nil) return $multi(false)
    return $multi(true, fromDiffValue<T[K]>(val))
  }

  getFirstStageDiffForProp<K extends keyof T>(prop: K): LuaMultiReturn<[] | [StageNumber, T[K]]> {
    const stageDiffs = this.stageDiffs
    if (stageDiffs) {
      for (const [stage, diff] of pairs(stageDiffs)) {
        const value = diff[prop]
        if (value != nil) return $multi(stage, fromDiffValue<T[K]>(value))
      }
    }
    return $multi()
  }

  _applyDiffAtStage(stage: StageNumber, _diff: StageDiffInternal<T>): void {
    assert(this.isInStage(stage))
    const diff = _diff as StageDiff<T>
    let { stageDiffs } = this
    const { firstStage } = this
    assert(stage >= firstStage, "stage must be >= first stage")
    if (stage == firstStage) {
      applyDiffToEntity(this.firstValue, diff)
      return
    }
    const existingDiff = stageDiffs && stageDiffs[stage]
    if (existingDiff) {
      for (const [key, value] of pairs(diff)) {
        existingDiff[key] = value as any
      }
    } else {
      stageDiffs ??= this.stageDiffs = {}
      stageDiffs[stage] = shallowCopy(diff)
    }
  }

  getPropAtStage<K extends keyof T>(stage: StageNumber, prop: K): LuaMultiReturn<[T[K], StageNumber]> {
    let value: T[K] = this.firstValue[prop]
    let resultStage = this.firstStage
    const { stageDiffs } = this
    if (stage <= resultStage || !stageDiffs) return $multi(value, resultStage)
    for (const [changedStage, diff] of pairs(stageDiffs)) {
      if (changedStage > stage) break
      const propDiff = diff[prop]
      if (propDiff != nil) {
        resultStage = changedStage
        value = fromDiffValue<T[K]>(propDiff)
      }
    }
    return $multi(value, resultStage)
  }
  getNameAtStage(stage: StageNumber): string {
    return this.getPropAtStage(stage, "name")[0]
  }

  declare applyDiff: <T extends Entity>(this: void, value: T, diff: StageDiff<T>) => Mutable<T>

  adjustValueAtStage(stage: StageNumber, value: T): boolean {
    const { firstStage } = this
    assert(stage >= firstStage, "stage must be >= first stage")

    if (this.isRollingStock()) return this.adjustValueRollingStock(stage, value)

    if (stage == this.firstStage) return this.setValueAtFirstStage(value)

    const valueAtPreviousStage = assert(this.getValueAtStage(stage - 1))
    const newStageDiff = getEntityDiff(valueAtPreviousStage, value)
    return this.setDiffInternal(stage, newStageDiff, valueAtPreviousStage)
  }
  private adjustValueRollingStock(this: ProjectEntityImpl<RollingStockEntity>, stage: StageNumber, value: T): boolean {
    const canAdjust = stage == this.firstStage
    if (!canAdjust) return false
    const diff = getEntityDiff(this.firstValue, value)
    if (!diff) return false
    delete diff.orientation // ignore orientation
    if (isEmpty(diff)) return false
    applyDiffToEntity(this.firstValue, diff)
    return true
  }

  private setValueAtFirstStage(value: T): boolean {
    const { firstValue } = this
    const diff = getEntityDiff(firstValue, value)
    if (!diff) return false

    applyDiffToEntity(firstValue, diff)
    this.trimDiffs(this.firstStage, diff)
    return true
  }

  /** Sets the diff at a stage. The given diff should already be trimmed/minimal. */
  private setDiffInternal(stage: StageNumber, newStageDiff: StageDiff<T> | nil, valueAtPreviousStage: T): boolean {
    let { stageDiffs } = this
    const oldStageDiff = this.getStageDiff(stage)
    if (newStageDiff) {
      stageDiffs ??= this.stageDiffs = {}
      stageDiffs[stage] = newStageDiff
    } else if (stageDiffs) delete stageDiffs[stage]

    const diff = getDiffDiff<T>(valueAtPreviousStage, oldStageDiff, newStageDiff)
    if (!diff) return false
    this.trimDiffs(stage, diff)
    return true
  }

  setPropAtStage<K extends keyof T>(stage: StageNumber, prop: K, value: T[K]): boolean {
    const { firstStage } = this
    assert(stage >= firstStage, "stage must be >= first stage")
    if (this.isRollingStock()) return false

    const [propAtPreviousStage] = this.getPropAtStage(stage - 1, prop)
    return this.setPropAtStageInternal(stage, prop, value, propAtPreviousStage)
  }

  private setPropAtStageInternal<K extends keyof T>(
    stage: StageNumber,
    prop: K,
    newValue: T[K],
    propAtPreviousStage: T[K],
  ): boolean {
    let oldValue = propAtPreviousStage
    const [hasDiff, curStageValue] = this.getStageDiffProp(stage, prop)
    if (hasDiff) oldValue = curStageValue!

    if (deepCompare(oldValue, newValue)) return false

    const newDiffValue = getDiff(propAtPreviousStage, newValue)

    if (stage == this.firstStage) {
      this.firstValue[prop] = newValue
    } else {
      let { stageDiffs } = this
      if (newDiffValue != nil) {
        stageDiffs ??= this.stageDiffs = {}
        const stageDiff: Mutable<StageDiff<T>> = stageDiffs[stage] ?? (stageDiffs[stage] = {} as any)
        stageDiff[prop] = newDiffValue
      } else if (stageDiffs) {
        delete stageDiffs[stage]?.[prop]
      }
    }

    this.trimDiffs(stage, { [prop]: toDiffValue(newValue) } as { [P in keyof T]: DiffValue<any> })
    return true
  }

  applyUpgradeAtStage(stage: StageNumber, newName: string): boolean {
    return this.setPropAtStage(stage, "name", newName)
  }

  private trimDiffs(stage: StageNumber, diff: StageDiff<T>): void {
    // trim diffs in higher stages, remove those that are ineffectual
    const { stageDiffs } = this
    if (!stageDiffs) return
    const oldDiff = stageDiffs[stage]
    if (oldDiff && isEmpty(oldDiff)) delete stageDiffs[stage]

    for (const [stageNumber, changes] of pairs(stageDiffs)) {
      if (stageNumber <= stage) continue
      for (const [k, v] of pairs(diff)) {
        if (deepCompare(changes[k], v)) {
          // changed to same value, remove
          delete changes[k]
        } else {
          // changed to different value, no longer need to consider for trimming
          delete diff[k]
        }
      }
      if (isEmpty(changes)) delete stageDiffs[stageNumber]
      if (isEmpty(diff)) break
    }
    if (isEmpty(stageDiffs)) delete this.stageDiffs
  }

  resetValue(stage: StageNumber): boolean {
    if (stage <= this.firstStage) return false
    return this.setDiffInternal(stage, nil, this.getValueAtStage(stage - 1)!)
  }

  resetProp<K extends keyof T>(stage: StageNumber, prop: K): boolean {
    if (stage <= this.firstStage) return false
    const [value] = this.getPropAtStage(stage - 1, prop)
    return this.setPropAtStageInternal(stage, prop, value, value)
  }

  movePropDown<K extends keyof T>(stage: StageNumber, prop: K): StageNumber | nil {
    const [hasDiff, curStageValue] = this.getStageDiffProp(stage, prop)
    if (!hasDiff) return nil

    const stageToApply = this.prevStageWithDiff(stage) ?? this.firstStage
    if (this.setPropAtStage(stageToApply, prop, curStageValue!)) return stageToApply
    return nil
  }

  moveValueDown(stage: StageNumber): StageNumber | nil {
    if (!this.hasStageDiff(stage)) return nil
    const stageToApply = this.prevStageWithDiff(stage) ?? this.firstStage
    if (this.adjustValueAtStage(stageToApply, this.getValueAtStage(stage)!)) return stageToApply
    return nil
  }

  getWorldOrPreviewEntity(stage: StageNumber): LuaEntity | nil {
    const entity = this[stage]
    if (entity) {
      if (entity.valid) return entity
      delete this[stage]
    }
  }

  getWorldEntity(stage: StageNumber) {
    const entity = this.getWorldOrPreviewEntity(stage)
    if (entity && !isPreviewEntity(entity)) return entity
  }

  replaceWorldEntity(stage: StageNumber, entity: LuaEntity | nil): void {
    // assert(!entity || !isPreviewEntity(entity), "entity must not be a preview entity")
    this.replaceWorldOrPreviewEntity(stage, entity)
  }
  replaceWorldOrPreviewEntity(stage: StageNumber, entity: LuaEntity | nil): void {
    const existing = this[stage]
    if (existing && existing.valid && existing != entity) {
      raise_script_destroy({ entity: existing })
      existing.destroy()
    }
    this[stage] = entity
    if (entity && rollingStockTypes.has(entity.type)) {
      registerEntity(entity, this)
    }
  }

  destroyWorldOrPreviewEntity(stage: StageNumber): void {
    const existing = this[stage]
    if (existing && existing.valid) {
      raise_script_destroy({ entity: existing })
      existing.destroy()
      delete this[stage]
    }
  }

  destroyAllWorldOrPreviewEntities(): void {
    for (const [k, v] of pairs(this)) {
      if (typeof k != "number") break
      assume<LuaEntity>(v)
      if (v.valid) {
        raise_script_destroy({ entity: v })
        v.destroy()
      }
      delete this[k]
    }
  }

  hasWorldEntityInRange(start: StageNumber, end: StageNumber): boolean {
    for (const i of $range(start, end)) {
      const entity = this[i]
      if (entity && entity.valid) {
        if (!isPreviewEntity(entity)) return true
      } else {
        delete this[i]
      }
    }
    return false
  }

  // note: for extra entities, we don't call raiseScriptDestroy as it's not needed + for performance reasons
  getExtraEntity<T extends keyof ExtraEntities>(type: T, stage: StageNumber): ExtraEntities[T] | nil {
    const { stageProperties } = this
    if (!stageProperties) return nil
    const byType = stageProperties[type]
    if (!byType) return nil
    const worldEntity = byType[stage]
    if (worldEntity && worldEntity.valid) return worldEntity
    // delete
    delete byType[stage]
    if (isEmpty(byType)) delete stageProperties[type]
  }
  replaceExtraEntity<T extends keyof ExtraEntities>(type: T, stage: StageNumber, entity: ExtraEntities[T] | nil): void {
    if (entity == nil) return this.destroyExtraEntity(type, stage)
    const stageProperties = this.stageProperties ?? (this.stageProperties = {})
    const byType = stageProperties[type] ?? ((stageProperties[type] = {}) as PRecord<StageNumber, ExtraEntities[T]>)
    const existing = byType[stage]
    if (existing && existing.valid && existing != entity) existing.destroy()
    byType[stage] = entity
  }
  destroyExtraEntity<T extends ExtraEntityType>(type: T, stage: StageNumber): void {
    const { stageProperties } = this
    if (!stageProperties) return
    const byType = stageProperties[type]
    if (!byType) return
    const entity = byType[stage]
    if (entity && entity.valid) entity.destroy()
    if (!entity || !entity.valid) {
      delete byType[stage]
      if (isEmpty(byType)) {
        delete stageProperties[type]
        if (isEmpty(stageProperties)) delete this.stageProperties
      }
    }
  }

  destroyAllExtraEntities(type: ExtraEntityType): void {
    const { stageProperties } = this
    if (!stageProperties) return
    const byType = stageProperties[type]
    if (!byType) return
    for (const [, entity] of pairs(byType)) {
      if (entity && entity.valid) entity.destroy()
    }
    delete stageProperties[type]
    if (isEmpty(stageProperties)) delete this.stageProperties
  }

  hasAnyExtraEntities(type: ExtraEntityType): boolean {
    const { stageProperties } = this
    return stageProperties != nil && stageProperties[type] != nil
  }

  iterateWorldOrPreviewEntities(): LuaIterable<LuaMultiReturn<[StageNumber, any]>> {
    let lastKey: StageNumber | nil = nil
    return (() => {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const nextKey = next(this, lastKey)[0]
        if (typeof nextKey != "number") return nil
        lastKey = nextKey
        const entity = this[nextKey]
        if (entity && entity.valid) return $multi(nextKey, entity)
        delete this[nextKey]
      }
    }) as any
  }

  setProperty<T extends keyof StageProperties>(key: T, stage: StageNumber, value: StageProperties[T] | nil): void {
    const stageProperties = this.stageProperties ?? (this.stageProperties = {})
    const byType: PRecord<StageNumber, StageProperties[T]> = stageProperties[key] || (stageProperties[key] = {})
    byType[stage] = value
    if (isEmpty(byType)) delete stageProperties[key]
  }
  getProperty<T extends keyof StageProperties>(key: T, stage: StageNumber): StageProperties[T] | nil {
    const stageProperties = this.stageProperties
    if (!stageProperties) return nil
    const byType = stageProperties[key]
    return byType && byType[stage]
  }
  propertySetInAnyStage(key: keyof StageProperties): boolean {
    const stageProperties = this.stageProperties
    return stageProperties != nil && stageProperties[key] != nil
  }
  clearPropertyInAllStages<T extends keyof StageProperties>(key: T): void {
    const stageProperties = this.stageProperties
    if (!stageProperties) return
    delete stageProperties[key]
  }

  override insertStage(stageNumber: StageNumber): void {
    super.insertStage(stageNumber)
    const { stageProperties } = this
    if (stageProperties)
      for (const [, byType] of pairs(stageProperties)) {
        shiftNumberKeysUp(byType, stageNumber)
      }
  }

  override deleteStage(stageNumber: StageNumber): void {
    super.deleteStage(stageNumber)
    const { stageProperties } = this
    if (stageProperties)
      for (const [, byType] of pairs(stageProperties)) {
        shiftNumberKeysDown(byType, stageNumber)
      }
  }
}
ProjectEntityImpl.prototype.applyDiff = applyDiffToEntity

export function addCircuitConnection(connection: ProjectCircuitConnection): void {
  const { fromEntity, toEntity } = connection
  fromEntity.addOneWayCircuitConnection(connection)
  toEntity.addOneWayCircuitConnection(connection)
}
export function removeCircuitConnection(connection: ProjectCircuitConnection): void {
  const { fromEntity, toEntity } = connection
  fromEntity.removeOneWayCircuitConnection(connection)
  toEntity.removeOneWayCircuitConnection(connection)
}

/** nil direction means the default direction of north */
export function createProjectEntityNoCopy<E extends Entity>(
  entity: E,
  position: Position,
  direction: defines.direction | nil,
  stageNumber: StageNumber,
): ProjectEntity<E> {
  return new ProjectEntityImpl(stageNumber, entity, position, direction)
}

// vehicles and units
const excludedTypes: Record<string, true> = {
  unit: true,
  car: true,
  "spider-vehicle": true,
  "entity-ghost": true,
}

export function isWorldEntityProjectEntity(luaEntity: LuaEntity): boolean {
  return (
    luaEntity.valid &&
    luaEntity.is_entity_with_owner &&
    luaEntity.has_flag("player-creation") &&
    !excludedTypes[luaEntity.type]
  )
}

/**
 * Gets the stage number this would merge with if this stage were to be deleted.
 */
export function getStageToMerge(stageNumber: StageNumber): StageNumber {
  if (stageNumber == 1) return 2
  return stageNumber - 1
}

export function _migrateEntity_0_17_0(entity: ProjectEntity): void {
  if (entity.isUndergroundBelt() && entity.firstValue.type == "output") {
    entity.direction = oppositedirection(entity.direction)
  }
}
