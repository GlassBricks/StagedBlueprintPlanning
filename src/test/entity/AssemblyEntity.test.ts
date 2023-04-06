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

import expect from "tstl-expect"
import { Prototypes } from "../../constants"
import { AssemblyEntity, createAssemblyEntity, ExtraEntityType } from "../../entity/AssemblyEntity"
import { Entity, RollingStockEntity } from "../../entity/Entity"
import { getRegisteredAssemblyEntity } from "../../entity/registration"
import { getEntityDiff } from "../../entity/stage-diff"
import { shallowCopy } from "../../lib"
import { Pos } from "../../lib/geometry"
import { getNilPlaceholder } from "../../utils/diff-value"
import { setupTestSurfaces } from "../assembly/Assembly-mock"
import { simpleMock } from "../simple-mock"
import { createRollingStock } from "./createRollingStock"

interface InserterEntity extends Entity {
  name: "filter-inserter" | "stack-filter-inserter"

  override_stack_size?: number
  filter_mode?: "whitelist" | "blacklist"
}
let entity: InserterEntity
let assemblyEntity: AssemblyEntity<InserterEntity>
before_each(() => {
  entity = {
    name: "filter-inserter",
    override_stack_size: 1,
  }
  assemblyEntity = createAssemblyEntity(entity, Pos(0, 0), nil, 2)
  assemblyEntity._applyDiffAtStage(3, { override_stack_size: 2, filter_mode: "blacklist" })
  assemblyEntity._applyDiffAtStage(5, { override_stack_size: 3 })
  assemblyEntity._applyDiffAtStage(7, { filter_mode: getNilPlaceholder() })
})

test("getters", () => {
  expect(assemblyEntity.firstStage).to.equal(2)
  expect(assemblyEntity.firstValue).to.equal(entity)
  expect(assemblyEntity.getDirection()).to.equal(0) // nil <=> 0
})

test("lastStage default nil", () => {
  expect(assemblyEntity.lastStage).toBeNil()
})

test("isInStage", () => {
  assemblyEntity.setLastStageUnchecked(4)
  expect(assemblyEntity.isInStage(1)).to.be(false)
  expect(assemblyEntity.isInStage(2)).to.be(true)
  expect(assemblyEntity.isInStage(3)).to.be(true)
  expect(assemblyEntity.isInStage(4)).to.be(true)
  expect(assemblyEntity.isInStage(5)).to.be(false)
  expect(assemblyEntity.isInStage(6)).to.be(false)
})

test("isPastLastStage", () => {
  assemblyEntity.setLastStageUnchecked(4)
  expect(assemblyEntity.isPastLastStage(3)).to.be(false)
  expect(assemblyEntity.isPastLastStage(4)).to.be(false)
  expect(assemblyEntity.isPastLastStage(5)).to.be(true)
  expect(assemblyEntity.isPastLastStage(6)).to.be(true)

  assemblyEntity.setLastStageUnchecked(nil)
  expect(assemblyEntity.isPastLastStage(4)).to.be(false)
  expect(assemblyEntity.isPastLastStage(5)).to.be(false)
  expect(assemblyEntity.isPastLastStage(6)).to.be(false)
})

test("isRollingStock", () => {
  expect(assemblyEntity.isRollingStock()).to.be(false)
  const assemblyEntity2 = createAssemblyEntity({ name: "locomotive" }, Pos(0, 0), nil, 2)
  expect(assemblyEntity2.isRollingStock()).to.be(true)
})

test("isUndergroundBelt", () => {
  expect(assemblyEntity.isUndergroundBelt()).to.be(false)
  const assemblyEntity2 = createAssemblyEntity({ name: "underground-belt" }, Pos(0, 0), nil, 2)
  expect(assemblyEntity2.isUndergroundBelt()).to.be(true)
})

test("hasStageDiff", () => {
  const assemblyEntity = createAssemblyEntity(entity, Pos(0, 0), nil, 2)
  expect(assemblyEntity.hasStageDiff()).to.be(false)
  assemblyEntity._applyDiffAtStage(3, { override_stack_size: 3 })
  expect(assemblyEntity.hasStageDiff()).to.be(true)
  expect(assemblyEntity.hasStageDiff(3)).to.be(true)
  expect(assemblyEntity.hasStageDiff(2)).to.be(false)
})

test("getStageDiff", () => {
  const assemblyEntity = createAssemblyEntity(entity, Pos(0, 0), nil, 2)
  expect(assemblyEntity.getStageDiff(3)).to.be.nil()
  assemblyEntity._applyDiffAtStage(3, { override_stack_size: 3 })
  expect(assemblyEntity.getStageDiff(3)).to.equal({ override_stack_size: 3 })
})

test("nextStageWithDiff", () => {
  const assemblyEntity = createAssemblyEntity(entity, Pos(0, 0), nil, 2)
  assemblyEntity._applyDiffAtStage(3, { override_stack_size: 3 })
  assemblyEntity._applyDiffAtStage(5, { override_stack_size: 5 })
  expect(assemblyEntity.nextStageWithDiff(2)).to.be(3)
  expect(assemblyEntity.nextStageWithDiff(3)).to.be(5)
  expect(assemblyEntity.nextStageWithDiff(4)).to.be(5)
  expect(assemblyEntity.nextStageWithDiff(5)).to.be(nil)
})

test("prevStageWithDiff", () => {
  const assemblyEntity = createAssemblyEntity(entity, Pos(0, 0), nil, 2)
  assemblyEntity._applyDiffAtStage(3, { override_stack_size: 3 })
  assemblyEntity._applyDiffAtStage(5, { override_stack_size: 5 })
  expect(assemblyEntity.prevStageWithDiff(6)).to.be(5)
  expect(assemblyEntity.prevStageWithDiff(5)).to.be(3)
  expect(assemblyEntity.prevStageWithDiff(4)).to.be(3)
  expect(assemblyEntity.prevStageWithDiff(3)).to.be(nil)
  expect(assemblyEntity.prevStageWithDiff(2)).to.be(nil)
})

describe("getValueAtStage", () => {
  test("nil if lower than stage", () => {
    expect(assemblyEntity.getValueAtStage(1)).to.be.nil()
  })

  test("getValueAtStage returns same entity if no stageDiffs", () => {
    expect(assemblyEntity.getValueAtStage(2)).to.equal(entity)
  })

  test("applies changes from one stage", () => {
    const result = assemblyEntity.getValueAtStage(3)
    expect(result).to.equal({ ...entity, override_stack_size: 2, filter_mode: "blacklist" })
  })

  test("applies changes from multiple stages", () => {
    const result = assemblyEntity.getValueAtStage(5)
    expect(result).to.equal({ ...entity, override_stack_size: 3, filter_mode: "blacklist" })
  })

  test("replaces nilPlaceholder with nil", () => {
    const result = assemblyEntity.getValueAtStage(7)
    const expected = { ...entity, override_stack_size: 3 }
    delete expected.filter_mode

    expect(result).to.equal(expected)
  })

  test("getPropAtStage", () => {
    expect(assemblyEntity.getPropAtStage(2, "override_stack_size")).to.equal([1, 2])
    expect(assemblyEntity.getPropAtStage(3, "override_stack_size")).to.equal([2, 3])
    expect(assemblyEntity.getPropAtStage(4, "override_stack_size")).to.equal([2, 3])
    expect(assemblyEntity.getPropAtStage(5, "override_stack_size")).to.equal([3, 5])
    expect(assemblyEntity.getPropAtStage(6, "override_stack_size")).to.equal([3, 5])

    expect(assemblyEntity.getPropAtStage(1, "override_stack_size")).to.equal([1, 2])

    expect(assemblyEntity.getPropAtStage(2, "filter_mode")).to.equal([nil, 2])
    expect(assemblyEntity.getPropAtStage(3, "filter_mode")).to.equal(["blacklist", 3])
    expect(assemblyEntity.getPropAtStage(4, "filter_mode")).to.equal(["blacklist", 3])
    expect(assemblyEntity.getPropAtStage(5, "filter_mode")).to.equal(["blacklist", 3])
    expect(assemblyEntity.getPropAtStage(6, "filter_mode")).to.equal(["blacklist", 3])
    expect(assemblyEntity.getPropAtStage(7, "filter_mode")).to.equal([nil, 7])
    expect(assemblyEntity.getPropAtStage(8, "filter_mode")).to.equal([nil, 7])

    expect(assemblyEntity.getPropAtStage(1, "filter_mode")).to.equal([nil, 2])
  })

  test("getNameAtStage ", () => {
    assemblyEntity._applyDiffAtStage(4, { name: "stack-filter-inserter" })
    expect(assemblyEntity.getNameAtStage(1)).to.equal("filter-inserter")
    expect(assemblyEntity.getNameAtStage(2)).to.equal("filter-inserter")
    expect(assemblyEntity.getNameAtStage(3)).to.equal("filter-inserter")
    expect(assemblyEntity.getNameAtStage(4)).to.equal("stack-filter-inserter")
    expect(assemblyEntity.getNameAtStage(5)).to.equal("stack-filter-inserter")
  })
})

test("iterateValues", () => {
  const expected = []
  for (let stage = 1; stage <= 6; stage++) {
    expected[stage] = assemblyEntity.getValueAtStage(stage) ?? "nil"
  }
  const result = []
  for (const [stage, entity] of assemblyEntity.iterateValues(1, 6)) {
    result[stage] = entity == nil ? "nil" : shallowCopy(entity)
  }
  expect(result).to.equal(expected)
})

test("iterateValues returns nothing if end > start", () => {
  const result = []
  for (const [stage, entity] of assemblyEntity.iterateValues(4, 2)) {
    result[stage] = entity
  }
  expect(result).to.equal([])
})

describe("adjustValueAtStage", () => {
  test("can set first value", () => {
    const newEntity = { ...entity, override_stack_size: 3 }
    assemblyEntity.adjustValueAtStage(2, newEntity)
    expect(assemblyEntity.firstValue).to.equal(newEntity)
  })

  test("removes no longer effectual diffs after set at first value", () => {
    const assemblyEntity = createAssemblyEntity(entity, Pos(0, 0), nil, 1)
    assemblyEntity._applyDiffAtStage(3, { override_stack_size: 3 })
    assemblyEntity.adjustValueAtStage(1, { ...entity, override_stack_size: 3 })
    expect(assemblyEntity.firstValue).to.equal({ ...entity, override_stack_size: 3 })
    expect(assemblyEntity.hasStageDiff()).to.be(false)
  })

  test("creates diff if set at higher stage", () => {
    const assemblyEntity = createAssemblyEntity(entity, Pos(0, 0), nil, 1)
    assemblyEntity.adjustValueAtStage(2, { ...entity, override_stack_size: 3 })
    expect(assemblyEntity.firstValue).to.equal(entity)
    expect(assemblyEntity.hasStageDiff()).to.be(true)
    expect(assemblyEntity.getValueAtStage(2)).to.equal({ ...entity, override_stack_size: 3 })
  })

  test("removes diff entirely if matches lower stage", () => {
    expect(assemblyEntity.hasStageDiff(3)).to.be(true)
    assemblyEntity.adjustValueAtStage(3, assemblyEntity.firstValue)
    expect(assemblyEntity.hasStageDiff(3)).to.be(false)
  })

  test("complex case", () => {
    const firstValue = { name: "test", a: 1, b: 1, c: 1 }
    const value2 = { ...firstValue, b: 2, c: 2 }
    const newValue2 = { ...firstValue, a: 2, b: 1, c: 5 }
    const value3 = { ...firstValue, a: 2, b: 2, c: 5 }
    const assemblyEntity = createAssemblyEntity(firstValue, Pos(0, 0), nil, 1)
    assemblyEntity.adjustValueAtStage(2, value2)
    expect(assemblyEntity.firstValue).to.equal(firstValue)
    expect(assemblyEntity.getValueAtStage(2)).to.equal(value2)
    assemblyEntity.adjustValueAtStage(3, value3)
    expect(assemblyEntity.firstValue).to.equal(firstValue)
    expect(assemblyEntity.getValueAtStage(2)).to.equal(value2)
    expect(assemblyEntity.getValueAtStage(3)).to.equal(value3)
    assemblyEntity.adjustValueAtStage(2, newValue2)
    expect(assemblyEntity.firstValue).to.equal(firstValue)
    expect(assemblyEntity.getValueAtStage(2)).to.equal(newValue2)
    const newValue3 = { ...value3, b: 1 } // due to change in newValue2
    expect(assemblyEntity.getValueAtStage(3)).to.equal(newValue3)
    expect(assemblyEntity.getStageDiff(3)).to.equal(getEntityDiff(newValue2, newValue3))
  })
})

describe("setPropAtStage", () => {
  test("can set first value", () => {
    expect(assemblyEntity.setPropAtStage(2, "override_stack_size", 3)).to.be(true)
    expect(assemblyEntity.firstValue).to.equal({ ...entity, override_stack_size: 3 })
  })

  test("returns false if no change", () => {
    expect(assemblyEntity.setPropAtStage(2, "override_stack_size", 1)).to.be(false)
  })

  test("removes no longer effectual diffs after set at first value", () => {
    const assemblyEntity = createAssemblyEntity(entity, Pos(0, 0), nil, 1)
    assemblyEntity._applyDiffAtStage(3, { override_stack_size: 3 })
    assemblyEntity._applyDiffAtStage(4, { override_stack_size: 4 })
    expect(assemblyEntity.setPropAtStage(1, "override_stack_size", 3)).to.be(true)
    expect(assemblyEntity.firstValue).to.equal({ ...entity, override_stack_size: 3 })
    expect(assemblyEntity.hasStageDiff(3)).to.be(false)
  })

  test("creates diff if set at higher stage", () => {
    const assemblyEntity = createAssemblyEntity(entity, Pos(0, 0), nil, 1)
    expect(assemblyEntity.setPropAtStage(3, "override_stack_size", 3)).to.be(true)
    expect(assemblyEntity.firstValue).to.equal(entity)
    expect(assemblyEntity.hasStageDiff(3)).to.be(true)
    expect(assemblyEntity.getValueAtStage(3)).to.equal({ ...entity, override_stack_size: 3 })
  })
})

describe("moving stage diff props", () => {
  test("resetValue removes stage diff", () => {
    const assemblyEntity = createAssemblyEntity(entity, Pos(0, 0), nil, 1)
    assemblyEntity._applyDiffAtStage(3, { override_stack_size: 3 })
    expect(assemblyEntity.resetValue(3)).to.be(true)
    expect(assemblyEntity.getValueAtStage(3)).to.equal(entity)
    expect(assemblyEntity.hasStageDiff()).to.be(false)
  })
  test("returns false if no diff", () => {
    const assemblyEntity = createAssemblyEntity(entity, Pos(0, 0), nil, 1)
    assemblyEntity._applyDiffAtStage(4, { override_stack_size: 3 })
    expect(assemblyEntity.resetValue(3)).to.be(false)
  })

  test("moveDiffDown can apply to first value", () => {
    const assemblyEntity = createAssemblyEntity(entity, Pos(0, 0), nil, 1)
    assemblyEntity._applyDiffAtStage(3, { override_stack_size: 3 })
    expect(assemblyEntity.moveValueDown(3)).to.be(1)
    expect(assemblyEntity.firstValue).to.equal({ ...entity, override_stack_size: 3 })
    expect(assemblyEntity.hasStageDiff()).to.be(false)
  })
  test("moveDiffDown can apply to next lower stage with diff", () => {
    const assemblyEntity = createAssemblyEntity(entity, Pos(0, 0), nil, 1)
    assemblyEntity._applyDiffAtStage(3, { override_stack_size: 3 })
    assemblyEntity._applyDiffAtStage(4, { override_stack_size: 4 })
    expect(assemblyEntity.moveValueDown(4)).to.be(3)
    expect(assemblyEntity.getValueAtStage(3)).to.equal({ ...entity, override_stack_size: 4 })
    expect(assemblyEntity.hasStageDiff(4)).to.be(false)
  })

  test("moveDiffDown returns nil if no diff", () => {
    const assemblyEntity = createAssemblyEntity(entity, Pos(0, 0), nil, 1)
    assemblyEntity._applyDiffAtStage(4, { override_stack_size: 3 })
    expect(assemblyEntity.moveValueDown(3)).to.be.nil()
  })

  test("resetProp removes prop from stage diff", () => {
    const assemblyEntity = createAssemblyEntity(entity, Pos(0, 0), nil, 2)
    // is override_stack_size at stage 2
    assemblyEntity._applyDiffAtStage(3, { override_stack_size: 3 })
    assemblyEntity.resetProp(3, "override_stack_size")
    expect(assemblyEntity.getValueAtStage(3)).to.equal(entity)
    expect(assemblyEntity.hasStageDiff()).to.be(false)
  })

  test("resetProp returns false if no diff", () => {
    const assemblyEntity = createAssemblyEntity(entity, Pos(0, 0), nil, 1)
    assemblyEntity._applyDiffAtStage(3, { filter_mode: "whitelist" })
    expect(assemblyEntity.resetProp(3, "override_stack_size")).to.be(false)
    expect(assemblyEntity.getValueAtStage(3)).to.equal({ ...entity, filter_mode: "whitelist" })
  })

  test("resetProp can get from next lower stage with diff", () => {
    const assemblyEntity = createAssemblyEntity(entity, Pos(0, 0), nil, 2)
    assemblyEntity._applyDiffAtStage(3, { override_stack_size: 3 })
    assemblyEntity._applyDiffAtStage(4, { override_stack_size: 4 })
    assemblyEntity.resetProp(4, "override_stack_size")
    expect(assemblyEntity.getValueAtStage(4)).to.equal({ ...entity, override_stack_size: 3 })
    expect(assemblyEntity.hasStageDiff(3)).to.be(true)
    expect(assemblyEntity.hasStageDiff(4)).to.be(false)
  })

  test("movePropDown can apply a diff to first stage", () => {
    const assemblyEntity = createAssemblyEntity(entity, Pos(0, 0), nil, 2)
    assemblyEntity._applyDiffAtStage(3, { override_stack_size: 3 })
    expect(assemblyEntity.movePropDown(3, "override_stack_size")).to.be(2)
    expect(assemblyEntity.getValueAtStage(2)).to.equal({ ...entity, override_stack_size: 3 })
    expect(assemblyEntity.hasStageDiff()).to.be(false)
  })

  test("movePropDown can apply a diff to next lower stage with diff", () => {
    const assemblyEntity = createAssemblyEntity(entity, Pos(0, 0), nil, 2)
    assemblyEntity._applyDiffAtStage(3, { override_stack_size: 3 })
    assemblyEntity._applyDiffAtStage(4, { override_stack_size: 4 })
    expect(assemblyEntity.movePropDown(4, "override_stack_size")).to.be(3)
    expect(assemblyEntity.getValueAtStage(3)).to.equal({ ...entity, override_stack_size: 4 })
    expect(assemblyEntity.hasStageDiff(3)).to.be(true)
    expect(assemblyEntity.hasStageDiff(4)).to.be(false)
  })
})

describe("trySetFirstStage", () => {
  test("move down", () => {
    assemblyEntity.setFirstStageUnchecked(1)
    expect(assemblyEntity.firstValue).to.equal(entity)
    expect(assemblyEntity.firstStage).to.be(1)
  })

  test("moving up; also merges stage diffs", () => {
    const valueAt5 = assemblyEntity.getValueAtStage(5)
    assemblyEntity.setFirstStageUnchecked(5)
    expect(assemblyEntity.firstValue).to.equal(valueAt5)
    const diffs = assemblyEntity.getStageDiffs()!
    expect(next(diffs)[0]).to.be(7)
  })

  test("cannot move past last stage", () => {
    assemblyEntity.setLastStageUnchecked(4)
    expect(() => assemblyEntity.setFirstStageUnchecked(4)).not.toError()
    expect(() => assemblyEntity.setFirstStageUnchecked(5)).to.error()
  })
})

describe("trySetLastStage", () => {
  test("set", () => {
    assemblyEntity.setLastStageUnchecked(5)
    expect(assemblyEntity.lastStage).to.be(5)
  })
  test("can set back to nil", () => {
    assemblyEntity.setLastStageUnchecked(5)
    assemblyEntity.setLastStageUnchecked(nil)
    expect(assemblyEntity.lastStage).to.be(nil)
  })
  test("cannot move below first stage", () => {
    expect(() => assemblyEntity.setLastStageUnchecked(0)).to.error()
  })
  test("moving down deletes later stage diffs", () => {
    assemblyEntity.setLastStageUnchecked(5)
    expect(assemblyEntity.lastStage).to.be(5)
    const diffs = assemblyEntity.getStageDiffs()!
    expect(diffs).not.toHaveKey(7)
    expect(next(diffs)[0]).to.be(3)
  })
})

describe("Get/set world entities", () => {
  let entity: LuaEntity
  let previewEntity: LuaEntity
  const surfaces = setupTestSurfaces(1)
  let assemblyEntity: AssemblyEntity
  before_each(() => {
    const pos = Pos(0.5, 0.5)
    entity = surfaces[0].create_entity({ name: "iron-chest", position: pos })!
    previewEntity = surfaces[0].create_entity({ name: Prototypes.PreviewEntityPrefix + "iron-chest", position: pos })!
    assemblyEntity = createAssemblyEntity({ name: entity.name }, pos, nil, 1)
  })

  test("get after replace returns the correct entity", () => {
    expect(assemblyEntity.getWorldEntity(1)).to.be.nil()
    expect(assemblyEntity.getWorldEntity(2)).to.be.nil()
    assemblyEntity.replaceWorldEntity(1, entity)
    expect(assemblyEntity.getWorldEntity(1)).to.equal(entity)
    expect(assemblyEntity.getWorldEntity(2)).to.be.nil()
    assemblyEntity.replaceWorldEntity(2, entity)
    expect(assemblyEntity.getWorldEntity(1)).to.equal(entity)
    expect(assemblyEntity.getWorldEntity(2)).to.equal(entity)
  })

  test("getWorldEntity returns nil if is a preview entity", () => {
    assemblyEntity.replaceWorldOrPreviewEntity(1, previewEntity)
    expect(assemblyEntity.getWorldEntity(1)).to.be.nil()
    expect(assemblyEntity.getWorldOrPreviewEntity(1)).to.be(previewEntity)
  })

  test("destroyWorldOrPreviewEntity", () => {
    assemblyEntity.replaceWorldEntity(1, entity)
    assemblyEntity.destroyWorldOrPreviewEntity(1)
    expect(entity.valid).to.be(false)
    expect(assemblyEntity.getWorldEntity(1)).to.be.nil()
  })

  test("replace with nil destroys the entity", () => {
    assemblyEntity.replaceWorldEntity(1, entity)
    assemblyEntity.replaceWorldEntity(1, nil)
    expect(entity.valid).to.be(false)
    expect(assemblyEntity.getWorldEntity(1)).to.be.nil()
  })

  test("replace world entity deletes old entity", () => {
    assemblyEntity.replaceWorldEntity(1, entity)
    const newEntity = surfaces[0].create_entity({ name: "iron-chest", position: Pos(1.5, 1.5) })!
    assemblyEntity.replaceWorldEntity(1, newEntity)
    expect(entity.valid).to.be(false)
    expect(assemblyEntity.getWorldEntity(1)).to.equal(newEntity)
  })

  test("replace world entity does not delete if same entity", () => {
    assemblyEntity.replaceWorldEntity(1, entity)
    assemblyEntity.replaceWorldEntity(1, entity)
    expect(entity.valid).to.be(true)
    expect(assemblyEntity.getWorldEntity(1)).to.equal(entity)
  })

  test("get world entity returns nil if entity becomes invalid", () => {
    assemblyEntity.replaceWorldEntity(1, entity)
    entity.destroy()
    expect(assemblyEntity.getWorldEntity(1)).to.be.nil()
  })

  test("destroyAllWorldOrPreviewEntities", () => {
    assemblyEntity.replaceWorldOrPreviewEntity(1, entity)
    assemblyEntity.replaceWorldOrPreviewEntity(2, previewEntity)
    assemblyEntity.destroyAllWorldOrPreviewEntities()
    expect(entity.valid).to.be(false)
    expect(previewEntity.valid).to.be(false)
    expect(assemblyEntity.getWorldEntity(1)).to.be.nil()
    expect(assemblyEntity.getWorldEntity(2)).to.be.nil()
  })

  test("hasWorldEntityInRange", () => {
    expect(assemblyEntity.hasWorldEntityInRange(1, 2)).to.be(false)
    assemblyEntity.replaceWorldEntity(2, entity)
    assemblyEntity.replaceWorldEntity(5, entity)
    expect(assemblyEntity.hasWorldEntityInRange(1, 1)).to.be(false)
    expect(assemblyEntity.hasWorldEntityInRange(1, 3)).to.be(true)
    expect(assemblyEntity.hasWorldEntityInRange(3, 4)).to.be(false)
    expect(assemblyEntity.hasWorldEntityInRange(3, 5)).to.be(true)
  })
})

declare module "../../entity/AssemblyEntity" {
  interface ExtraEntities {
    _type?: LuaEntity
  }
}
describe("get/set extra entities", () => {
  const type: ExtraEntityType = "_type"
  let entity: LuaEntity
  let assemblyEntity: AssemblyEntity
  before_each(() => {
    entity = simpleMock<LuaEntity>({ name: "test", position: Pos(0, 0) })
    assemblyEntity = createAssemblyEntity({ name: entity.name }, Pos(0, 0), nil, 1)
  })

  test("get after replace returns the correct entity", () => {
    expect(assemblyEntity.getExtraEntity(type, 1)).to.be.nil()
    expect(assemblyEntity.getExtraEntity(type, 2)).to.be.nil()
    assemblyEntity.replaceExtraEntity(type, 1, entity)
    expect(assemblyEntity.getExtraEntity(type, 1)).to.equal(entity)
    expect(assemblyEntity.getExtraEntity(type, 2)).to.be.nil()
    assemblyEntity.replaceExtraEntity(type, 2, entity)
    expect(assemblyEntity.getExtraEntity(type, 1)).to.equal(entity)
    expect(assemblyEntity.getExtraEntity(type, 2)).to.equal(entity)
  })

  test("destroyExtraEntity", () => {
    assemblyEntity.replaceExtraEntity(type, 1, entity)
    assemblyEntity.destroyExtraEntity(type, 1)
    expect(entity.valid).to.be(false)
    expect(assemblyEntity.getExtraEntity(type, 1)).to.be.nil()
  })

  test("replace with nil destroys the entity", () => {
    assemblyEntity.replaceExtraEntity(type, 1, entity)
    assemblyEntity.replaceExtraEntity(type, 1, nil)
    expect(entity.valid).to.be(false)
    expect(assemblyEntity.getExtraEntity(type, 1)).to.be.nil()
  })

  test("replace extra entity deletes old entity", () => {
    assemblyEntity.replaceExtraEntity(type, 1, entity)
    const newEntity = simpleMock<LuaEntity>({ name: "test", position: Pos(0, 0) })
    assemblyEntity.replaceExtraEntity(type, 1, newEntity)
    expect(entity.valid).to.be(false)
    expect(assemblyEntity.getExtraEntity(type, 1)).to.equal(newEntity)
  })

  test("replace extra entity does not delete if same entity", () => {
    assemblyEntity.replaceExtraEntity(type, 1, entity)
    assemblyEntity.replaceExtraEntity(type, 1, entity)
    expect(entity.valid).to.be(true)
    expect(assemblyEntity.getExtraEntity(type, 1)).to.equal(entity)
  })

  test("get extra entity returns nil if entity becomes invalid", () => {
    assemblyEntity.replaceExtraEntity(type, 1, entity)
    entity.destroy()
    expect(assemblyEntity.getExtraEntity(type, 1)).to.be.nil()
  })

  test("destroyAllExtraEntities", () => {
    assemblyEntity.replaceExtraEntity(type, 1, entity)
    assemblyEntity.destroyAllExtraEntities(type)
    expect(entity.valid).to.be(false)
    expect(assemblyEntity.getExtraEntity(type, 1)).to.be.nil()
  })
})

describe("rolling stock", () => {
  test("rolling stock only appears in its first stage", () => {
    const assemblyEntity = createAssemblyEntity({ name: "cargo-wagon" }, Pos(0, 0), nil, 2)
    expect(assemblyEntity.getValueAtStage(1)).to.be.nil()
    expect(assemblyEntity.getValueAtStage(2)).to.equal(assemblyEntity.firstValue)
    expect(assemblyEntity.getValueAtStage(3)).to.be.nil()

    // expect(assemblyEntity.inFirstStageOnly()).to.be(true)
    expect(assemblyEntity.lastStage).to.equal(2)
  })
  test("cannot apply stage diffs to rolling stock beyond first stage", () => {
    const assemblyEntity = createAssemblyEntity({ name: "cargo-wagon" } as RollingStockEntity, Pos(0, 0), nil, 1)
    const adjusted = assemblyEntity.adjustValueAtStage(1, { name: "cargo-wagon", items: { foo: 1 } })
    expect(adjusted).to.be(true)
    const adjusted2 = assemblyEntity.adjustValueAtStage(2, { name: "cargo-wagon", items: { foo: 2 } })
    expect(adjusted2).to.be(false)
    expect(assemblyEntity.getValueAtStage(1)).to.equal(assemblyEntity.firstValue)
  })
  test("apply stage diff ignores orientation changes", () => {
    const assemblyEntity = createAssemblyEntity({ name: "cargo-wagon", orientation: 0.25 }, Pos(0, 0), nil, 1)
    const adjusted = assemblyEntity.adjustValueAtStage(1, { ...assemblyEntity.firstValue, orientation: 0.5 })
    expect(adjusted).to.be(false)
    expect(assemblyEntity.firstValue.orientation).to.be(0.25)
  })
  test("cannot apply upgrade to rolling stock", () => {
    const assemblyEntity = createAssemblyEntity({ name: "cargo-wagon" }, Pos(0, 0), nil, 1)
    const adjusted = assemblyEntity.applyUpgradeAtStage(1, "cargo-wagon-2")
    expect(adjusted).to.be(false)
    expect(assemblyEntity.getNameAtStage(1)).to.be("cargo-wagon")
  })
  test("setting a rolling stock world entity will register it in entity-registration", () => {
    const rollingStock = createRollingStock()

    assemblyEntity.replaceWorldEntity(1, rollingStock)
    const found = getRegisteredAssemblyEntity(rollingStock)
    expect(found).to.equal(assemblyEntity)
  })
})

declare module "../../entity/AssemblyEntity" {
  // noinspection JSUnusedGlobalSymbols
  export interface StageProperties {
    foo?: string
  }
}
describe("get/set properties", () => {
  test("get property when not set is nil", () => {
    expect(assemblyEntity.getProperty("foo", 2)).to.be.nil()
  })
  test("get and set property", () => {
    assemblyEntity.setProperty("foo", 2, "bar")
    expect(assemblyEntity.getProperty("foo", 2)).to.be("bar")
  })
  test("propertyIsSetAnywhere", () => {
    expect(assemblyEntity.propertySetInAnyStage("foo")).to.be(false)
    assemblyEntity.setProperty("foo", 2, "bar")
    expect(assemblyEntity.propertySetInAnyStage("foo")).to.be(true)
    assemblyEntity.setProperty("foo", 3, "bar")
    assemblyEntity.setProperty("foo", 2, nil)
    expect(assemblyEntity.propertySetInAnyStage("foo")).to.be(true)
    assemblyEntity.setProperty("foo", 3, nil)
    expect(assemblyEntity.propertySetInAnyStage("foo")).to.be(false)
  })
  test("clear property", () => {
    assemblyEntity.setProperty("foo", 2, "bar")
    assemblyEntity.setProperty("foo", 3, "bar")
    assemblyEntity.clearPropertyInAllStages("foo")
    expect(assemblyEntity.getProperty("foo", 2)).to.be.nil()
    expect(assemblyEntity.getProperty("foo", 3)).to.be.nil()
  })
})

describe("insert/deleting stages", () => {
  test("insert stage after base", () => {
    const luaEntity = simpleMock<LuaEntity>({ name: "test", type: "test" })
    const entity = createAssemblyEntity({ name: luaEntity.name, override_stack_size: 1 }, Pos(0, 0), nil, 1)
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
    const entity = createAssemblyEntity<InserterEntity>({ name: "filter-inserter" }, Pos(0, 0), nil, 2)

    entity.insertStage(1)
    expect(entity.firstStage).to.be(3)
  })

  test("insert stage after last stage", () => {
    const entity = createAssemblyEntity<InserterEntity>({ name: "filter-inserter" }, Pos(0, 0), nil, 2)
    entity.setLastStageUnchecked(3)

    entity.insertStage(4)
    expect(entity.lastStage).to.be(3)
  })

  test("delete stage after base", () => {
    const luaEntity = simpleMock<LuaEntity>({ name: "test", type: "test" })
    const entity = createAssemblyEntity<InserterEntity>(
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
    const entity = createAssemblyEntity<InserterEntity>(
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
    const entity = createAssemblyEntity<InserterEntity>(
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
    const entity = createAssemblyEntity<InserterEntity>(
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
    const entity = createAssemblyEntity<InserterEntity>(
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
    const entity = createAssemblyEntity<InserterEntity>(
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
