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

import { registerEntity } from "../assembly/entity-registration"
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
import { Entity } from "./Entity"
import { CategoryName, getEntityCategory, isRollingStockType, rollingStockTypes } from "./entity-info"
import { RollingStockEntity, UndergroundBeltEntity } from "./special-entities"
import { applyDiffToDiff, applyDiffToEntity, getEntityDiff, mergeDiff, StageDiff } from "./stage-diff"

export type StageNumber = number

/**
 * All the data about one entity in an assembly, across all stages.
 */
export interface AssemblyEntity<out T extends Entity = Entity> {
  readonly categoryName: CategoryName
  readonly position: Position
  readonly direction: defines.direction | nil
  getDirection(): defines.direction
  setDirection(direction: defines.direction): void

  isSettingsRemnant?: true

  getFirstStage(): StageNumber
  getFirstValue(): Readonly<T>

  isRollingStock(): this is AssemblyRollingStockEntity

  /** @return if this entity has any changes at the given stage, or any stage if nil */
  hasStageDiff(stage?: StageNumber): boolean
  getStageDiff(stage: StageNumber): StageDiff<T> | nil
  _getStageDiffs(): StageDiffs<T> | nil
  _applyDiffAtStage(stage: StageNumber, diff: StageDiff<T>): void

  /** @return the value at a given stage. Nil if below the first stage. The result is a new table. */
  getValueAtStage(stage: StageNumber): T | nil
  /** Gets the entity name at the given stage. If below the first stage, returns the first entity name. */
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
   * If there is diff, also clears oldStage (see {@link getOldStage}).
   * @return true if the value changed.
   */
  adjustValueAtStage(stage: StageNumber, value: T): boolean
  /**
   * Similar to adjustValueAtStage, but only does upgrades ("name" property).
   * More efficient than repeated adjustValueAtStage.
   */
  applyUpgradeAtStage(stage: StageNumber, newName: string): boolean

  setUndergroundBeltDirection(this: UndergroundBeltAssemblyEntity, direction: "input" | "output"): void

  /**
   * @param stage the stage to move to. If moving up, deletes/merges all stage diffs from old stage to new stage.
   * @param recordOldStage if true, records the old stage (so the entity can be moved back). Otherwise, clears the old stage.
   * @return the previous first stage
   */
  moveToStage(stage: StageNumber, recordOldStage?: boolean): StageNumber

  /**
   * The last stage before moveToStage() was called with recordOldStage.
   * The stage memo is cleared when adjustValueAtStage() is called with changes on a stage that is not the first stage.
   */
  getOldStage(): StageNumber | nil

  /** Returns nil if world entity does not exist or is invalid */
  getWorldEntity(stage: StageNumber): WorldEntities["mainEntity"] | nil
  getWorldEntity<T extends WorldEntityType>(stage: StageNumber, type: T): WorldEntities[T] | nil
  /** Destroys the old world entity, if exists. If `entity` is not nil, sets the new world entity. */
  replaceWorldEntity(stage: StageNumber, entity: WorldEntities["mainEntity"] | nil): void
  replaceWorldEntity<T extends WorldEntityType>(stage: StageNumber, entity: WorldEntities[T] | nil, type: T): void
  destroyWorldEntity<T extends WorldEntityType>(stage: StageNumber, type: T): void
  hasAnyWorldEntity(type: WorldEntityType): boolean
  destroyAllWorldEntities(type: WorldEntityType): void
  /** Iterates all valid world entities. May skip stages. */
  iterateWorldEntities<T extends WorldEntityType>(
    type: T,
  ): LuaIterable<LuaMultiReturn<[StageNumber, NonNullable<WorldEntities[T]>]>>

  setProperty<T extends keyof StageProperties>(stage: StageNumber, key: T, value: StageProperties[T] | nil): void
  getProperty<T extends keyof StageProperties>(stage: StageNumber, key: T): StageProperties[T] | nil
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

export interface WorldEntities {
  mainEntity?: LuaEntity
}
export type WorldEntityType = keyof WorldEntities
type AnyWorldEntity = WorldEntities[keyof WorldEntities]

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface StageProperties {}

export type AssemblyRollingStockEntity = AssemblyEntity<RollingStockEntity>
export type UndergroundBeltAssemblyEntity = AssemblyEntity<UndergroundBeltEntity>

type StageData = WorldEntities & StageProperties

@RegisterClass("AssemblyEntity")
class AssemblyEntityImpl<T extends Entity = Entity> implements AssemblyEntity<T> {
  public readonly categoryName: CategoryName
  public readonly position: Position
  public direction: defines.direction | nil

  public isSettingsRemnant: true | nil

  private firstStage: StageNumber
  private readonly firstValue: Mutable<T>
  stageDiffs?: PRecord<StageNumber, Mutable<StageDiff<T>>>
  private oldStage: StageNumber | nil

  private readonly stageProperties: {
    [P in keyof StageData]?: PRecord<StageNumber, StageData[P]>
  } = {}

  constructor(firstStage: StageNumber, firstValue: T, position: Position, direction: defines.direction | nil) {
    this.categoryName = getEntityCategory(firstValue.name)
    this.position = position
    this.direction = direction === 0 ? nil : direction
    this.firstValue = shallowCopy(firstValue)
    this.firstStage = firstStage
  }

  public getDirection(): defines.direction {
    return this.direction ?? 0
  }
  public setDirection(direction: defines.direction): void {
    if (direction === 0) {
      this.direction = nil
    } else {
      this.direction = direction
    }
  }

  getFirstStage(): StageNumber {
    return this.firstStage
  }
  getFirstValue(): T {
    return this.firstValue
  }

  isRollingStock(): this is AssemblyEntity<RollingStockEntity> {
    return isRollingStockType(this.firstValue.name)
  }

  hasStageDiff(stage?: StageNumber): boolean {
    const { stageDiffs } = this
    if (!stageDiffs) return false
    if (stage) return stageDiffs[stage] !== nil
    return next(stageDiffs)[0] !== nil
  }
  getStageDiff(stage: StageNumber): StageDiff<T> | nil {
    const { stageDiffs } = this
    return stageDiffs && stageDiffs[stage]
  }
  _getStageDiffs(): StageDiffs<T> | nil {
    return this.stageDiffs
  }
  _applyDiffAtStage(stage: StageNumber, diff: StageDiff<T>): void {
    if (this.isRollingStock()) return
    let { stageDiffs } = this
    const { firstStage } = this
    assert(stage >= firstStage, "stage must be >= first stage")
    if (stage === firstStage) {
      applyDiffToEntity(this.firstValue, diff)
      return
    }
    const existingDiff = stageDiffs && stageDiffs[stage]
    if (existingDiff) {
      applyDiffToDiff(existingDiff, diff)
    } else {
      stageDiffs ??= this.stageDiffs = {}
      stageDiffs[stage] = shallowCopy(diff)
    }
  }

  getValueAtStage(stage: StageNumber): T | nil {
    // assert(stage >= 1, "stage must be >= 1")
    const { firstStage } = this
    if (stage < firstStage) return nil
    if (this.isRollingStock() && stage !== firstStage) return nil
    const value = mutableShallowCopy(this.firstValue)
    const { stageDiffs } = this
    if (stageDiffs) {
      for (const [changedStage, diff] of pairs(stageDiffs)) {
        if (changedStage > stage) break
        applyDiffToEntity(value, diff)
      }
    }
    return value
  }
  getNameAtStage(stage: StageNumber): string {
    let name = this.firstValue.name
    if (stage <= this.firstStage) return name
    const { stageDiffs } = this
    if (stageDiffs) {
      for (const [changedStage, diff] of pairs(stageDiffs)) {
        if (changedStage > stage) break
        if (diff.name) name = diff.name!
      }
    }
    return name
  }

  iterateValues(start: StageNumber, end: StageNumber): LuaIterable<LuaMultiReturn<[StageNumber, Readonly<T> | nil]>>
  iterateValues(start: StageNumber, end: StageNumber) {
    if (this.isRollingStock()) return this.iterateValuesRollingStock(start, end)

    const { firstStage, firstValue } = this
    let value = this.getValueAtStage(start)
    function next(stageValues: StageDiffs | nil, prevStage: StageNumber | nil) {
      if (!prevStage) {
        return $multi(start, value)
      }
      const nextStage = prevStage + 1
      if (nextStage < firstStage) return $multi(nextStage, nil)
      if (nextStage > end) return $multi()
      if (nextStage === firstStage) {
        value = shallowCopy(firstValue)
      } else {
        const diff = stageValues && stageValues[nextStage]
        if (diff) applyDiffToEntity(value!, diff)
      }
      return $multi(nextStage, value)
    }
    return $multi<any>(next, this.stageDiffs, nil)
  }

  private iterateValuesRollingStock(start: StageNumber, end: StageNumber) {
    // only shows up in the first stage
    const { firstStage, firstValue } = this
    function next(_: any, prevStage: StageNumber) {
      const stage = prevStage + 1
      if (stage > end) return $multi()
      if (stage === firstStage) return $multi(stage, firstValue)
      return $multi(stage, nil)
    }
    return $multi<any>(next, nil, start - 1)
  }

  adjustValueAtStage(stage: StageNumber, value: T): boolean {
    const { firstStage } = this
    assert(stage >= firstStage, "stage must be >= first stage")

    if (this.isRollingStock()) return this.adjustValueRollingStock(stage, value)

    const diff = this.setValueAndGetDiff(stage, value)
    if (!diff) return false
    this.trimDiffs(stage, diff)

    this.oldStage = nil
    return true
  }
  private adjustValueRollingStock(this: AssemblyEntityImpl<RollingStockEntity>, stage: StageNumber, value: T): boolean {
    const canAdjust = stage === this.firstStage
    if (!canAdjust) return false
    const diff = getEntityDiff(this.firstValue, value)
    if (!diff) return false
    delete diff.orientation // ignore orientation
    if (isEmpty(diff)) return false
    applyDiffToEntity(this.firstValue, diff)
    return true
  }

  private setValueAndGetDiff(stage: StageNumber, value: T): StageDiff<T> | nil {
    if (stage === this.firstStage) {
      const { firstValue } = this
      const diff = getEntityDiff(firstValue, value)
      if (diff) {
        applyDiffToEntity(firstValue, diff)
        return diff
      }
    } else {
      const valueAtPreviousStage = assert(this.getValueAtStage(stage - 1))
      const newStageDiff = getEntityDiff(valueAtPreviousStage, value)

      let { stageDiffs } = this
      const oldStageDiff: Mutable<StageDiff<T>> | nil = stageDiffs && stageDiffs[stage]
      if (newStageDiff) {
        stageDiffs ??= this.stageDiffs = {}
        stageDiffs[stage] = newStageDiff
      } else if (stageDiffs) delete stageDiffs[stage]

      return mergeDiff<T>(valueAtPreviousStage, oldStageDiff, newStageDiff)
    }
  }

  private trimDiffs(stage: number, diff: StageDiff<T>): void {
    // trim diffs in higher stages, remove those that are ineffectual
    const { stageDiffs } = this
    if (!stageDiffs) return
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

  applyUpgradeAtStage(stage: StageNumber, newName: string): boolean {
    if (this.isRollingStock()) return false // rolling stock can't be upgraded
    const { firstStage } = this
    let { stageDiffs } = this
    assert(stage >= firstStage, "stage must be >= first stage")
    const previousName = this.getNameAtStage(stage)
    if (newName === previousName) return false
    if (stage === this.firstStage) {
      this.firstValue.name = newName
    } else {
      const nameInPreviousStage = this.getNameAtStage(stage - 1)
      const nameChanged = nameInPreviousStage !== newName
      if (nameChanged) {
        stageDiffs ??= this.stageDiffs = {}
        const stageDiff = stageDiffs[stage] || (stageDiffs[stage] = {} as any)
        stageDiff.name = newName
      } else {
        const stageDiff = stageDiffs && stageDiffs[stage]
        if (stageDiff) {
          delete stageDiff.name
          if (isEmpty(stageDiff)) delete stageDiffs![stage]
        }
      }
    }
    this.trimDiffs(stage, { name: newName } as StageDiff<T>)

    this.oldStage = nil
    return true
  }

  public setUndergroundBeltDirection(
    this: AssemblyEntityImpl<UndergroundBeltEntity>,
    direction: "input" | "output",
  ): void {
    const { firstValue } = this
    const existingType = firstValue.type
    assert(existingType === "input" || existingType === "output", "must already be underground belt")
    firstValue.type = direction
  }

  private moveUp(higherStage: StageNumber): void {
    // todo: what happens if moved up, and lost data?
    const { firstValue } = this
    const { stageDiffs } = this
    if (stageDiffs) {
      for (const [changeStage, changed] of pairs(stageDiffs)) {
        if (changeStage > higherStage) break
        applyDiffToEntity(firstValue, changed)
        delete stageDiffs[changeStage]
      }
      if (isEmpty(stageDiffs)) delete this.stageDiffs
    }
    this.firstStage = higherStage
  }
  moveToStage(stage: StageNumber, recordOldStage?: boolean): StageNumber {
    const { firstStage } = this
    if (stage > firstStage) {
      this.moveUp(stage)
    } else if (stage < firstStage) {
      this.firstStage = stage
    }
    this.oldStage = recordOldStage && firstStage !== stage ? firstStage : nil
    return firstStage
    // else do nothing
  }
  getOldStage(): StageNumber | nil {
    return this.oldStage
  }

  getWorldEntity(stage: StageNumber, type: WorldEntityType = "mainEntity") {
    const { stageProperties } = this
    const byType = stageProperties[type]
    if (!byType) return nil
    const worldEntity = byType[stage]
    if (worldEntity && worldEntity.valid) {
      return worldEntity as LuaEntity
    }
    // delete
    delete byType[stage]
    if (isEmpty(byType)) delete stageProperties[type]
  }
  replaceWorldEntity(stage: StageNumber, entity: AnyWorldEntity | nil, type: WorldEntityType = "mainEntity"): void {
    if (entity === nil) return this.destroyWorldEntity(stage, type)
    const { stageProperties } = this
    const byType = stageProperties[type] || (stageProperties[type] = {})
    const existing = byType[stage]
    if (existing && existing.valid && existing !== entity) existing.destroy()
    byType[stage] = entity
    if (entity && entity.object_name === "LuaEntity" && rollingStockTypes.has(entity.type)) {
      registerEntity(entity as LuaEntity, this)
    }
  }
  destroyWorldEntity<T extends WorldEntityType>(stage: StageNumber, type: T): void {
    const { stageProperties } = this
    const byType = stageProperties[type]
    if (!byType) return
    const entity = byType[stage]
    if (entity && entity.valid) entity.destroy()
    if (!entity || !entity.valid) {
      delete byType[stage]
      if (isEmpty(byType)) delete stageProperties[type]
    }
  }
  hasAnyWorldEntity(type: WorldEntityType): boolean {
    const { stageProperties } = this
    const byType = stageProperties[type]
    if (!byType) return false
    for (const [key, entity] of pairs(byType)) {
      if (entity && entity.valid) return true
      byType[key] = nil
    }
    if (isEmpty(byType)) delete stageProperties[type]
    return false
  }
  destroyAllWorldEntities(type: WorldEntityType): void {
    const { stageProperties } = this
    const byType = stageProperties[type]
    if (!byType) return
    for (const [, entity] of pairs(byType)) {
      if (entity && entity.valid) entity.destroy()
    }
    delete stageProperties[type]
  }
  iterateWorldEntities(type: WorldEntityType): LuaIterable<LuaMultiReturn<[StageNumber, any]>> {
    const byType = this.stageProperties[type]
    if (!byType) return (() => nil) as any
    let curKey = next(byType)[0]
    return function () {
      while (curKey) {
        const key = curKey
        curKey = next(byType, key)[0]
        const entity = byType[key]!
        if (entity.valid) return $multi(key, entity)
        delete byType[key]
      }
    } as any
  }

  setProperty<T extends keyof StageProperties>(stage: StageNumber, key: T, value: StageProperties[T] | nil): void {
    const { stageProperties } = this
    const byType: PRecord<StageNumber, StageProperties[T]> = stageProperties[key] || (stageProperties[key] = {} as any)
    byType[stage] = value
    if (isEmpty(byType)) delete stageProperties[key]
  }
  getProperty<T extends keyof StageProperties>(stage: StageNumber, key: T): StageProperties[T] | nil {
    const byType = this.stageProperties[key]
    return byType && byType[stage]
  }
  propertySetInAnyStage(key: keyof StageProperties): boolean {
    return this.stageProperties[key] !== nil
  }
  clearPropertyInAllStages<T extends keyof StageProperties>(key: T): void {
    delete this.stageProperties[key]
  }

  insertStage(stageNumber: StageNumber): void {
    if (this.firstStage >= stageNumber) this.firstStage++
    if (this.oldStage && this.oldStage >= stageNumber) this.oldStage++

    if (this.stageDiffs) shiftNumberKeysUp(this.stageDiffs, stageNumber)
    for (const [, byType] of pairs(this.stageProperties)) {
      shiftNumberKeysUp(byType, stageNumber)
    }
  }

  deleteStage(stageNumber: StageNumber): void {
    const stageToMerge = stageNumber === 1 ? 2 : stageNumber
    this.mergeStageDiffWithBelow(stageToMerge)

    if (this.firstStage >= stageToMerge) this.firstStage--
    if (this.oldStage && this.oldStage >= stageToMerge) this.oldStage--

    if (this.stageDiffs) shiftNumberKeysDown(this.stageDiffs, stageNumber)
    for (const [, byType] of pairs(this.stageProperties)) {
      shiftNumberKeysDown(byType, stageNumber)
    }
  }
  private mergeStageDiffWithBelow(stageNumber: number): void {
    const { stageDiffs } = this
    if (!stageDiffs) return
    const thisChange = stageDiffs[stageNumber]
    if (!thisChange) return
    const prevStage = stageNumber - 1
    if (this.firstStage === prevStage) {
      applyDiffToEntity(this.firstValue, thisChange)
    } else {
      const prevChange = stageDiffs[prevStage]
      if (prevChange) {
        applyDiffToDiff(prevChange, thisChange)
      } else {
        stageDiffs[prevStage] = thisChange
      }
    }
    delete stageDiffs[stageNumber]
  }
}

export function createAssemblyEntity<E extends Entity>(
  entity: E,
  position: Position,
  direction: defines.direction | nil,
  stageNumber: StageNumber,
): AssemblyEntity<E> {
  return new AssemblyEntityImpl(stageNumber, entity, position, direction)
}

// vehicles and units
const excludedTypes: ReadonlyLuaSet<string> = newLuaSet("unit", "car", "spider-vehicle")

export function isWorldEntityAssemblyEntity(luaEntity: LuaEntity): boolean {
  return luaEntity.is_entity_with_owner && luaEntity.has_flag("player-creation") && !excludedTypes.has(luaEntity.type)
}

// note: see also EntityHighlighter, updateErrorHighlight
export function entityHasErrorAt(entity: AssemblyEntity, stageNumber: StageNumber): boolean {
  return stageNumber >= entity.getFirstStage() && entity.getWorldEntity(stageNumber) === nil
}

/** Used by custom input */
export function isNotableStage(entity: AssemblyEntity, stageNumber: StageNumber): boolean {
  return (
    entity.getFirstStage() === stageNumber || entity.hasStageDiff(stageNumber) || entityHasErrorAt(entity, stageNumber)
  )
}

/**
 * Gets the stage number this would merge with if this stage were to be deleted.
 */
export function getStageToMerge(stageNumber: StageNumber): StageNumber {
  if (stageNumber === 1) return 2
  return stageNumber - 1
}

export function _migrate031(entity: AssemblyEntity): void {
  const e = entity as AssemblyEntityImpl
  const stageDiffs = e.stageDiffs
  if (stageDiffs && isEmpty(stageDiffs)) delete e.stageDiffs
}
