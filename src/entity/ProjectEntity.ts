// Copyright (c) 2022-2025 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { EntityType } from "factorio:prototype"
import { LuaEntity, nil, RealOrientation } from "factorio:runtime"
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
import {
  Entity,
  InserterEntity,
  LoaderEntity,
  MovableEntity,
  UndergroundBeltEntity,
  UnstagedEntityProps,
} from "./Entity"
import { isMovableEntity, isPreviewEntity, movableTypes, OnPrototypeInfoLoaded, PrototypeInfo } from "./prototype-info"
import { registerEntity } from "./registration"
import { applyDiffToEntity, getDiffDiff, getEntityDiff, StageDiff, StageDiffInternal } from "./stage-diff"
import { BaseStagedValue, StagedValue } from "./StagedValue"
import { getDirectionalInfo, ProjectWireConnection, wireConnectionEquals } from "./wire-connection"
import floor = math.floor

let nameToType: PrototypeInfo["nameToType"]
let excludedNames: PrototypeInfo["excludedNames"]
OnPrototypeInfoLoaded.addListener((info) => {
  nameToType = info.nameToType
  excludedNames = info.excludedNames
})

/** 1 indexed */
export type StageNumber = number

export type WireConnections = ReadonlyLuaMap<ProjectEntity, LuaSet<ProjectWireConnection>>

export interface NameAndQuality {
  name: string
  quality?: string
}

export function getNameAndQuality(name: string, quality?: string): NameAndQuality {
  if (quality == "normal") quality = nil
  return { name, quality }
}

/**
 * All the data about one entity in a project, across all stages.
 */
export interface ProjectEntity<out T extends Entity = Entity> extends StagedValue<T, StageDiff<T>> {
  readonly position: Position
  setPositionUnchecked(position: Position): void

  direction: defines.direction

  isSettingsRemnant?: true

  readonly wireConnections?: WireConnections

  addOneWayWireConnection(connection: ProjectWireConnection): boolean
  removeOneWayWireConnection(connection: ProjectWireConnection): void

  syncIngoingConnections(existingEntities: ReadonlyLuaSet<ProjectEntity>): void
  removeIngoingConnections(): void

  isUndergroundBelt(): this is UndergroundBeltProjectEntity
  isInserter(): this is InserterProjectEntity
  getType(): EntityType | nil

  isMovable(): this is MovableProjectEntity

  isNewRollingStock?: true

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
  getUpgradeAtStage(stage: StageNumber): NameAndQuality

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
  applyUpgradeAtStage(stage: StageNumber, newValue: NameAndQuality): boolean

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

  setUnstagedValue(stage: StageNumber, value: UnstagedEntityProps | nil): boolean
  getUnstagedValue(stage: StageNumber): UnstagedEntityProps | nil

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

  setProperty<T extends keyof StageProperties>(key: T, stage: StageNumber, value: StageProperties[T] | nil): boolean
  getProperty<T extends keyof StageProperties>(key: T, stage: StageNumber): StageProperties[T] | nil
  getPropertyAllStages<T extends keyof StageProperties>(key: T): Record<StageNumber, StageProperties[T]> | nil
  propertySetInAnyStage(key: keyof StageProperties): boolean
  clearPropertyInAllStages<T extends keyof StageProperties>(key: T): void
}

export type StageDiffs<E extends Entity = Entity> = PRRecord<StageNumber, StageDiff<E>>
export type StageDiffsInternal<E extends Entity = Entity> = PRRecord<StageNumber, StageDiffInternal<E>>

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ExtraEntities {}
export type ExtraEntityType = keyof ExtraEntities

export interface StageProperties {
  unstagedValue?: UnstagedEntityProps
}

export type MovableProjectEntity = ProjectEntity<MovableEntity>
export type UndergroundBeltProjectEntity = ProjectEntity<UndergroundBeltEntity>
export type LoaderProjectEntity = ProjectEntity<LoaderEntity>
export type InserterProjectEntity = ProjectEntity<InserterEntity>

type StageData = ExtraEntities & StageProperties

export function orientationToDirection(orientation: RealOrientation | nil): defines.direction {
  if (orientation == nil) return 0
  return floor(orientation * 16 + 0.5) % 16
}

const { raise_script_destroy } = script

// kinda messy
// 4 years ago me was only so kind
@RegisterClass("AssemblyEntity")
class ProjectEntityImpl<T extends Entity = Entity>
  extends BaseStagedValue<T, StageDiff<T>>
  implements ProjectEntity<T>
{
  position: Position
  direction: defines.direction

  isSettingsRemnant: true | nil

  wireConnections?: LuaMap<ProjectEntity, LuaSet<ProjectWireConnection>>

  _next: ProjectEntityImpl<T> | nil;

  [stage: StageNumber]: LuaEntity | nil // world entities and preview entities are stored in the same table
  stageProperties?: {
    [P in keyof StageData]?: PRecord<StageNumber, StageData[P]>
  }

  constructor(firstStage: StageNumber, firstValue: T, position: Position, direction: defines.direction) {
    super(firstStage, firstValue)
    this.position = position
    this.direction = direction
    if (this.oneStageOnly()) {
      this.lastStage = firstStage
    }
  }

  getPreviewDirection(): defines.direction {
    if (this.isMovable()) {
      return orientationToDirection((this.firstValue as MovableEntity).orientation)
    }
    return this.direction
  }

  setPositionUnchecked(position: Position): void {
    this.position = position
  }

  isUndergroundBelt(): this is UndergroundBeltProjectEntity {
    return nameToType.get(this.firstValue.name) == "underground-belt"
  }
  isInserter(): this is InserterProjectEntity {
    return nameToType.get(this.firstValue.name) == "inserter"
  }
  isMovable(): this is MovableProjectEntity {
    return isMovableEntity(this.firstValue.name)
  }
  getType(): EntityType | nil {
    return nameToType.get(this.firstValue.name)
  }
  override oneStageOnly(): boolean {
    return this.isMovable()
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

  addOneWayWireConnection(connection: ProjectWireConnection): boolean {
    const [toEntity] = getDirectionalInfo(connection, this)
    let connections = this.wireConnections
    if (connections) {
      const existingConnections = connections.get(toEntity)
      if (existingConnections)
        for (const existingConnection of existingConnections) {
          if (wireConnectionEquals(existingConnection, connection)) return false
        }
    }
    connections ??= this.wireConnections = new LuaMap()
    const existingConnections = connections.get(toEntity)
    if (existingConnections) existingConnections.add(connection)
    else connections.set(toEntity, newLuaSet(connection))
    return true
  }
  removeOneWayWireConnection(connection: ProjectWireConnection): void {
    const [toEntity] = getDirectionalInfo(connection, this)
    const connections = this.wireConnections
    if (!connections) return
    const existingConnections = connections.get(toEntity)
    if (!existingConnections) return
    existingConnections.delete(connection)
    if (existingConnections.isEmpty()) {
      connections.delete(toEntity)
      if (connections.isEmpty()) delete this.wireConnections
    }
  }

  syncIngoingConnections(existing: ReadonlyLuaSet<ProjectEntity>): void {
    const wireConnections = this.wireConnections
    if (wireConnections) {
      for (const [otherEntity, connections] of wireConnections) {
        if (!existing.has(otherEntity)) {
          wireConnections.delete(otherEntity)
        } else {
          for (const connection of connections) {
            otherEntity.addOneWayWireConnection(connection)
          }
        }
      }
      if (wireConnections.isEmpty()) delete this.wireConnections
    }
  }
  removeIngoingConnections(): void {
    const wireConnections = this.wireConnections
    if (wireConnections)
      for (const [otherEntity, connections] of wireConnections) {
        for (const connection of connections) {
          otherEntity.removeOneWayWireConnection(connection)
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
  getUpgradeAtStage(stage: StageNumber): NameAndQuality {
    const [name] = this.getPropAtStage(stage, "name")
    let [quality] = this.getPropAtStage(stage, "quality")
    if (quality == "normal") quality = nil
    return { name, quality }
  }

  declare applyDiff: <T extends Entity>(this: void, value: T, diff: StageDiff<T>) => Mutable<T>

  protected override moveFirstStageUp(newFirstStage: StageNumber): void {
    const unstagedDiff = this.stageProperties?.unstagedValue
    if (unstagedDiff) {
      for (const [stage] of pairs(unstagedDiff)) {
        if (stage < newFirstStage) {
          delete unstagedDiff[stage]
        }
      }
      if (isEmpty(unstagedDiff)) {
        this.stageProperties!.unstagedValue = nil
      }
    }
    super.moveFirstStageUp(newFirstStage)
  }

  protected override moveLastStageDown(newLastStage: number): void {
    const unstagedDiff = this.stageProperties?.unstagedValue
    if (unstagedDiff) {
      for (const [stage] of pairs(unstagedDiff)) {
        if (stage > newLastStage) {
          delete unstagedDiff[stage]
        }
      }
      if (isEmpty(unstagedDiff)) {
        this.stageProperties!.unstagedValue = nil
      }
    }
    super.moveLastStageDown(newLastStage)
  }

  adjustValueAtStage(stage: StageNumber, value: T): boolean {
    const { firstStage } = this
    assert(stage >= firstStage, "stage must be >= first stage")

    if (stage == this.firstStage) return this.setValueAtFirstStage(value)

    const valueAtPreviousStage = assert(this.getValueAtStage(stage - 1))
    const newStageDiff = getEntityDiff(valueAtPreviousStage, value)
    return this.setDiffInternal(stage, newStageDiff, valueAtPreviousStage)
  }

  private setValueAtFirstStage(value: T): boolean {
    const { firstValue } = this
    const diff = getEntityDiff(firstValue, value)
    if (!diff) return false
    if (this.isMovable()) {
      delete (diff as { orientation?: unknown }).orientation
    }
    if (isEmpty(diff)) {
      return false
    }

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

  applyUpgradeAtStage(stage: StageNumber, newValue: NameAndQuality): boolean {
    return this.setPropAtStage(stage, "name", newValue.name) || this.setPropAtStage(stage, "quality", newValue.quality)
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

  setUnstagedValue(stage: StageNumber, value: UnstagedEntityProps | nil): boolean {
    if (stage < this.firstStage || (this.lastStage && stage > this.lastStage)) return false
    return this.setProperty("unstagedValue", stage, value)
  }

  getUnstagedValue(stage: StageNumber): UnstagedEntityProps | nil {
    return this.getProperty("unstagedValue", stage)
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
    if (entity && movableTypes.has(entity.type)) {
      registerEntity(entity, this)
    }
  }

  destroyWorldOrPreviewEntity(stage: StageNumber): void {
    const existing = this[stage]
    if (existing && existing.valid) {
      raise_script_destroy({ entity: existing })
      existing.destroy()
    }
    delete this[stage]
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

  setProperty<T extends keyof StageProperties>(key: T, stage: StageNumber, value: StageProperties[T] | nil): boolean {
    if (value == nil) {
      const stageProperties = this.stageProperties
      if (!stageProperties) return false
      const byType = stageProperties[key]
      if (!byType) return false
      const changed = byType[stage] != nil
      delete byType[stage]
      if (isEmpty(byType)) delete stageProperties[key]
      return changed
    } else {
      const stageProperties = this.stageProperties ?? (this.stageProperties = {})
      const byType: PRecord<StageNumber, StageProperties[T]> = stageProperties[key] || (stageProperties[key] = {})
      const changed = !deepCompare(byType[stage], value)
      byType[stage] = value
      return changed
    }
  }
  getProperty<T extends keyof StageProperties>(key: T, stage: StageNumber): StageProperties[T] | nil {
    const stageProperties = this.stageProperties
    if (!stageProperties) return nil
    const byType = stageProperties[key]
    return byType && byType[stage]
  }
  getPropertyAllStages<T extends keyof StageProperties>(key: T): Record<StageNumber, StageProperties[T]> | nil {
    return this.stageProperties?.[key]
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

export function addWireConnection(connection: ProjectWireConnection): void {
  const { fromEntity, toEntity } = connection
  fromEntity.addOneWayWireConnection(connection)
  toEntity.addOneWayWireConnection(connection)
}
export function removeWireConnection(connection: ProjectWireConnection): void {
  const { fromEntity, toEntity } = connection
  fromEntity.removeOneWayWireConnection(connection)
  toEntity.removeOneWayWireConnection(connection)
}

export function newProjectEntity<E extends Entity>(
  entity: E,
  position: Position,
  direction: defines.direction,
  stageNumber: StageNumber,
  unstagedValue?: UnstagedEntityProps,
): ProjectEntity<E> {
  const result = new ProjectEntityImpl(stageNumber, entity, position, direction)
  if (unstagedValue) result.setUnstagedValue(stageNumber, unstagedValue)
  return result
}

const excludedTypes: Record<string, true> = {
  unit: true,
  "entity-ghost": true,
}

export function isWorldEntityProjectEntity(luaEntity: LuaEntity): boolean {
  return (
    luaEntity.valid &&
    luaEntity.is_entity_with_owner &&
    luaEntity.has_flag("player-creation") &&
    !excludedTypes[luaEntity.type] &&
    !excludedNames.has(luaEntity.name)
  )
}

/**
 * Gets the stage number this would merge with if this stage were to be deleted.
 */
export function getStageToMerge(stageNumber: StageNumber): StageNumber {
  if (stageNumber == 1) return 2
  return stageNumber - 1
}
