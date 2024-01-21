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
import { StageDiff } from "../entity/stage-diff"
import { Events } from "../lib"
import { getNilPlaceholder, NilPlaceholder } from "../utils/diff-value"

export type BlueprintNilPlaceholder = {
  __nil: true
}

export function isNilPlaceholder(value: AnyNotNil): value is BlueprintNilPlaceholder {
  return typeof value == "object" && "__nil" in value
}

export type BlueprintStageDiff<E extends Entity = Entity> = {
  readonly [P in keyof E]?: E[P] | BlueprintNilPlaceholder
}

let nilPlaceholder: NilPlaceholder | nil
Events.onInitOrLoad(() => {
  nilPlaceholder = getNilPlaceholder()
})

const blueprintNilPlaceholder: BlueprintNilPlaceholder = { __nil: true }

export function toBlueprintStageDiff<E extends Entity>(diff: StageDiff<E>): BlueprintStageDiff<E> {
  const ret: any = {}
  for (const [key, value] of pairs(diff)) {
    ret[key] = value == nilPlaceholder ? blueprintNilPlaceholder : value
  }
  return ret
}

export function fromBlueprintStageDiff<E extends Entity>(diff: BlueprintStageDiff<E>): StageDiff<E> {
  const ret: any = {}
  for (const [key, value] of pairs(diff)) {
    ret[key] = isNilPlaceholder(value) ? nilPlaceholder : value
  }
  return ret
}
