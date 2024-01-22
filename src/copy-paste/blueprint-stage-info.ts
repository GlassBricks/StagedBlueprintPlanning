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

import { Entity } from "../entity/Entity"
import { StageDiffs, StageNumber } from "../entity/ProjectEntity"
import { Events, PRecord } from "../lib"
import { getNilPlaceholder, NilPlaceholder } from "../utils/diff-value"

export type BlueprintNilPlaceholder = {
  __nil: true
}

export function isBpNilPlaceholder(value: AnyNotNil): value is BlueprintNilPlaceholder {
  return typeof value == "object" && "__nil" in value
}

export type BlueprintStageDiff<E extends Entity = Entity> = {
  readonly [P in keyof E]?: E[P] | BlueprintNilPlaceholder
}
export type BlueprintStageDiffs<E extends Entity = Entity> = PRecord<`${number}`, BlueprintStageDiff<E>>

let nilPlaceholder: NilPlaceholder | nil
Events.onInitOrLoad(() => {
  nilPlaceholder = getNilPlaceholder()
})

const blueprintNilPlaceholder: BlueprintNilPlaceholder = { __nil: true }

export function toBpStageDiffs(diffs: StageDiffs): BlueprintStageDiffs {
  const ret: BlueprintStageDiffs = {}
  for (const [stage, diff] of pairs(diffs)) {
    const bpDiff: any = {}
    for (const [key, value] of pairs(diff)) {
      bpDiff[key] = value == nilPlaceholder ? blueprintNilPlaceholder : value
    }
    ret[`${stage}`] = bpDiff
  }
  return ret
}

export interface BpStageInfo<E extends Entity = Entity> {
  firstStage: StageNumber
  firstValue?: E
  stageDiffs?: BlueprintStageDiffs<E>
}

export interface BpStageInfoTags {
  bp100: BpStageInfo
}
