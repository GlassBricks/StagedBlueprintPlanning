// Copyright (c) 2024 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { isEmpty, RegisterClass } from "../lib"
import { Position } from "../lib/geometry"
import { StageNumber } from "./ProjectEntity"
import { BaseStagedValue, StagedValue } from "./StagedValue"

export interface ProjectTile extends StagedValue<string, string> {
  readonly position: Position

  // this method may be moved to StagedValue in the future
  moveDownWithValue(newFirstStage: StageNumber, newValue: string): void
}
@RegisterClass("ProjectTile")
class ProjectTileImpl extends BaseStagedValue<string, string> implements ProjectTile {
  constructor(
    firstStage: StageNumber,
    firstValue: string,
    readonly position: Position,
  ) {
    super(firstStage, firstValue)
  }

  moveDownWithValue(newFirstStage: StageNumber, newValue: string): void {
    const oldFirstStage = this.firstStage
    const oldValue = this.firstValue
    assert(newFirstStage < oldFirstStage, "newFirstStage must be < old first stage")
    this.firstStage = newFirstStage
    if (newValue == oldValue) return

    this.firstValue = newValue
    const diffs = (this.stageDiffs ??= {})
    diffs[oldFirstStage] = oldValue
  }

  adjustValueAtStage(stage: StageNumber, value: string): boolean {
    const { firstStage } = this
    assert(stage >= firstStage, "stage must be >= first stage")

    if (stage == firstStage) {
      if (value == this.firstValue) return false
      this.firstValue = value
      this.trimDiffs(stage, value)
      return true
    }
    let stageDiffs = this.stageDiffs
    const oldDiffValue = stageDiffs?.[stage]
    const valueAtPreviousStage = this.getValueAtStage(stage - 1)
    const newDiff = value != valueAtPreviousStage ? value : nil
    if (oldDiffValue == newDiff) return false

    if (newDiff) {
      stageDiffs ??= this.stageDiffs = {}
      stageDiffs[stage] = newDiff
    } else if (stageDiffs) {
      delete stageDiffs[stage]
    }
    this.trimDiffs(stage, value)

    return true
  }

  private trimDiffs(stage: StageNumber, value: string) {
    const diffs = this.stageDiffs
    if (!diffs) return
    for (const [oStage, existingValue] of pairs(diffs)) {
      if (oStage <= stage) continue
      if (existingValue == value) delete diffs[oStage]
      else break
    }
    if (isEmpty(diffs)) delete this.stageDiffs
  }

  protected override applyDiff(this: void, _value: string, diff: string): string {
    return diff
  }

  override setLastStageUnchecked(): void {
    error("TODO")
  }
}

export function createProjectTile(firstValue: string, position: Position, firstStage: StageNumber): ProjectTile {
  return new ProjectTileImpl(firstStage, firstValue, position)
}
