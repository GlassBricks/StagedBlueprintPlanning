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

import { isEmpty, RegisterClass } from "../lib"
import { Position } from "../lib/geometry"
import { StageNumber } from "./ProjectEntity"
import { BaseStagedValue, StagedValue } from "./StagedValue"

export interface ProjectTile extends StagedValue<string, string> {
  readonly position: Position
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
}

export function createProjectTile(firstStage: StageNumber, firstValue: string, position: Position): ProjectTile {
  return new ProjectTileImpl(firstStage, firstValue, position)
}

export function isWorldTileProjectTile(tile: string): boolean {
  return game.tile_prototypes[tile]?.items_to_place_this != nil
}
