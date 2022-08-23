/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of BBPP3.
 *
 * BBPP3 is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * BBPP3 is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with BBPP3. If not, see <https://www.gnu.org/licenses/>.
 */

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
import { applyDiffToDiff, applyDiffToEntity, getEntityDiff, mergeDiff, StageDiff } from "./diff"
import { Entity, EntityPose } from "./Entity"
import { CategoryName, getEntityCategory } from "./entity-info"

export type StageNumber = number

export interface AssemblyEntity<out T extends Entity = Entity> extends EntityPose {
  readonly categoryName: CategoryName
  direction: defines.direction | nil
  /** If this entity is a settings remnant */
  isSettingsRemnant?: true

  getBaseStage(): StageNumber
  getBaseValue(): Readonly<T>

  /** @return if this entity has any changes at the given stage, or any stage if nil */
  hasStageChange(stage?: StageNumber): boolean
  getStageChange(stage: StageNumber): StageDiff<T> | nil
  _getStageChanges(): StageChanges<T>
  _applyDiffAtStage(stage: StageNumber, diff: StageDiff<T>): void

  /** @return the value at a given stage. Nil if below the first stage. The result is a new table. */
  getValueAtStage(stage: StageNumber): T | nil
  /** Gets the entity name at the given stage. If below the first stage, returns the base entity name. */
  getNameAtStage(stage: StageNumber): string
  /**
   * Iterates the values of stages in the given range. More efficient than repeated calls to getValueAtStage.
   * The same instance will be returned for each stage; its value is ephemeral.
   */
  iterateValues(start: StageNumber, end: StageNumber): LuaIterable<LuaMultiReturn<[StageNumber, Readonly<T> | nil]>>

  /**
   * Adjusts stage changes so that the value at the given stage matches the given value.
   * Trims stage changes in higher stages if they no longer have any effect.
   * If there is diff, also clears oldStage (see {@link getOldStage}).
   * @return true if the value changed.
   */
  adjustValueAtStage(stage: StageNumber, value: T): boolean

  /**
   * @param stage the stage to move to. If moving up, deletes/merges all stage changes from old stage to new stage.
   * @param recordOldStage if true, records the old stage (so the entity can be moved back). Otherwise, clears the old stage.
   * @return the previous base stage
   */
  moveToStage(stage: StageNumber, recordOldStage?: boolean): StageNumber

  /**
   * The last stage before moveToStage() was called with recordOldStage.
   * The stage memo is cleared when adjustValueAtStage() is called with changes on a stage that is not the base stage.
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
   * Stage contents will be merged with previous stage.
   */
  deleteStage(stageNumber: StageNumber): void
}

export type StageChanges<E extends Entity = Entity> = PRRecord<StageNumber, StageDiff<E>>

export interface WorldEntities {
  mainEntity?: LuaEntity
}
export type WorldEntityType = keyof WorldEntities
type AnyWorldEntity = WorldEntities[keyof WorldEntities]

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface StageProperties {}

type StageData = WorldEntities & StageProperties

@RegisterClass("AssemblyEntity")
class AssemblyEntityImpl<T extends Entity = Entity> implements AssemblyEntity<T> {
  public readonly categoryName: CategoryName
  public readonly position: Position
  public direction: defines.direction | nil

  public isSettingsRemnant: true | nil

  private baseStage: StageNumber
  private readonly baseValue: T
  private readonly stageChanges: Mutable<StageChanges<T>> = {}
  private oldStage: StageNumber | nil

  private readonly stageProperties: {
    [P in keyof StageData]?: PRecord<StageNumber, StageData[P]>
  } = {}

  constructor(baseStage: StageNumber, baseEntity: T, position: Position, direction: defines.direction | nil) {
    this.categoryName = getEntityCategory(baseEntity.name)
    this.position = position
    this.direction = direction === 0 ? nil : direction
    this.baseValue = shallowCopy(baseEntity)
    this.baseStage = baseStage
  }

  getBaseStage(): StageNumber {
    return this.baseStage
  }
  getBaseValue(): T {
    return this.baseValue
  }

  hasStageChange(stage?: StageNumber): boolean {
    if (stage) return this.stageChanges[stage] !== nil
    return next(this.stageChanges)[0] !== nil
  }
  public getStageChange(stage: StageNumber): StageDiff<T> | nil {
    return this.stageChanges[stage]
  }
  _getStageChanges(): StageChanges<T> {
    return this.stageChanges
  }
  _applyDiffAtStage(stage: StageNumber, diff: StageDiff<T>): void {
    const { baseStage, stageChanges } = this
    assert(stage >= baseStage, "stage must be >= first stage")
    if (stage === baseStage) {
      applyDiffToEntity(this.baseValue, diff)
      return
    }
    const existingDiff = stageChanges[stage]
    if (existingDiff) {
      applyDiffToDiff(existingDiff, diff)
    } else {
      stageChanges[stage] = shallowCopy(diff)
    }
  }

  getValueAtStage(stage: StageNumber): T | nil {
    // assert(stage >= 1, "stage must be >= 1")
    if (stage < this.baseStage) return nil
    const value = mutableShallowCopy(this.baseValue)
    for (const [changedStage, diff] of pairs(this.stageChanges)) {
      if (changedStage > stage) break
      applyDiffToEntity(value, diff)
    }
    return value
  }
  getNameAtStage(stage: StageNumber): string {
    let name = this.baseValue.name
    if (stage <= this.baseStage) return name
    for (const [changedStage, diff] of pairs(this.stageChanges)) {
      if (changedStage > stage) break
      if (diff.name) name = diff.name
    }
    return name
  }

  iterateValues(start: StageNumber, end: StageNumber): LuaIterable<LuaMultiReturn<[StageNumber, Readonly<T> | nil]>>
  iterateValues(start: StageNumber, end: StageNumber) {
    const { baseStage, baseValue } = this
    let value = this.getValueAtStage(start)
    function next(stageValues: StageChanges, prevStage: StageNumber | nil) {
      if (!prevStage) {
        return $multi(start, value)
      }
      const nextStage = prevStage + 1
      if (nextStage < baseStage) return $multi(nextStage, nil)
      if (nextStage > end) return $multi()
      if (nextStage === baseStage) {
        value = shallowCopy(baseValue)
      } else {
        const diff = stageValues[nextStage]
        if (diff) applyDiffToEntity(value!, diff)
      }
      return $multi(nextStage, value)
    }
    return $multi<any>(next, this.stageChanges, nil)
  }

  adjustValueAtStage(stage: StageNumber, value: T): boolean {
    const { baseStage, stageChanges } = this
    assert(stage >= baseStage, "stage must be >= first stage")
    const diff = this.setValueAndGetDiff(stage, value)
    if (!diff) return false

    // trim diffs in higher stages, remove those that are ineffectual
    for (const [stageNumber, changes] of pairs(stageChanges)) {
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
      if (isEmpty(changes)) delete stageChanges[stageNumber]
      if (isEmpty(diff)) break
    }

    this.oldStage = nil
    return true
  }

  private setValueAndGetDiff(stage: StageNumber, value: T): StageDiff<T> | nil {
    if (stage === this.baseStage) {
      const { baseValue } = this
      const diff = getEntityDiff(baseValue, value)
      if (diff) {
        applyDiffToEntity(baseValue, diff)
        return diff
      }
    } else {
      const valueAtPreviousStage = assert(this.getValueAtStage(stage - 1))
      const newStageDiff = getEntityDiff(valueAtPreviousStage, value)

      const { stageChanges } = this
      const oldStageDiff = stageChanges[stage]
      const diff = mergeDiff(valueAtPreviousStage, oldStageDiff, newStageDiff)
      if (diff) {
        stageChanges[stage] = newStageDiff
        return diff
      }
    }
  }
  private moveUp(higherStage: StageNumber): void {
    // todo: what happens if moved up, and lost data?
    const { baseValue } = this
    const { stageChanges } = this
    for (const [changeStage, changed] of pairs(stageChanges)) {
      if (changeStage > higherStage) break
      applyDiffToEntity(baseValue, changed)
      stageChanges[changeStage] = nil
    }
    this.baseStage = higherStage
  }
  moveToStage(stage: StageNumber, recordOldStage?: boolean): StageNumber {
    const { baseStage } = this
    if (stage > baseStage) {
      this.moveUp(stage)
    } else if (stage < baseStage) {
      this.baseStage = stage
    }
    this.oldStage = recordOldStage && baseStage !== stage ? baseStage : nil
    return baseStage
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
  }
  destroyWorldEntity<T extends WorldEntityType>(stage: StageNumber, type: T): void {
    const { stageProperties } = this
    const byType = stageProperties[type]
    if (!byType) return
    const entity = byType[stage]
    if (entity && entity.valid) entity.destroy()
    delete byType[stage]
    if (isEmpty(byType)) delete stageProperties[type]
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
    const byType: PRecord<StageNumber, StageProperties[T]> = stageProperties[key] || (stageProperties[key] = {})
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
    if (this.baseStage >= stageNumber) this.baseStage++
    if (this.oldStage && this.oldStage >= stageNumber) this.oldStage++

    shiftNumberKeysUp(this.stageChanges, stageNumber)
    for (const [, byType] of pairs(this.stageProperties)) {
      shiftNumberKeysUp(byType, stageNumber)
    }
  }

  deleteStage(stageNumber: StageNumber): void {
    assert(stageNumber > 1, "Can't delete first stage")
    this.mergeStageChangeWithBelow(stageNumber)

    if (this.baseStage >= stageNumber) this.baseStage--
    if (this.oldStage && this.oldStage >= stageNumber) this.oldStage--

    shiftNumberKeysDown(this.stageChanges, stageNumber)
    for (const [, byType] of pairs(this.stageProperties)) {
      shiftNumberKeysDown(byType, stageNumber)
    }
  }
  private mergeStageChangeWithBelow(stageNumber: number): void {
    const { stageChanges } = this
    const thisChange = stageChanges[stageNumber]
    if (thisChange) {
      const prevStage = stageNumber - 1
      if (this.baseStage === prevStage) {
        applyDiffToEntity(this.baseValue, thisChange)
      } else {
        const prevChange = stageChanges[prevStage]
        if (prevChange) {
          applyDiffToDiff(prevChange, thisChange)
        } else {
          stageChanges[prevStage] = thisChange
        }
      }
      delete stageChanges[stageNumber]
    }
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
const excludedTypes = newLuaSet(
  "unit",
  "car",
  "artillery-wagon",
  "cargo-wagon",
  "fluid-wagon",
  "locomotive",
  "spider-vehicle",
)

export function isWorldEntityAssemblyEntity(luaEntity: LuaEntity): boolean {
  return luaEntity.is_entity_with_owner && luaEntity.has_flag("player-creation") && !excludedTypes.has(luaEntity.type)
}

/** Does not check position */
export function isCompatibleEntity(
  a: AssemblyEntity,
  categoryName: string,
  direction: defines.direction | nil,
): boolean {
  return a.categoryName === categoryName && a.direction === direction
}

// note: see also EntityHighlighter, updateErrorHighlight
export function entityHasErrorAt(entity: AssemblyEntity, stageNumber: StageNumber): boolean {
  return stageNumber >= entity.getBaseStage() && entity.getWorldEntity(stageNumber) === nil
}

/** Used by custom input */
export function isNotableStage(entity: AssemblyEntity, stageNumber: StageNumber): boolean {
  return (
    entity.getBaseStage() === stageNumber || entity.hasStageChange(stageNumber) || entityHasErrorAt(entity, stageNumber)
  )
}
