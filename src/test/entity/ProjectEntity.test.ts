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

import { LuaEntity } from "factorio:runtime"
import expect from "tstl-expect"
import { Prototypes } from "../../constants"
import { Entity, RollingStockEntity } from "../../entity/Entity"
import { createProjectEntityNoCopy, ExtraEntityType, ProjectEntity } from "../../entity/ProjectEntity"
import { getRegisteredProjectEntity } from "../../entity/registration"
import { getEntityDiff } from "../../entity/stage-diff"
import { deepCompare, deepCopy, shallowCopy } from "../../lib"
import { Pos } from "../../lib/geometry"
import { getNilPlaceholder } from "../../utils/diff-value"
import { setupTestSurfaces } from "../project/Project-mock"
import { simpleMock } from "../simple-mock"
import { createRollingStock } from "./createRollingStock"

interface InserterEntity extends Entity {
  name: "filter-inserter" | "stack-filter-inserter"

  override_stack_size?: number
  filter_mode?: "whitelist" | "blacklist"
}
let entity: InserterEntity
let projectEntity: ProjectEntity<InserterEntity>
before_each(() => {
  entity = {
    name: "filter-inserter",
    override_stack_size: 1,
  }
  projectEntity = createProjectEntityNoCopy(entity, Pos(0, 0), nil, 2)
  projectEntity._applyDiffAtStage(3, { override_stack_size: 2, filter_mode: "blacklist" })
  projectEntity._applyDiffAtStage(5, { override_stack_size: 3 })
  projectEntity._applyDiffAtStage(7, { filter_mode: getNilPlaceholder() })
})

test("getters", () => {
  expect(projectEntity.firstStage).to.equal(2)
  expect(projectEntity.firstValue).to.equal(entity)
  expect(projectEntity.direction).to.equal(0) // nil <=> 0
})

test("lastStage default nil", () => {
  expect(projectEntity.lastStage).toBeNil()
})

test("isInStage", () => {
  projectEntity.setLastStageUnchecked(4)
  expect(projectEntity.isInStage(1)).to.be(false)
  expect(projectEntity.isInStage(2)).to.be(true)
  expect(projectEntity.isInStage(3)).to.be(true)
  expect(projectEntity.isInStage(4)).to.be(true)
  expect(projectEntity.isInStage(5)).to.be(false)
  expect(projectEntity.isInStage(6)).to.be(false)
})

test("isPastLastStage", () => {
  projectEntity.setLastStageUnchecked(4)
  expect(projectEntity.isPastLastStage(3)).to.be(false)
  expect(projectEntity.isPastLastStage(4)).to.be(false)
  expect(projectEntity.isPastLastStage(5)).to.be(true)
  expect(projectEntity.isPastLastStage(6)).to.be(true)

  projectEntity.setLastStageUnchecked(nil)
  expect(projectEntity.isPastLastStage(4)).to.be(false)
  expect(projectEntity.isPastLastStage(5)).to.be(false)
  expect(projectEntity.isPastLastStage(6)).to.be(false)
})

test("isRollingStock", () => {
  expect(projectEntity.isRollingStock()).to.be(false)
  const projectEntity2 = createProjectEntityNoCopy({ name: "locomotive" }, Pos(0, 0), nil, 2)
  expect(projectEntity2.isRollingStock()).to.be(true)
})

test("isUndergroundBelt", () => {
  expect(projectEntity.isUndergroundBelt()).to.be(false)
  const projectEntity2 = createProjectEntityNoCopy({ name: "underground-belt" }, Pos(0, 0), nil, 2)
  expect(projectEntity2.isUndergroundBelt()).to.be(true)
})

test("hasStageDiff", () => {
  const projectEntity = createProjectEntityNoCopy(entity, Pos(0, 0), nil, 2)
  expect(projectEntity.hasStageDiff()).to.be(false)
  projectEntity._applyDiffAtStage(3, { override_stack_size: 3 })
  expect(projectEntity.hasStageDiff()).to.be(true)
  expect(projectEntity.hasStageDiff(3)).to.be(true)
  expect(projectEntity.hasStageDiff(2)).to.be(false)
})

test("getStageDiff", () => {
  const projectEntity = createProjectEntityNoCopy(entity, Pos(0, 0), nil, 2)
  expect(projectEntity.getStageDiff(3)).to.be.nil()
  projectEntity._applyDiffAtStage(3, { override_stack_size: 3 })
  expect(projectEntity.getStageDiff(3)).to.equal({ override_stack_size: 3 })
})
test("getNextStageDiffForProp", () => {
  const projectEntity = createProjectEntityNoCopy(entity, Pos(0, 0), nil, 2)
  expect(projectEntity.getFirstStageDiffForProp("override_stack_size")).to.equal([projectEntity.firstStage, 1])
  projectEntity._applyDiffAtStage(4, { override_stack_size: 3 })
  expect(projectEntity.getFirstStageDiffForProp("override_stack_size")).to.equal([4, 3])
})

test("nextStageWithDiff", () => {
  const projectEntity = createProjectEntityNoCopy(entity, Pos(0, 0), nil, 2)
  projectEntity._applyDiffAtStage(3, { override_stack_size: 3 })
  projectEntity._applyDiffAtStage(5, { override_stack_size: 5 })
  expect(projectEntity.nextStageWithDiff(2)).to.be(3)
  expect(projectEntity.nextStageWithDiff(3)).to.be(5)
  expect(projectEntity.nextStageWithDiff(4)).to.be(5)
  expect(projectEntity.nextStageWithDiff(5)).to.be(nil)
})

test("prevStageWithDiff", () => {
  const projectEntity = createProjectEntityNoCopy(entity, Pos(0, 0), nil, 2)
  projectEntity._applyDiffAtStage(3, { override_stack_size: 3 })
  projectEntity._applyDiffAtStage(5, { override_stack_size: 5 })
  expect(projectEntity.prevStageWithDiff(6)).to.be(5)
  expect(projectEntity.prevStageWithDiff(5)).to.be(3)
  expect(projectEntity.prevStageWithDiff(4)).to.be(3)
  expect(projectEntity.prevStageWithDiff(3)).to.be(nil)
  expect(projectEntity.prevStageWithDiff(2)).to.be(nil)
})

describe("getValueAtStage", () => {
  test("nil if lower than stage", () => {
    expect(projectEntity.getValueAtStage(1)).to.be.nil()
  })

  test("getValueAtStage returns same entity if no stageDiffs", () => {
    expect(projectEntity.getValueAtStage(2)).to.equal(entity)
  })

  test("applies changes from one stage", () => {
    const result = projectEntity.getValueAtStage(3)
    expect(result).to.equal({ ...entity, override_stack_size: 2, filter_mode: "blacklist" })
  })

  test("applies changes from multiple stages", () => {
    const result = projectEntity.getValueAtStage(5)
    expect(result).to.equal({ ...entity, override_stack_size: 3, filter_mode: "blacklist" })
  })

  test("replaces nilPlaceholder with nil", () => {
    const result = projectEntity.getValueAtStage(7)
    const expected = { ...entity, override_stack_size: 3 }
    delete expected.filter_mode

    expect(result).to.equal(expected)
  })

  test("getPropAtStage", () => {
    expect(projectEntity.getPropAtStage(2, "override_stack_size")).to.equal([1, 2])
    expect(projectEntity.getPropAtStage(3, "override_stack_size")).to.equal([2, 3])
    expect(projectEntity.getPropAtStage(4, "override_stack_size")).to.equal([2, 3])
    expect(projectEntity.getPropAtStage(5, "override_stack_size")).to.equal([3, 5])
    expect(projectEntity.getPropAtStage(6, "override_stack_size")).to.equal([3, 5])

    expect(projectEntity.getPropAtStage(1, "override_stack_size")).to.equal([1, 2])

    expect(projectEntity.getPropAtStage(2, "filter_mode")).to.equal([nil, 2])
    expect(projectEntity.getPropAtStage(3, "filter_mode")).to.equal(["blacklist", 3])
    expect(projectEntity.getPropAtStage(4, "filter_mode")).to.equal(["blacklist", 3])
    expect(projectEntity.getPropAtStage(5, "filter_mode")).to.equal(["blacklist", 3])
    expect(projectEntity.getPropAtStage(6, "filter_mode")).to.equal(["blacklist", 3])
    expect(projectEntity.getPropAtStage(7, "filter_mode")).to.equal([nil, 7])
    expect(projectEntity.getPropAtStage(8, "filter_mode")).to.equal([nil, 7])

    expect(projectEntity.getPropAtStage(1, "filter_mode")).to.equal([nil, 2])
  })

  test("getNameAtStage ", () => {
    projectEntity._applyDiffAtStage(4, { name: "stack-filter-inserter" })
    expect(projectEntity.getNameAtStage(1)).to.equal("filter-inserter")
    expect(projectEntity.getNameAtStage(2)).to.equal("filter-inserter")
    expect(projectEntity.getNameAtStage(3)).to.equal("filter-inserter")
    expect(projectEntity.getNameAtStage(4)).to.equal("stack-filter-inserter")
    expect(projectEntity.getNameAtStage(5)).to.equal("stack-filter-inserter")
  })
})

describe.each([
  [1, 8],
  [2, 8],
  [3, 8],
  [4, 8],
  [5, 8],
  [6, 8],
  [1, 1],
  [2, 2],
  [3, 3],
  [4, 4],
  [5, 5],
  [6, 6],
  [7, 7],
  [8, 8],
])("iterateValues from %s to %s", (start, end) => {
  test.each([true, false])("with diff %s", (withDiff) => {
    const expected = []
    if (!withDiff) {
      projectEntity.setFirstStageUnchecked(10)
      projectEntity.setFirstStageUnchecked(3)
      // setting up/down should clear diffs
      expect(projectEntity.hasStageDiff()).toBe(false)
    }
    projectEntity.setFirstStageUnchecked(3)
    for (let stage = start; stage <= end; stage++) {
      expected[stage] = projectEntity.getValueAtStage(stage) ?? "nil"
    }
    const result = []
    let lastValue: unknown = nil
    for (const [stage, entity, changed] of projectEntity.iterateValues(start, end)) {
      result[stage] = entity == nil ? "nil" : shallowCopy(entity)
      expect(changed).toBe(!deepCompare(entity, lastValue))
      lastValue = deepCopy(entity)
    }
    expect(result).to.equal(expected)
  })
})
test("iterateValues returns nothing if end > start", () => {
  const result = []
  for (const [stage, entity] of projectEntity.iterateValues(4, 2)) {
    result[stage] = entity
  }
  expect(result).to.equal([])
})

describe("adjustValueAtStage", () => {
  test("can set first value", () => {
    const newEntity = { ...entity, override_stack_size: 3 }
    projectEntity.adjustValueAtStage(2, newEntity)
    expect(projectEntity.firstValue).to.equal(newEntity)
  })

  test("removes no longer effectual diffs after set at first value", () => {
    const projectEntity = createProjectEntityNoCopy(entity, Pos(0, 0), nil, 1)
    projectEntity._applyDiffAtStage(3, { override_stack_size: 3 })
    projectEntity.adjustValueAtStage(1, { ...entity, override_stack_size: 3 })
    expect(projectEntity.firstValue).to.equal({ ...entity, override_stack_size: 3 })
    expect(projectEntity.hasStageDiff()).to.be(false)
  })

  test("creates diff if set at higher stage", () => {
    const projectEntity = createProjectEntityNoCopy(entity, Pos(0, 0), nil, 1)
    projectEntity.adjustValueAtStage(2, { ...entity, override_stack_size: 3 })
    expect(projectEntity.firstValue).to.equal(entity)
    expect(projectEntity.hasStageDiff()).to.be(true)
    expect(projectEntity.getValueAtStage(2)).to.equal({ ...entity, override_stack_size: 3 })
  })

  test("removes diff entirely if matches lower stage", () => {
    expect(projectEntity.hasStageDiff(3)).to.be(true)
    projectEntity.adjustValueAtStage(3, projectEntity.firstValue)
    expect(projectEntity.hasStageDiff(3)).to.be(false)
  })

  test("complex case", () => {
    const firstValue = { name: "test", a: 1, b: 1, c: 1 }
    const value2 = { ...firstValue, b: 2, c: 2 }
    const newValue2 = { ...firstValue, a: 2, b: 1, c: 5 }
    const value3 = { ...firstValue, a: 2, b: 2, c: 5 }
    const projectEntity = createProjectEntityNoCopy(firstValue, Pos(0, 0), nil, 1)
    projectEntity.adjustValueAtStage(2, value2)
    expect(projectEntity.firstValue).to.equal(firstValue)
    expect(projectEntity.getValueAtStage(2)).to.equal(value2)
    projectEntity.adjustValueAtStage(3, value3)
    expect(projectEntity.firstValue).to.equal(firstValue)
    expect(projectEntity.getValueAtStage(2)).to.equal(value2)
    expect(projectEntity.getValueAtStage(3)).to.equal(value3)
    projectEntity.adjustValueAtStage(2, newValue2)
    expect(projectEntity.firstValue).to.equal(firstValue)
    expect(projectEntity.getValueAtStage(2)).to.equal(newValue2)
    const newValue3 = { ...value3, b: 1 } // due to change in newValue2
    expect(projectEntity.getValueAtStage(3)).to.equal(newValue3)
    expect(projectEntity.getStageDiff(3)).to.equal(getEntityDiff(newValue2, newValue3))
  })
})

describe("setPropAtStage", () => {
  test("can set first value", () => {
    expect(projectEntity.setPropAtStage(2, "override_stack_size", 3)).to.be(true)
    expect(projectEntity.firstValue).to.equal({ ...entity, override_stack_size: 3 })
  })

  test("returns false if no change", () => {
    expect(projectEntity.setPropAtStage(2, "override_stack_size", 1)).to.be(false)
  })

  test("removes no longer effectual diffs after set at first value", () => {
    const projectEntity = createProjectEntityNoCopy(entity, Pos(0, 0), nil, 1)
    projectEntity._applyDiffAtStage(3, { override_stack_size: 3 })
    projectEntity._applyDiffAtStage(4, { override_stack_size: 4 })
    expect(projectEntity.setPropAtStage(1, "override_stack_size", 3)).to.be(true)
    expect(projectEntity.firstValue).to.equal({ ...entity, override_stack_size: 3 })
    expect(projectEntity.hasStageDiff(3)).to.be(false)
  })

  test("creates diff if set at higher stage", () => {
    const projectEntity = createProjectEntityNoCopy(entity, Pos(0, 0), nil, 1)
    expect(projectEntity.setPropAtStage(3, "override_stack_size", 3)).to.be(true)
    expect(projectEntity.firstValue).to.equal(entity)
    expect(projectEntity.hasStageDiff(3)).to.be(true)
    expect(projectEntity.getValueAtStage(3)).to.equal({ ...entity, override_stack_size: 3 })
  })
})

describe("moving stage diff props", () => {
  test("resetValue removes stage diff", () => {
    const projectEntity = createProjectEntityNoCopy(entity, Pos(0, 0), nil, 1)
    projectEntity._applyDiffAtStage(3, { override_stack_size: 3 })
    expect(projectEntity.resetValue(3)).to.be(true)
    expect(projectEntity.getValueAtStage(3)).to.equal(entity)
    expect(projectEntity.hasStageDiff()).to.be(false)
  })
  test("returns false if no diff", () => {
    const projectEntity = createProjectEntityNoCopy(entity, Pos(0, 0), nil, 1)
    projectEntity._applyDiffAtStage(4, { override_stack_size: 3 })
    expect(projectEntity.resetValue(3)).to.be(false)
  })

  test("moveDiffDown can apply to first value", () => {
    const projectEntity = createProjectEntityNoCopy(entity, Pos(0, 0), nil, 1)
    projectEntity._applyDiffAtStage(3, { override_stack_size: 3 })
    expect(projectEntity.moveValueDown(3)).to.be(1)
    expect(projectEntity.firstValue).to.equal({ ...entity, override_stack_size: 3 })
    expect(projectEntity.hasStageDiff()).to.be(false)
  })
  test("moveDiffDown can apply to next lower stage with diff", () => {
    const projectEntity = createProjectEntityNoCopy(entity, Pos(0, 0), nil, 1)
    projectEntity._applyDiffAtStage(3, { override_stack_size: 3 })
    projectEntity._applyDiffAtStage(4, { override_stack_size: 4 })
    expect(projectEntity.moveValueDown(4)).to.be(3)
    expect(projectEntity.getValueAtStage(3)).to.equal({ ...entity, override_stack_size: 4 })
    expect(projectEntity.hasStageDiff(4)).to.be(false)
  })

  test("moveDiffDown returns nil if no diff", () => {
    const projectEntity = createProjectEntityNoCopy(entity, Pos(0, 0), nil, 1)
    projectEntity._applyDiffAtStage(4, { override_stack_size: 3 })
    expect(projectEntity.moveValueDown(3)).to.be.nil()
  })

  test("resetProp removes prop from stage diff", () => {
    const projectEntity = createProjectEntityNoCopy(entity, Pos(0, 0), nil, 2)
    // is override_stack_size at stage 2
    projectEntity._applyDiffAtStage(3, { override_stack_size: 3 })
    projectEntity.resetProp(3, "override_stack_size")
    expect(projectEntity.getValueAtStage(3)).to.equal(entity)
    expect(projectEntity.hasStageDiff()).to.be(false)
  })

  test("resetProp returns false if no diff", () => {
    const projectEntity = createProjectEntityNoCopy(entity, Pos(0, 0), nil, 1)
    projectEntity._applyDiffAtStage(3, { filter_mode: "whitelist" })
    expect(projectEntity.resetProp(3, "override_stack_size")).to.be(false)
    expect(projectEntity.getValueAtStage(3)).to.equal({ ...entity, filter_mode: "whitelist" })
  })

  test("resetProp can get from next lower stage with diff", () => {
    const projectEntity = createProjectEntityNoCopy(entity, Pos(0, 0), nil, 2)
    projectEntity._applyDiffAtStage(3, { override_stack_size: 3 })
    projectEntity._applyDiffAtStage(4, { override_stack_size: 4 })
    projectEntity.resetProp(4, "override_stack_size")
    expect(projectEntity.getValueAtStage(4)).to.equal({ ...entity, override_stack_size: 3 })
    expect(projectEntity.hasStageDiff(3)).to.be(true)
    expect(projectEntity.hasStageDiff(4)).to.be(false)
  })

  test("movePropDown can apply a diff to first stage", () => {
    const projectEntity = createProjectEntityNoCopy(entity, Pos(0, 0), nil, 2)
    projectEntity._applyDiffAtStage(3, { override_stack_size: 3 })
    expect(projectEntity.movePropDown(3, "override_stack_size")).to.be(2)
    expect(projectEntity.getValueAtStage(2)).to.equal({ ...entity, override_stack_size: 3 })
    expect(projectEntity.hasStageDiff()).to.be(false)
  })

  test("movePropDown can apply a diff to next lower stage with diff", () => {
    const projectEntity = createProjectEntityNoCopy(entity, Pos(0, 0), nil, 2)
    projectEntity._applyDiffAtStage(3, { override_stack_size: 3 })
    projectEntity._applyDiffAtStage(4, { override_stack_size: 4 })
    expect(projectEntity.movePropDown(4, "override_stack_size")).to.be(3)
    expect(projectEntity.getValueAtStage(3)).to.equal({ ...entity, override_stack_size: 4 })
    expect(projectEntity.hasStageDiff(3)).to.be(true)
    expect(projectEntity.hasStageDiff(4)).to.be(false)
  })
})

describe("trySetFirstStage", () => {
  test("move down", () => {
    projectEntity.setFirstStageUnchecked(1)
    expect(projectEntity.firstValue).to.equal(entity)
    expect(projectEntity.firstStage).to.be(1)
  })

  test("moving up; also merges stage diffs", () => {
    const valueAt5 = projectEntity.getValueAtStage(5)
    projectEntity.setFirstStageUnchecked(5)
    expect(projectEntity.firstValue).to.equal(valueAt5)
    const diffs = projectEntity.getStageDiffs()!
    expect(next(diffs)[0]).to.be(7)
  })

  test("cannot move past last stage", () => {
    projectEntity.setLastStageUnchecked(4)
    expect(() => projectEntity.setFirstStageUnchecked(4)).not.toError()
    expect(() => projectEntity.setFirstStageUnchecked(5)).to.error()
  })
})

describe("trySetLastStage", () => {
  test("set", () => {
    projectEntity.setLastStageUnchecked(5)
    expect(projectEntity.lastStage).to.be(5)
  })
  test("can set back to nil", () => {
    projectEntity.setLastStageUnchecked(5)
    projectEntity.setLastStageUnchecked(nil)
    expect(projectEntity.lastStage).to.be(nil)
  })
  test("cannot move below first stage", () => {
    expect(() => projectEntity.setLastStageUnchecked(0)).to.error()
  })
  test("moving down deletes later stage diffs", () => {
    projectEntity.setLastStageUnchecked(5)
    expect(projectEntity.lastStage).to.be(5)
    const diffs = projectEntity.getStageDiffs()!
    expect(diffs).not.toHaveKey(7)
    expect(next(diffs)[0]).to.be(3)
  })
})

describe("Get/set world entities", () => {
  let entity: LuaEntity
  let previewEntity: LuaEntity
  const surfaces = setupTestSurfaces(1)
  let projectEntity: ProjectEntity
  before_each(() => {
    const pos = Pos(0.5, 0.5)
    entity = surfaces[0].create_entity({ name: "iron-chest", position: pos })!
    previewEntity = surfaces[0].create_entity({ name: Prototypes.PreviewEntityPrefix + "iron-chest", position: pos })!
    projectEntity = createProjectEntityNoCopy({ name: entity.name }, pos, nil, 1)
  })

  test("get after replace returns the correct entity", () => {
    expect(projectEntity.getWorldEntity(1)).to.be.nil()
    expect(projectEntity.getWorldEntity(2)).to.be.nil()
    projectEntity.replaceWorldEntity(1, entity)
    expect(projectEntity.getWorldEntity(1)).to.equal(entity)
    expect(projectEntity.getWorldEntity(2)).to.be.nil()
    projectEntity.replaceWorldEntity(2, entity)
    expect(projectEntity.getWorldEntity(1)).to.equal(entity)
    expect(projectEntity.getWorldEntity(2)).to.equal(entity)
  })

  test("getWorldEntity returns nil if is a preview entity", () => {
    projectEntity.replaceWorldOrPreviewEntity(1, previewEntity)
    expect(projectEntity.getWorldEntity(1)).to.be.nil()
    expect(projectEntity.getWorldOrPreviewEntity(1)).to.be(previewEntity)
  })

  test("destroyWorldOrPreviewEntity", () => {
    projectEntity.replaceWorldEntity(1, entity)
    projectEntity.destroyWorldOrPreviewEntity(1)
    expect(entity.valid).to.be(false)
    expect(projectEntity.getWorldEntity(1)).to.be.nil()
  })

  test("replace with nil destroys the entity", () => {
    projectEntity.replaceWorldEntity(1, entity)
    projectEntity.replaceWorldEntity(1, nil)
    expect(entity.valid).to.be(false)
    expect(projectEntity.getWorldEntity(1)).to.be.nil()
  })

  test("replace world entity deletes old entity", () => {
    projectEntity.replaceWorldEntity(1, entity)
    const newEntity = surfaces[0].create_entity({ name: "iron-chest", position: Pos(1.5, 1.5) })!
    projectEntity.replaceWorldEntity(1, newEntity)
    expect(entity.valid).to.be(false)
    expect(projectEntity.getWorldEntity(1)).to.equal(newEntity)
  })

  test("replace world entity does not delete if same entity", () => {
    projectEntity.replaceWorldEntity(1, entity)
    projectEntity.replaceWorldEntity(1, entity)
    expect(entity.valid).to.be(true)
    expect(projectEntity.getWorldEntity(1)).to.equal(entity)
  })

  test("get world entity returns nil if entity becomes invalid", () => {
    projectEntity.replaceWorldEntity(1, entity)
    entity.destroy()
    expect(projectEntity.getWorldEntity(1)).to.be.nil()
  })

  test("destroyAllWorldOrPreviewEntities", () => {
    projectEntity.replaceWorldOrPreviewEntity(1, entity)
    projectEntity.replaceWorldOrPreviewEntity(2, previewEntity)
    projectEntity.destroyAllWorldOrPreviewEntities()
    expect(entity.valid).to.be(false)
    expect(previewEntity.valid).to.be(false)
    expect(projectEntity.getWorldEntity(1)).to.be.nil()
    expect(projectEntity.getWorldEntity(2)).to.be.nil()
  })

  test("hasWorldEntityInRange", () => {
    expect(projectEntity.hasWorldEntityInRange(1, 2)).to.be(false)
    projectEntity.replaceWorldEntity(2, entity)
    projectEntity.replaceWorldEntity(5, entity)
    expect(projectEntity.hasWorldEntityInRange(1, 1)).to.be(false)
    expect(projectEntity.hasWorldEntityInRange(1, 3)).to.be(true)
    expect(projectEntity.hasWorldEntityInRange(3, 4)).to.be(false)
    expect(projectEntity.hasWorldEntityInRange(3, 5)).to.be(true)
  })
})

declare module "../../entity/ProjectEntity" {
  interface ExtraEntities {
    _type?: LuaEntity
  }
}
describe("get/set extra entities", () => {
  const type: ExtraEntityType = "_type"
  let entity: LuaEntity
  let projectEntity: ProjectEntity
  before_each(() => {
    entity = simpleMock<LuaEntity>({ name: "test", position: Pos(0, 0) })
    projectEntity = createProjectEntityNoCopy({ name: entity.name }, Pos(0, 0), nil, 1)
  })

  test("get after replace returns the correct entity", () => {
    expect(projectEntity.getExtraEntity(type, 1)).to.be.nil()
    expect(projectEntity.getExtraEntity(type, 2)).to.be.nil()
    projectEntity.replaceExtraEntity(type, 1, entity)
    expect(projectEntity.getExtraEntity(type, 1)).to.equal(entity)
    expect(projectEntity.getExtraEntity(type, 2)).to.be.nil()
    projectEntity.replaceExtraEntity(type, 2, entity)
    expect(projectEntity.getExtraEntity(type, 1)).to.equal(entity)
    expect(projectEntity.getExtraEntity(type, 2)).to.equal(entity)
  })

  test("destroyExtraEntity", () => {
    projectEntity.replaceExtraEntity(type, 1, entity)
    projectEntity.destroyExtraEntity(type, 1)
    expect(entity.valid).to.be(false)
    expect(projectEntity.getExtraEntity(type, 1)).to.be.nil()
  })

  test("replace with nil destroys the entity", () => {
    projectEntity.replaceExtraEntity(type, 1, entity)
    projectEntity.replaceExtraEntity(type, 1, nil)
    expect(entity.valid).to.be(false)
    expect(projectEntity.getExtraEntity(type, 1)).to.be.nil()
  })

  test("replace extra entity deletes old entity", () => {
    projectEntity.replaceExtraEntity(type, 1, entity)
    const newEntity = simpleMock<LuaEntity>({ name: "test", position: Pos(0, 0) })
    projectEntity.replaceExtraEntity(type, 1, newEntity)
    expect(entity.valid).to.be(false)
    expect(projectEntity.getExtraEntity(type, 1)).to.equal(newEntity)
  })

  test("replace extra entity does not delete if same entity", () => {
    projectEntity.replaceExtraEntity(type, 1, entity)
    projectEntity.replaceExtraEntity(type, 1, entity)
    expect(entity.valid).to.be(true)
    expect(projectEntity.getExtraEntity(type, 1)).to.equal(entity)
  })

  test("get extra entity returns nil if entity becomes invalid", () => {
    projectEntity.replaceExtraEntity(type, 1, entity)
    entity.destroy()
    expect(projectEntity.getExtraEntity(type, 1)).to.be.nil()
  })

  test("destroyAllExtraEntities", () => {
    projectEntity.replaceExtraEntity(type, 1, entity)
    projectEntity.destroyAllExtraEntities(type)
    expect(entity.valid).to.be(false)
    expect(projectEntity.getExtraEntity(type, 1)).to.be.nil()
  })
})

describe("rolling stock", () => {
  test("rolling stock only appears in its first stage", () => {
    const projectEntity = createProjectEntityNoCopy({ name: "cargo-wagon" }, Pos(0, 0), nil, 2)
    expect(projectEntity.getValueAtStage(1)).to.be.nil()
    expect(projectEntity.getValueAtStage(2)).to.equal(projectEntity.firstValue)
    expect(projectEntity.getValueAtStage(3)).to.be.nil()

    // expect(projectEntity.inFirstStageOnly()).to.be(true)
    expect(projectEntity.lastStage).to.equal(2)
  })
  test("cannot apply stage diffs to rolling stock beyond first stage", () => {
    const projectEntity = createProjectEntityNoCopy({ name: "cargo-wagon" } as RollingStockEntity, Pos(0, 0), nil, 1)
    const adjusted = projectEntity.adjustValueAtStage(1, { name: "cargo-wagon", items: { foo: 1 } })
    expect(adjusted).to.be(true)
    const adjusted2 = projectEntity.adjustValueAtStage(2, { name: "cargo-wagon", items: { foo: 2 } })
    expect(adjusted2).to.be(false)
    expect(projectEntity.getValueAtStage(1)).to.equal(projectEntity.firstValue)
  })
  test("apply stage diff ignores orientation changes", () => {
    const projectEntity = createProjectEntityNoCopy({ name: "cargo-wagon", orientation: 0.25 }, Pos(0, 0), nil, 1)
    const adjusted = projectEntity.adjustValueAtStage(1, { ...projectEntity.firstValue, orientation: 0.5 })
    expect(adjusted).to.be(false)
    expect(projectEntity.firstValue.orientation).to.be(0.25)
  })
  test("cannot apply upgrade to rolling stock", () => {
    const projectEntity = createProjectEntityNoCopy({ name: "cargo-wagon" }, Pos(0, 0), nil, 1)
    const adjusted = projectEntity.applyUpgradeAtStage(1, "cargo-wagon-2")
    expect(adjusted).to.be(false)
    expect(projectEntity.getNameAtStage(1)).to.be("cargo-wagon")
  })
  test("setting a rolling stock world entity will register it in entity-registration", () => {
    const rollingStock = createRollingStock()

    projectEntity.replaceWorldEntity(1, rollingStock)
    const found = getRegisteredProjectEntity(rollingStock)
    expect(found).to.equal(projectEntity)
  })
})

declare module "../../entity/ProjectEntity" {
  // noinspection JSUnusedGlobalSymbols
  export interface StageProperties {
    foo?: string
  }
}
describe("get/set properties", () => {
  test("get property when not set is nil", () => {
    expect(projectEntity.getProperty("foo", 2)).to.be.nil()
  })
  test("get and set property", () => {
    projectEntity.setProperty("foo", 2, "bar")
    expect(projectEntity.getProperty("foo", 2)).to.be("bar")
  })
  test("propertyIsSetAnywhere", () => {
    expect(projectEntity.propertySetInAnyStage("foo")).to.be(false)
    projectEntity.setProperty("foo", 2, "bar")
    expect(projectEntity.propertySetInAnyStage("foo")).to.be(true)
    projectEntity.setProperty("foo", 3, "bar")
    projectEntity.setProperty("foo", 2, nil)
    expect(projectEntity.propertySetInAnyStage("foo")).to.be(true)
    projectEntity.setProperty("foo", 3, nil)
    expect(projectEntity.propertySetInAnyStage("foo")).to.be(false)
  })
  test("clear property", () => {
    projectEntity.setProperty("foo", 2, "bar")
    projectEntity.setProperty("foo", 3, "bar")
    projectEntity.clearPropertyInAllStages("foo")
    expect(projectEntity.getProperty("foo", 2)).to.be.nil()
    expect(projectEntity.getProperty("foo", 3)).to.be.nil()
  })
})

describe("insert/deleting stages", () => {
  test("insert stage after base", () => {
    const luaEntity = simpleMock<LuaEntity>({ name: "test", type: "test" })
    const entity = createProjectEntityNoCopy({ name: luaEntity.name, override_stack_size: 1 }, Pos(0, 0), nil, 1)
    entity.replaceWorldEntity(2, luaEntity)
    entity.replaceWorldEntity(3, luaEntity)
    entity.setProperty("foo", 2, "bar2")
    entity.setProperty("foo", 3, "bar3")
    entity.setProperty("foo", 4, "bar4")
    entity._applyDiffAtStage(2, { override_stack_size: 2 })
    entity._applyDiffAtStage(3, { override_stack_size: 3 })
    entity._applyDiffAtStage(4, { override_stack_size: 4 })
    entity.setLastStageUnchecked(4)

    entity.insertStage(3)

    // all keys at 3 and above are shifted up

    expect(entity.firstStage).to.equal(1)
    expect(entity.lastStage).to.equal(5)

    expect(entity.getWorldEntity(2)).to.be.any()
    expect(entity.getWorldEntity(3)).to.be.nil()
    expect(entity.getWorldEntity(4)).to.be.any()

    expect(entity.getProperty("foo", 2)).to.be("bar2")
    expect(entity.getProperty("foo", 3)).to.be.nil()
    expect(entity.getProperty("foo", 4)).to.be("bar3")
    expect(entity.getProperty("foo", 5)).to.be("bar4")

    expect(entity.getStageDiffs()).to.equal({
      2: { override_stack_size: 2 },
      3: nil,
      4: { override_stack_size: 3 },
      5: { override_stack_size: 4 },
    })
  })

  test("insert stage before base", () => {
    const entity = createProjectEntityNoCopy<InserterEntity>({ name: "filter-inserter" }, Pos(0, 0), nil, 2)

    entity.insertStage(1)
    expect(entity.firstStage).to.be(3)
  })

  test("insert stage after last stage", () => {
    const entity = createProjectEntityNoCopy<InserterEntity>({ name: "filter-inserter" }, Pos(0, 0), nil, 2)
    entity.setLastStageUnchecked(3)

    entity.insertStage(4)
    expect(entity.lastStage).to.be(3)
  })

  test("delete stage after base", () => {
    const luaEntity = simpleMock<LuaEntity>({ name: "test", type: "test" })
    const entity = createProjectEntityNoCopy<InserterEntity>(
      {
        name: "filter-inserter",
        override_stack_size: 1,
      },
      Pos(0, 0),
      nil,
      1,
    )
    entity.replaceWorldEntity(2, luaEntity)
    entity.replaceWorldEntity(3, luaEntity)
    entity.replaceWorldEntity(4, luaEntity)
    entity.setProperty("foo", 2, "bar2")
    entity.setProperty("foo", 3, "bar3")
    entity.setProperty("foo", 4, "bar4")
    entity._applyDiffAtStage(2, { override_stack_size: 2, filter_mode: "blacklist" })
    entity._applyDiffAtStage(3, { override_stack_size: 3 })
    entity._applyDiffAtStage(4, { override_stack_size: 4 })
    entity.setLastStageUnchecked(4)

    entity.deleteStage(3)

    // key 3 is deleted, all keys above it are shifted down

    expect(entity.firstStage).to.equal(1)
    expect(entity.lastStage).to.equal(3)

    expect(entity.getWorldEntity(2)).to.be.any()
    expect(entity.getWorldEntity(3)).to.be.any()
    expect(entity.getWorldEntity(4)).to.be.nil()

    expect(entity.getProperty("foo", 2)).to.be("bar2")
    expect(entity.getProperty("foo", 3)).to.be("bar4")
    expect(entity.getProperty("foo", 4)).to.be.nil()

    expect(entity.getStageDiffs()).to.equal({
      2: { override_stack_size: 3, filter_mode: "blacklist" }, // merge of 2 and 3
      3: { override_stack_size: 4 },
    })
  })

  test("delete stage before base", () => {
    const entity = createProjectEntityNoCopy<InserterEntity>(
      {
        name: "filter-inserter",
        override_stack_size: 1,
      },
      Pos(0, 0),
      nil,
      3,
    )

    entity.deleteStage(2)
    expect(entity.firstStage).to.be(2)
  })

  test("delete stage after last stage", () => {
    const entity = createProjectEntityNoCopy<InserterEntity>(
      {
        name: "filter-inserter",
        override_stack_size: 1,
      },
      Pos(0, 0),
      nil,
      3,
    )
    entity.setLastStageUnchecked(4)

    entity.deleteStage(5)
    expect(entity.lastStage).to.be(4)
  })

  test("delete stage right after base applies stage diffs to first entity", () => {
    const entity = createProjectEntityNoCopy<InserterEntity>(
      {
        name: "filter-inserter",
        override_stack_size: 1,
      },
      Pos(0, 0),
      nil,
      1,
    )
    entity._applyDiffAtStage(2, { override_stack_size: 2 })
    const value = entity.getValueAtStage(2)

    entity.deleteStage(2)
    expect(entity.getValueAtStage(1)).to.equal(value)
  })

  test("delete stage 1 merges with stage 2 instead", () => {
    const entity = createProjectEntityNoCopy<InserterEntity>(
      {
        name: "filter-inserter",
        override_stack_size: 1,
      },
      Pos(0, 0),
      nil,
      1,
    )
    entity._applyDiffAtStage(2, { override_stack_size: 2 })
    entity._applyDiffAtStage(3, { override_stack_size: 3 })

    const value = entity.getValueAtStage(2)
    entity.deleteStage(2)
    expect(entity.getValueAtStage(1)).to.equal(value)
  })

  test("delete stage 1 sets stage 1 properties to stage 2 properties", () => {
    const entity = createProjectEntityNoCopy<InserterEntity>(
      {
        name: "filter-inserter",
        override_stack_size: 1,
      },
      Pos(0, 0),
      nil,
      1,
    )
    entity.setProperty("foo", 1, "bar1")
    entity.setProperty("foo", 2, "bar2")
    entity.setProperty("foo", 3, "bar3")

    entity.deleteStage(1)
    expect(entity.getProperty("foo", 1)).to.be("bar2")
    expect(entity.getProperty("foo", 2)).to.be("bar3")
  })
})
