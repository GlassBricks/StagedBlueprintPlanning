/*
 * Copyright (c) 2023 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import expect from "tstl-expect"
import { MutableAssemblyContent, newAssemblyContent } from "../../entity/AssemblyContent"
import { createAssemblyEntity } from "../../entity/AssemblyEntity"
import { StageRangeChangeResult, trySetFirstStage, trySetLastStage } from "../../entity/stage-range-changes"

let content: MutableAssemblyContent
before_each(() => {
  content = newAssemblyContent()
})

test("trySetFirstStage", () => {
  const entity1 = createAssemblyEntity({ name: "foo" }, { x: 0, y: 0 }, nil, 1)
  entity1.setLastStageUnchecked(2)
  const entity2 = createAssemblyEntity({ name: "foo" }, { x: 0, y: 0 }, nil, 4)
  entity2.setLastStageUnchecked(5)

  content.add(entity1)
  content.add(entity2)

  expect(trySetFirstStage(content, entity2, 2)).toBe(StageRangeChangeResult.IntersectsAnotherEntity)
  expect(entity2.firstStage).toBe(4)

  expect(trySetFirstStage(content, entity2, 4)).toBe(StageRangeChangeResult.Ok)
  expect(entity2.firstStage).toBe(4)

  expect(trySetFirstStage(content, entity2, 6)).toBe(StageRangeChangeResult.ViolatesStageRange)
  expect(entity2.firstStage).toBe(4)

  expect(trySetFirstStage(content, entity2, 3)).toBe(StageRangeChangeResult.Ok)
  expect(entity2.firstStage).toBe(3)
})

test("trySetLastStage", () => {
  const entity1 = createAssemblyEntity({ name: "foo" }, { x: 0, y: 0 }, nil, 2)
  entity1.setLastStageUnchecked(2)
  const entity2 = createAssemblyEntity({ name: "foo" }, { x: 0, y: 0 }, nil, 4)
  entity2.setLastStageUnchecked(5)

  content.add(entity1)
  content.add(entity2)

  expect(trySetLastStage(content, entity1, 1)).toBe(StageRangeChangeResult.ViolatesStageRange)
  expect(entity1.lastStage).toBe(2)

  expect(trySetLastStage(content, entity1, 2)).toBe(StageRangeChangeResult.Ok)
  expect(entity1.lastStage).toBe(2)

  expect(trySetLastStage(content, entity1, 4)).toBe(StageRangeChangeResult.IntersectsAnotherEntity)
  expect(entity1.lastStage).toBe(2)

  expect(trySetLastStage(content, entity1, nil)).toBe(StageRangeChangeResult.IntersectsAnotherEntity)
  expect(entity1.lastStage).toBe(2)

  expect(trySetLastStage(content, entity1, 3)).toBe(StageRangeChangeResult.Ok)
  expect(entity1.lastStage).toBe(3)
})
