// Copyright (c) 2024 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { PRecord, RegisterClass, shiftNumberKeysDown, shiftNumberKeysUp } from "../lib"
import { getNilPlaceholder, NilPlaceholder } from "../utils/diff-value"
import { StageNumber } from "./ProjectEntity"

export interface ProjectTile {
  readonly values: PRecord<StageNumber, string | NilPlaceholder>

  getTileAtStage(stage: StageNumber): string | nil
  setTileAtStage(stage: StageNumber, value: string | nil): StageNumber | nil
  isEmpty(): boolean

  getFirstStage(): StageNumber
  getLastStage(): StageNumber | nil

  insertStage(stageNumber: StageNumber): void
  mergeStage(stageNumber: StageNumber): void
  discardStage(stageNumber: StageNumber): boolean
}

@RegisterClass("ProjectTile")
class ProjectTileImpl implements ProjectTile {
  values: PRecord<StageNumber, string | NilPlaceholder> = {}

  getTileAtStage(stage: StageNumber): string | nil {
    let result: string | NilPlaceholder | nil = nil
    for (const [s, value] of pairs(this.values)) {
      if (s > stage) break
      result = value
    }

    return result == getNilPlaceholder() ? nil : result
  }

  setTileAtStage(stage: StageNumber, value: string | nil): StageNumber | nil {
    const newValue = value == nil ? getNilPlaceholder() : value

    const prevValueRaw = this.getTileAtStage(stage - 1)
    const prevValue = prevValueRaw == nil ? getNilPlaceholder() : prevValueRaw

    if (newValue != prevValue) {
      this.values[stage] = newValue
      this.trimDuplicatesAfter(stage, newValue)
    } else {
      delete this.values[stage]
    }

    for (const [s] of pairs(this.values)) {
      if (s > stage) return s
    }
    return nil
  }

  private trimDuplicatesAfter(stage: StageNumber, value: string | NilPlaceholder): void {
    for (const [s, v] of pairs(this.values)) {
      if (s <= stage) continue
      if (v == value) {
        delete this.values[s]
      } else {
        break
      }
    }
  }

  isEmpty(): boolean {
    return next(this.values)[0] == nil
  }

  getFirstStage(): StageNumber {
    for (const [stage] of pairs(this.values)) {
      return stage
    }
    error("Empty tile has no first stage")
  }

  getLastStage(): StageNumber | nil {
    let highest: StageNumber | nil = nil
    for (const [stage] of pairs(this.values)) {
      if (highest == nil || stage > highest) {
        highest = stage
      }
    }
    if (highest != nil && this.values[highest] == getNilPlaceholder()) {
      return highest
    }
    return nil
  }

  insertStage(stageNumber: StageNumber): void {
    shiftNumberKeysUp(this.values, stageNumber)
  }

  mergeStage(stageNumber: StageNumber): void {
    if (stageNumber > 1 && this.values[stageNumber] != nil) {
      const valueAtMerge = this.getTileAtStage(stageNumber)
      this.setTileAtStage(stageNumber - 1, valueAtMerge)
    }

    shiftNumberKeysDown(this.values, stageNumber)
  }

  discardStage(stageNumber: StageNumber): boolean {
    const entry = this.values[stageNumber]
    const hasChanges = entry != nil
    if (hasChanges) {
      const prevValue = this.getTileAtStage(stageNumber - 1)
      this.setTileAtStage(stageNumber, prevValue)
    }

    shiftNumberKeysDown(this.values, stageNumber)
    return hasChanges
  }
}

export function createProjectTile(): ProjectTile {
  return new ProjectTileImpl()
}
