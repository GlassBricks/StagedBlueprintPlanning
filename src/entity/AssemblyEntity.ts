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
import {
  deepCompare,
  isEmpty,
  Mutable,
  mutableShallowCopy,
  PRecord,
  PRRecord,
  RegisterClass,
  shallowCopy,
  shiftNumberKeysDown,
  shiftNumberKeysUp,
} from "../lib"
import { Position } from "../lib/geometry"
import { DiffValue, fromDiffValue, getDiff, toDiffValue } from "../utils/diff-value"
import { Entity, LoaderEntity, RollingStockEntity, UndergroundBeltEntity } from "./Entity"
import {
  EntityPrototypeInfo,
  isPreviewEntity,
  isRollingStockType,
  OnEntityPrototypesLoaded,
  rollingStockTypes,
} from "./entity-prototype-info"
import { registerEntity } from "./registration"
import { applyDiffToEntity, getDiffDiff, getEntityDiff, StageDiff, StageDiffInternal } from "./stage-diff"
import floor = math.floor

let nameToType: EntityPrototypeInfo["nameToType"]
OnEntityPrototypesLoaded.addListener((info) => {
  nameToType = info.nameToType
})

/** 1 indexed */
export type StageNumber = number

export type InternalSavedDirection = { _internalSavedDirection?: never }
/**
 * All the data about one entity in an assembly, across all stages.
 */
export interface AssemblyEntity<out T extends Entity = Entity> {
  readonly position: Position
  direction: defines.direction
  /**
   * If this is rolling stock, the direction is based off of orientation instead.
   */
  getPreviewDirection(): defines.direction

  setPositionUnchecked(position: Position): void

  isSettingsRemnant?: true

  readonly firstStage: StageNumber
  readonly lastStage: StageNumber | nil
  readonly firstValue: Readonly<T>

  /** Linked list for Map2D */
  _next: AssemblyEntity | nil

  isRollingStock(): this is RollingStockAssemblyEntity
  isUndergroundBelt(): this is UndergroundBeltAssemblyEntity

  // inFirstStageOnly(): boolean

  isInStage(stage: StageNumber): boolean

  isPastLastStage(stage: StageNumber): boolean

  hasErrorAt(stage: StageNumber): boolean

  setTypeProperty(this: UndergroundBeltAssemblyEntity, direction: "input" | "output"): void

  /** @return if this entity has any changes at the given stage, or any stage if nil */
  hasStageDiff(stage?: StageNumber): boolean
  getStageDiff(stage: StageNumber): StageDiff<T> | nil
  getStageDiffs(): StageDiffs<T> | nil
  _applyDiffAtStage(stage: StageNumber, diff: StageDiffInternal<T>): void
  /** Returns the first stage after the given stage number with a stage diff, or `nil` if none. */
  nextStageWithDiff(stage: StageNumber): StageNumber | nil
  /** Returns the first stage before the given stage number with a stage diff, or `nil` if none. */
  prevStageWithDiff(stage: StageNumber): StageNumber | nil

  /** @return the value at a given stage. Nil if below the first stage. The result is a new table. */
  getValueAtStage(stage: StageNumber): Readonly<T> | nil
  /** @return the value of a property at a given stage, or at the first stage if below the first stage. Also returns the stage in which the property is affected. */
  getPropAtStage<K extends keyof T>(stage: StageNumber, prop: K): LuaMultiReturn<[T[K], StageNumber]>

  /**
   * Gets the entity name at the given stage. If below the first stage, this returns the first entity name.
   * Similar to `getPropAtStage("name", stage)`.
   */
  getNameAtStage(stage: StageNumber): string
  /**
   * Iterates the values of stages in the given range. More efficient than repeated calls to getValueAtStage.
   * The same instance will be returned for each stage; its value is ephemeral.
   */
  iterateValues(start: StageNumber, end: StageNumber): LuaIterable<LuaMultiReturn<[StageNumber, Readonly<T> | nil]>>

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
  /** Alias for `setPropAtStage("name", stage, name)`. */
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

  /**
   * Sets the first stage. If moving up, deletes/merges all stage diffs from old stage to new stage.
   * @return the previous first stage
   */
  setFirstStageUnchecked(stage: StageNumber): StageNumber

  /**
   * Sets the last stage. If moving down, deletes all diffs after the new last stage.
   */
  setLastStageUnchecked(stage: StageNumber | nil): void

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

  /** Modifies to be consistent with an inserted stage. */
  insertStage(stageNumber: StageNumber): void

  /**
   * Modifies to be consistent with a deleted stage.
   * Stage contents will be merged with previous stage. If stage is 1, will be merged with next stage instead.
   */
  deleteStage(stageNumber: StageNumber): void
}

export type StageDiffs<E extends Entity = Entity> = PRRecord<StageNumber, StageDiff<E>>
export type StageDiffsInternal<E extends Entity = Entity> = PRRecord<StageNumber, StageDiffInternal<E>>

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ExtraEntities {}
export type ExtraEntityType = keyof ExtraEntities

export interface StageProperties {
  _?: never
}

export type RollingStockAssemblyEntity = AssemblyEntity<RollingStockEntity>
export type UndergroundBeltAssemblyEntity = AssemblyEntity<UndergroundBeltEntity>
export type LoaderAssemblyEntity = AssemblyEntity<LoaderEntity>

type StageData = ExtraEntities & StageProperties

type MutableStageDiff<T extends Entity> = Partial<Mutable<StageDiff<T>>>

export function orientationToDirection(orientation: RealOrientation | nil): defines.direction {
  if (orientation == nil) return 0
  return floor(orientation * 8 + 0.5) % 8
}

@RegisterClass("AssemblyEntity")
class AssemblyEntityImpl<T extends Entity = Entity> implements AssemblyEntity<T> {
  public position: Position
  public direction: defines.direction

  public isSettingsRemnant: true | nil

  firstStage: StageNumber
  lastStage: StageNumber | nil
  readonly firstValue: Mutable<T>
  stageDiffs?: PRecord<StageNumber, MutableStageDiff<T>>

  _next: AssemblyEntityImpl<T> | nil;

  [stage: StageNumber]: LuaEntity | nil // world entities and preview entities are stored in the same table
  stageProperties?: {
    [P in keyof StageData]?: PRecord<StageNumber, StageData[P]>
  }

  constructor(firstStage: StageNumber, firstValue: T, position: Position, direction: defines.direction | nil) {
    this.position = position
    this.direction = direction ?? 0
    this.firstValue = firstValue
    this.firstStage = firstStage
    if (this.isRollingStock()) {
      this.lastStage = firstStage
    }
  }

  public getPreviewDirection(): defines.direction {
    if (this.isRollingStock()) {
      return orientationToDirection((this.firstValue as RollingStockEntity).orientation)
    }
    // matches saved direction if underground belt
    return (this.direction ?? 0) as defines.direction
  }

  setPositionUnchecked(position: Position): void {
    this.position = position
  }

  isRollingStock(): boolean {
    return isRollingStockType(this.firstValue.name)
  }
  isUndergroundBelt(): this is UndergroundBeltAssemblyEntity {
    return nameToType.get(this.firstValue.name) == "underground-belt"
  }

  isInStage(stage: StageNumber): boolean {
    return stage >= this.firstStage && !this.isPastLastStage(stage)
  }

  isPastLastStage(stage: StageNumber): boolean {
    return this.lastStage != nil && stage > this.lastStage
  }

  hasErrorAt(stage: StageNumber): boolean {
    return this.isInStage(stage) && this.getWorldEntity(stage) == nil
  }

  setTypeProperty(this: AssemblyEntityImpl<UndergroundBeltEntity>, direction: "input" | "output"): void {
    // assume compiler asserts this is correct
    this.firstValue.type = direction
  }

  hasStageDiff(stage?: StageNumber): boolean {
    const { stageDiffs } = this
    if (!stageDiffs) return false
    if (stage) return stageDiffs[stage] != nil
    return next(stageDiffs)[0] != nil
  }
  getStageDiff(stage: StageNumber): StageDiff<T> | nil {
    const { stageDiffs } = this
    return stageDiffs && stageDiffs[stage]
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

  getStageDiffs(): StageDiffs<T> | nil {
    return this.stageDiffs
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

  nextStageWithDiff(stage: StageNumber): StageNumber | nil {
    if (stage < this.firstStage) return nil
    const { stageDiffs } = this
    if (!stageDiffs) return nil
    for (const [curStage] of pairs(stageDiffs)) {
      if (curStage > stage) return curStage
    }
    return nil
  }

  prevStageWithDiff(stage: StageNumber): StageNumber | nil {
    if (stage <= this.firstStage) return nil
    const { stageDiffs } = this
    if (!stageDiffs) return nil
    let result: StageNumber | nil
    for (const [curStage] of pairs(stageDiffs)) {
      if (curStage >= stage) break
      result = curStage
    }
    return result
  }

  getValueAtStage(stage: StageNumber): Readonly<T> | nil {
    // assert(stage >= 1, "stage must be >= 1")
    if (!this.isInStage(stage)) return nil
    const { firstStage } = this
    if (stage < firstStage) return nil
    const { stageDiffs } = this
    if (!stageDiffs) return this.firstValue

    const value = mutableShallowCopy(this.firstValue)
    for (const [changedStage, diff] of pairs(stageDiffs)) {
      if (changedStage > stage) break
      applyDiffToEntity(value, diff)
    }
    return value
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

  iterateValues(start: StageNumber, end: StageNumber): LuaIterable<LuaMultiReturn<[StageNumber, Readonly<T> | nil]>>
  iterateValues(start: StageNumber, end: StageNumber) {
    const stageDiffs = this.stageDiffs
    if (!stageDiffs) return this.iterateValuesNoDiffs(start, end)

    const { firstStage, firstValue } = this
    const lastStage = this.lastStage ?? end
    let value = this.getValueAtStage(start) as T
    function iterNext(stageDiffs: StageDiffs | nil, prevStage: StageNumber) {
      const nextStage = prevStage + 1
      if (nextStage > end) return $multi()
      if (nextStage < firstStage || nextStage > lastStage) return $multi(nextStage, nil)
      if (nextStage == firstStage) {
        value = shallowCopy(firstValue)
      } else {
        const diff = stageDiffs && stageDiffs[nextStage]
        if (diff) applyDiffToEntity(value, diff)
      }
      return $multi(nextStage, value)
    }
    return $multi<any>(iterNext, stageDiffs, start - 1)
  }

  private iterateValuesNoDiffs(start: StageNumber, end: StageNumber) {
    const { firstStage, firstValue } = this
    const lastStage = this.lastStage ?? end
    function next(_: any, prevStage: StageNumber) {
      const stage = prevStage + 1
      if (stage > end) return $multi()
      if (stage < firstStage || stage > lastStage) return $multi(stage, nil)
      return $multi(stage, firstValue)
    }
    return $multi<any>(next, nil, start - 1)
  }

  adjustValueAtStage(stage: StageNumber, value: T): boolean {
    const { firstStage } = this
    assert(stage >= firstStage, "stage must be >= first stage")

    if (this.isRollingStock()) return this.adjustValueRollingStock(stage, value)

    if (stage == this.firstStage) return this.setValueAtFirstStage(value)

    const valueAtPreviousStage = assert(this.getValueAtStage(stage - 1))
    const newStageDiff = getEntityDiff(valueAtPreviousStage, value)
    return this.setDiffInternal(stage, newStageDiff, valueAtPreviousStage)
  }
  private adjustValueRollingStock(this: AssemblyEntityImpl<RollingStockEntity>, stage: StageNumber, value: T): boolean {
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
        const stageDiff: MutableStageDiff<T> = stageDiffs[stage] ?? (stageDiffs[stage] = {})
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

  setFirstStageUnchecked(stage: StageNumber): StageNumber {
    const { firstStage, lastStage } = this
    if (lastStage) assert(stage <= lastStage, "stage must be <= last stage")
    if (stage > firstStage) this.moveFirstStageUp(stage)
    this.firstStage = stage
    return firstStage
  }
  private moveFirstStageUp(newFirstStage: StageNumber): void {
    const { stageDiffs } = this
    if (stageDiffs) {
      const { firstValue } = this
      for (const [stage, diff] of pairs(stageDiffs)) {
        if (stage > newFirstStage) break
        applyDiffToEntity(firstValue, diff)
        delete stageDiffs[stage]
      }
      if (isEmpty(stageDiffs)) delete this.stageDiffs
    }
  }

  public setLastStageUnchecked(stage: StageNumber | nil): void {
    assert(!stage || stage >= this.firstStage, "stage must be >= first stage")
    const { lastStage } = this
    if (stage && (lastStage == nil || stage < lastStage)) this.moveLastStageDown(stage)
    this.lastStage = stage
  }

  private moveLastStageDown(stage: number): void {
    const { stageDiffs } = this
    if (stageDiffs && (this.lastStage == nil || stage < this.lastStage)) {
      for (const [stageNumber] of pairs(stageDiffs)) {
        if (stageNumber > stage) delete stageDiffs[stageNumber]
      }
      if (isEmpty(stageDiffs)) delete this.stageDiffs
    }
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
    if (entity == nil) return this.destroyWorldOrPreviewEntity(stage)
    const existing = this[stage]
    if (existing && existing.valid && existing != entity) existing.destroy()
    this[stage] = entity
    if (rollingStockTypes.has(entity.type)) {
      registerEntity(entity, this)
    }
  }

  destroyWorldOrPreviewEntity(stage: StageNumber): void {
    const existing = this[stage]
    if (existing && existing.valid) {
      existing.destroy()
      delete this[stage]
    }
  }

  destroyAllWorldOrPreviewEntities(): void {
    for (const [k, v] of pairs(this)) {
      if (typeof k != "number") break
      assume<LuaEntity>(v)
      if (v.valid) v.destroy()
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

  public hasAnyExtraEntities(type: ExtraEntityType): boolean {
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

  insertStage(stageNumber: StageNumber): void {
    if (this.firstStage >= stageNumber) this.firstStage++
    if (this.lastStage && this.lastStage >= stageNumber) this.lastStage++

    shiftNumberKeysUp(this, stageNumber)
    if (this.stageDiffs) shiftNumberKeysUp(this.stageDiffs, stageNumber)
    const { stageProperties } = this
    if (stageProperties)
      for (const [, byType] of pairs(stageProperties)) {
        shiftNumberKeysUp(byType, stageNumber)
      }
  }

  deleteStage(stageNumber: StageNumber): void {
    const stageToMerge = stageNumber == 1 ? 2 : stageNumber
    this.mergeStageDiffWithBelow(stageToMerge)

    if (this.firstStage >= stageToMerge) this.firstStage--
    if (this.lastStage && this.lastStage >= stageNumber) this.lastStage--

    shiftNumberKeysDown(this, stageNumber)
    if (this.stageDiffs) shiftNumberKeysDown(this.stageDiffs, stageNumber)
    const { stageProperties } = this
    if (stageProperties)
      for (const [, byType] of pairs(stageProperties)) {
        shiftNumberKeysDown(byType, stageNumber)
      }
  }
  private mergeStageDiffWithBelow(stage: StageNumber): void {
    if (stage <= this.firstStage) return
    if (!this.hasStageDiff(stage)) return
    this.adjustValueAtStage(stage - 1, this.getValueAtStage(stage)!)
  }
}

/** nil direction means the default direction of north */
export function createAssemblyEntityNoCopy<E extends Entity>(
  entity: E,
  position: Position,
  direction: defines.direction | nil,
  stageNumber: StageNumber,
): AssemblyEntity<E> {
  return new AssemblyEntityImpl(stageNumber, entity, position, direction)
}

// vehicles and units
const excludedTypes: Record<string, true> = {
  unit: true,
  car: true,
  "spider-vehicle": true,
  "entity-ghost": true,
}

export function isWorldEntityAssemblyEntity(luaEntity: LuaEntity): boolean {
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

export function _migrateEntity_0_17_0(entity: AssemblyEntity): void {
  if (entity.isUndergroundBelt() && entity.firstValue.type == "output") {
    entity.direction = oppositedirection(entity.direction)
  }
}
