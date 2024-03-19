/*
 * Copyright (c) 2024 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import {
  isEmpty,
  Mutable,
  mutableShallowCopy,
  PRecord,
  PRRecord,
  shallowCopy,
  shiftNumberKeysDown,
  shiftNumberKeysUp,
} from "../lib"
import { StageNumber } from "./ProjectEntity"

export interface StagedValue<T, D> {
  readonly firstValue: T
  /** May not correctly update diffs. */
  setFirstValueDirectly(value: T): void

  readonly firstStage: StageNumber
  readonly lastStage: StageNumber | nil
  /** Sets the first stage. If moving up, deletes/merges stage diffs from old stage to new stage. */
  setFirstStageUnchecked(stage: StageNumber): void
  /** Sets the last stage. If moving down, delete all diffs after the new last stage. */
  setLastStageUnchecked(stage: StageNumber | nil): void

  isInStage(stage: StageNumber): boolean
  isPastLastStage(stage: StageNumber): boolean

  readonly stageDiffs?: PRRecord<StageNumber, D>
  /** Does not validate stage diffs. */
  setStageDiffsDirectly(stageDiffs: PRRecord<StageNumber, D> | nil): void
  /** @return if this entity has any changes at the given stage, or any stage if nil */
  hasStageDiff(stage?: StageNumber): boolean
  getStageDiff(stage: StageNumber): D | nil

  /** Returns the first stage after the given stage number with a stage diff, or `nil` if none. */
  nextStageWithDiff(stage: StageNumber): StageNumber | nil
  /** Returns the first stage before the given stage number with a stage diff, or `nil` if none. */
  prevStageWithDiff(stage: StageNumber): StageNumber | nil

  /** @return the value at a given stage. Nil if below the first stage. The result is a new table. */
  getValueAtStage(stage: StageNumber): Readonly<T> | nil

  iterateValues(
    start: StageNumber,
    end: StageNumber,
  ): LuaIterable<LuaMultiReturn<[StageNumber, Readonly<T> | nil, changed: boolean]>>

  /**
   * Adjusts stage diffs so that the value at the given stage matches the given value.
   * @return true if the value changed.
   */
  adjustValueAtStage(stage: StageNumber, value: T): boolean

  /** Modifies to be consistent with an inserted stage. */
  insertStage(stageNumber: StageNumber): void

  /**
   * Modifies to be consistent with a deleted stage.
   * Stage contents will be merged with a previous stage. If stage is 1, will be merged with the next stage instead.
   */
  deleteStage(stageNumber: StageNumber): void
}

export abstract class BaseStagedValue<T, D> implements StagedValue<T, D> {
  stageDiffs?: PRecord<StageNumber, Mutable<D>>
  protected constructor(
    public firstStage: StageNumber,
    public firstValue: Mutable<T>,
  ) {}
  setFirstValueDirectly(value: T): void {
    this.firstValue = value
  }

  lastStage: StageNumber | nil

  isInStage(stage: StageNumber): boolean {
    return stage >= this.firstStage && !this.isPastLastStage(stage)
  }
  isPastLastStage(stage: StageNumber): boolean {
    return this.lastStage != nil && stage > this.lastStage
  }

  protected abstract applyDiff(this: void, value: Mutable<T>, diff: D): Mutable<T>

  setFirstStageUnchecked(stage: StageNumber): void {
    const { firstStage, lastStage } = this
    if (lastStage) assert(stage <= lastStage, "stage must be <= last stage")
    if (stage > firstStage) this.moveFirstStageUp(stage)
    this.firstStage = stage
  }
  private moveFirstStageUp(newFirstStage: StageNumber): void {
    const { stageDiffs } = this
    if (stageDiffs) {
      let { firstValue } = this
      for (const [stage, diff] of pairs(stageDiffs)) {
        if (stage > newFirstStage) break
        // applyDiffToEntity(firstValue, diff)
        firstValue = this.applyDiff(firstValue, diff)
        delete stageDiffs[stage]
      }
      if (isEmpty(stageDiffs)) delete this.stageDiffs
      this.firstValue = firstValue
    }
  }

  setLastStageUnchecked(stage: StageNumber | nil): void {
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

  setStageDiffsDirectly(stageDiffs: PRRecord<StageNumber, D> | nil): void {
    this.stageDiffs = stageDiffs
  }
  hasStageDiff(stage?: StageNumber): boolean {
    const stageDiffs = this.stageDiffs
    if (!stageDiffs) return false
    if (stage) return stageDiffs[stage] != nil
    return next(stageDiffs)[0] != nil
  }
  getStageDiff(stage: StageNumber): D | nil {
    return this.stageDiffs?.[stage]
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

    let value = mutableShallowCopy(this.firstValue)
    for (const [changedStage, diff] of pairs(stageDiffs)) {
      if (changedStage > stage) break
      value = this.applyDiff(value, diff)
    }
    return value
  }
  iterateValues(
    start: StageNumber,
    end: StageNumber,
  ): LuaIterable<LuaMultiReturn<[StageNumber, Readonly<T> | nil, changed: boolean]>>
  iterateValues(start: StageNumber, end: StageNumber): any {
    const stageDiffs = this.stageDiffs
    if (!stageDiffs) return this.iterateValuesNoDiffs(start, end)

    const { firstStage, firstValue } = this
    const lastStage = this.lastStage ?? end
    let value = this.getValueAtStage(start - 1) as T
    const applyDiff = this.applyDiff
    function iterNext(stageDiffs: PRRecord<StageNumber, D>, prevStage: StageNumber) {
      const nextStage = prevStage + 1
      if (nextStage > end) return $multi()
      if (nextStage < firstStage || nextStage > lastStage) return $multi(nextStage, nil, false)
      if (nextStage == firstStage) {
        value = shallowCopy(firstValue)
        return $multi(nextStage, value, true)
      }
      const diff = stageDiffs && stageDiffs[nextStage]
      if (diff) value = applyDiff(value, diff)
      return $multi(nextStage, value, diff != nil || nextStage == start)
    }
    return $multi<any>(iterNext, stageDiffs, start - 1)
  }

  private iterateValuesNoDiffs(start: StageNumber, end: StageNumber) {
    const { firstStage, firstValue } = this
    const lastStage = this.lastStage ?? end
    function next(_: any, prevStage: StageNumber) {
      const stage = prevStage + 1
      if (stage > end) return $multi()
      if (stage < firstStage || stage > lastStage) return $multi(stage, nil, false)
      return $multi(stage, firstValue, stage == firstStage || stage == start)
    }
    return $multi<any>(next, nil, start - 1)
  }
  abstract adjustValueAtStage(stage: StageNumber, value: T): boolean

  insertStage(stageNumber: StageNumber): void {
    if (this.firstStage >= stageNumber) this.firstStage++
    if (this.lastStage && this.lastStage >= stageNumber) this.lastStage++

    shiftNumberKeysUp(this, stageNumber)
    if (this.stageDiffs) shiftNumberKeysUp(this.stageDiffs, stageNumber)
  }

  deleteStage(stageNumber: StageNumber): void {
    const stageToMerge = stageNumber == 1 ? 2 : stageNumber
    this.mergeStageDiffWithBelow(stageToMerge)

    if (this.firstStage >= stageToMerge) this.firstStage--
    if (this.lastStage && this.lastStage >= stageNumber) this.lastStage--

    shiftNumberKeysDown(this, stageNumber)
    if (this.stageDiffs) shiftNumberKeysDown(this.stageDiffs, stageNumber)
  }
  private mergeStageDiffWithBelow(stage: StageNumber): void {
    if (stage <= this.firstStage) return
    if (!this.hasStageDiff(stage)) return
    this.adjustValueAtStage(stage - 1, this.getValueAtStage(stage)!)
  }
}
