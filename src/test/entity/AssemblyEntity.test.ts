/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { Prototypes } from "../../constants"
import { AssemblyEntity, createAssemblyEntity, ExtraEntityType } from "../../entity/AssemblyEntity"
import { Entity } from "../../entity/Entity"
import { getRegisteredAssemblyEntity } from "../../entity/entity-registration"
import { RollingStockEntity } from "../../entity/special-entities"
import { getEntityDiff, getNilPlaceholder } from "../../entity/stage-diff"
import { shallowCopy } from "../../lib"
import { Pos } from "../../lib/geometry"
import { setupTestSurfaces } from "../assembly/Assembly-mock"
import { simpleMock } from "../simple-mock"
import { createRollingStock } from "./createRollingStock"

interface InserterEntity extends Entity {
  name: "filter-inserter" | "stack-filter-inserter"

  override_stack_size?: number
  filter_mode?: "whitelist" | "blacklist"
}
let entity: InserterEntity
let fooAssemblyEntity: AssemblyEntity<InserterEntity>
before_each(() => {
  entity = {
    name: "filter-inserter",
    override_stack_size: 1,
  }
  fooAssemblyEntity = createAssemblyEntity(entity, Pos(0, 0), nil, 2)
  fooAssemblyEntity._applyDiffAtStage(3, { override_stack_size: 2, filter_mode: "blacklist" })
  fooAssemblyEntity._applyDiffAtStage(5, { override_stack_size: 3 })
  fooAssemblyEntity._applyDiffAtStage(7, { filter_mode: getNilPlaceholder() })
})

test("getters", () => {
  assert.same(2, fooAssemblyEntity.firstStage)
  assert.same(entity, fooAssemblyEntity.firstValue)
  assert.same(0, fooAssemblyEntity.getDirection()) // nil <=> 0
})

test("isRollingStock", () => {
  assert.false(fooAssemblyEntity.isRollingStock())
  const assemblyEntity2 = createAssemblyEntity({ name: "locomotive" }, Pos(0, 0), nil, 2)
  assert.true(assemblyEntity2.isRollingStock())
})

test("isUndergroundBelt", () => {
  assert.false(fooAssemblyEntity.isUndergroundBelt())
  const assemblyEntity2 = createAssemblyEntity({ name: "underground-belt" }, Pos(0, 0), nil, 2)
  assert.true(assemblyEntity2.isUndergroundBelt())
})

test("hasStageDiff", () => {
  const assemblyEntity = createAssemblyEntity(entity, Pos(0, 0), nil, 2)
  assert.false(assemblyEntity.hasStageDiff())
  assemblyEntity._applyDiffAtStage(3, { override_stack_size: 3 })
  assert.true(assemblyEntity.hasStageDiff())
  assert.true(assemblyEntity.hasStageDiff(3))
  assert.false(assemblyEntity.hasStageDiff(2))
})

test("getStageDiff", () => {
  const assemblyEntity = createAssemblyEntity(entity, Pos(0, 0), nil, 2)
  assert.nil(assemblyEntity.getStageDiff(3))
  assemblyEntity._applyDiffAtStage(3, { override_stack_size: 3 })
  assert.same({ override_stack_size: 3 }, assemblyEntity.getStageDiff(3))
})

test("nextStageWithDiff", () => {
  const assemblyEntity = createAssemblyEntity(entity, Pos(0, 0), nil, 2)
  assemblyEntity._applyDiffAtStage(3, { override_stack_size: 3 })
  assemblyEntity._applyDiffAtStage(5, { override_stack_size: 5 })
  assert.equal(3, assemblyEntity.nextStageWithDiff(2))
  assert.equal(5, assemblyEntity.nextStageWithDiff(3))
  assert.equal(5, assemblyEntity.nextStageWithDiff(4))
  assert.equal(nil, assemblyEntity.nextStageWithDiff(5))
})

test("prevStageWithDiff", () => {
  const assemblyEntity = createAssemblyEntity(entity, Pos(0, 0), nil, 2)
  assemblyEntity._applyDiffAtStage(3, { override_stack_size: 3 })
  assemblyEntity._applyDiffAtStage(5, { override_stack_size: 5 })
  assert.equal(5, assemblyEntity.prevStageWithDiff(6))
  assert.equal(3, assemblyEntity.prevStageWithDiff(5))
  assert.equal(3, assemblyEntity.prevStageWithDiff(4))
  assert.equal(nil, assemblyEntity.prevStageWithDiff(3))
  assert.equal(nil, assemblyEntity.prevStageWithDiff(2))
})

test("inFirstStageOnly generally false", () => {
  const assemblyEntity = createAssemblyEntity(entity, Pos(0, 0), nil, 2)
  assert.false(assemblyEntity.inFirstStageOnly())
})

describe("getValueAtStage", () => {
  test("nil if lower than stage", () => {
    assert.nil(fooAssemblyEntity.getValueAtStage(1))
  })

  test("getValueAtStage returns same entity if no stageDiffs", () => {
    assert.same(entity, fooAssemblyEntity.getValueAtStage(2))
  })

  test("applies changes from one stage", () => {
    const result = fooAssemblyEntity.getValueAtStage(3)
    assert.same({ ...entity, override_stack_size: 2, filter_mode: "blacklist" }, result)
  })

  test("applies changes from multiple stages", () => {
    const result = fooAssemblyEntity.getValueAtStage(5)
    assert.same({ ...entity, override_stack_size: 3, filter_mode: "blacklist" }, result)
  })

  test("replaces nilPlaceholder with nil", () => {
    const result = fooAssemblyEntity.getValueAtStage(7)
    const expected = { ...entity, override_stack_size: 3 }
    delete expected.filter_mode

    assert.same(expected, result)
  })

  test("getPropAtStage", () => {
    assert.same([1, 2], fooAssemblyEntity.getPropAtStage(2, "override_stack_size"))
    assert.same([2, 3], fooAssemblyEntity.getPropAtStage(3, "override_stack_size"))
    assert.same([2, 3], fooAssemblyEntity.getPropAtStage(4, "override_stack_size"))
    assert.same([3, 5], fooAssemblyEntity.getPropAtStage(5, "override_stack_size"))
    assert.same([3, 5], fooAssemblyEntity.getPropAtStage(6, "override_stack_size"))

    assert.same([1, 2], fooAssemblyEntity.getPropAtStage(1, "override_stack_size"))

    assert.same([nil, 2], fooAssemblyEntity.getPropAtStage(2, "filter_mode"))
    assert.same(["blacklist", 3], fooAssemblyEntity.getPropAtStage(3, "filter_mode"))
    assert.same(["blacklist", 3], fooAssemblyEntity.getPropAtStage(4, "filter_mode"))
    assert.same(["blacklist", 3], fooAssemblyEntity.getPropAtStage(5, "filter_mode"))
    assert.same(["blacklist", 3], fooAssemblyEntity.getPropAtStage(6, "filter_mode"))
    assert.same([nil, 7], fooAssemblyEntity.getPropAtStage(7, "filter_mode"))
    assert.same([nil, 7], fooAssemblyEntity.getPropAtStage(8, "filter_mode"))

    assert.same([nil, 2], fooAssemblyEntity.getPropAtStage(1, "filter_mode"))
  })

  test("getNameAtStage ", () => {
    fooAssemblyEntity._applyDiffAtStage(4, { name: "stack-filter-inserter" })
    assert.same("filter-inserter", fooAssemblyEntity.getNameAtStage(1))
    assert.same("filter-inserter", fooAssemblyEntity.getNameAtStage(2))
    assert.same("filter-inserter", fooAssemblyEntity.getNameAtStage(3))
    assert.same("stack-filter-inserter", fooAssemblyEntity.getNameAtStage(4))
    assert.same("stack-filter-inserter", fooAssemblyEntity.getNameAtStage(5))
  })
})

test("iterateValues", () => {
  const expected = []
  for (let stage = 1; stage <= 6; stage++) {
    expected[stage] = fooAssemblyEntity.getValueAtStage(stage) ?? "nil"
  }
  const result = []
  for (const [stage, entity] of fooAssemblyEntity.iterateValues(1, 6)) {
    result[stage] = entity == nil ? "nil" : shallowCopy(entity)
  }
  assert.same(expected, result)
})

describe("adjustValueAtStage", () => {
  test("can set first value", () => {
    const newEntity = { ...entity, override_stack_size: 3 }
    fooAssemblyEntity.adjustValueAtStage(2, newEntity)
    assert.same(newEntity, fooAssemblyEntity.firstValue)
  })

  test("removes no longer effectual diffs after set at first value", () => {
    const assemblyEntity = createAssemblyEntity(entity, Pos(0, 0), nil, 1)
    assemblyEntity._applyDiffAtStage(3, { override_stack_size: 3 })
    assemblyEntity.adjustValueAtStage(1, { ...entity, override_stack_size: 3 })
    assert.same({ ...entity, override_stack_size: 3 }, assemblyEntity.firstValue)
    assert.false(assemblyEntity.hasStageDiff())
  })

  test("creates diff if set at higher stage", () => {
    const assemblyEntity = createAssemblyEntity(entity, Pos(0, 0), nil, 1)
    assemblyEntity.adjustValueAtStage(2, { ...entity, override_stack_size: 3 })
    assert.same(entity, assemblyEntity.firstValue)
    assert.true(assemblyEntity.hasStageDiff())
    assert.same({ ...entity, override_stack_size: 3 }, assemblyEntity.getValueAtStage(2))
  })

  test("removes diff entirely if matches lower stage", () => {
    assert.true(fooAssemblyEntity.hasStageDiff(3))
    fooAssemblyEntity.adjustValueAtStage(3, fooAssemblyEntity.firstValue)
    assert.false(fooAssemblyEntity.hasStageDiff(3))
  })

  test("complex case", () => {
    const firstValue = { name: "test", a: 1, b: 1, c: 1 }
    const value2 = { ...firstValue, b: 2, c: 2 }
    const newValue2 = { ...firstValue, a: 2, b: 1, c: 5 }
    const value3 = { ...firstValue, a: 2, b: 2, c: 5 }
    const assemblyEntity = createAssemblyEntity(firstValue, Pos(0, 0), nil, 1)
    assemblyEntity.adjustValueAtStage(2, value2)
    assert.same(firstValue, assemblyEntity.firstValue)
    assert.same(value2, assemblyEntity.getValueAtStage(2))
    assemblyEntity.adjustValueAtStage(3, value3)
    assert.same(firstValue, assemblyEntity.firstValue)
    assert.same(value2, assemblyEntity.getValueAtStage(2))
    assert.same(value3, assemblyEntity.getValueAtStage(3))
    assemblyEntity.adjustValueAtStage(2, newValue2)
    assert.same(firstValue, assemblyEntity.firstValue)
    assert.same(newValue2, assemblyEntity.getValueAtStage(2))
    const newValue3 = { ...value3, b: 1 } // due to change in newValue2
    assert.same(newValue3, assemblyEntity.getValueAtStage(3))
    assert.same(getEntityDiff(newValue2, newValue3), assemblyEntity.getStageDiff(3), "diff trimmed")
  })
})

describe("setPropAtStage", () => {
  test("can set first value", () => {
    assert.true(fooAssemblyEntity.setPropAtStage(2, "override_stack_size", 3))
    assert.same({ ...entity, override_stack_size: 3 }, fooAssemblyEntity.firstValue)
  })

  test("returns false if no change", () => {
    assert.false(fooAssemblyEntity.setPropAtStage(2, "override_stack_size", 1))
  })

  test("removes no longer effectual diffs after set at first value", () => {
    const assemblyEntity = createAssemblyEntity(entity, Pos(0, 0), nil, 1)
    assemblyEntity._applyDiffAtStage(3, { override_stack_size: 3 })
    assemblyEntity._applyDiffAtStage(4, { override_stack_size: 4 })
    assert.true(assemblyEntity.setPropAtStage(1, "override_stack_size", 3))
    assert.same({ ...entity, override_stack_size: 3 }, assemblyEntity.firstValue)
    assert.false(assemblyEntity.hasStageDiff(3))
  })

  test("creates diff if set at higher stage", () => {
    const assemblyEntity = createAssemblyEntity(entity, Pos(0, 0), nil, 1)
    assert.true(assemblyEntity.setPropAtStage(3, "override_stack_size", 3))
    assert.same(entity, assemblyEntity.firstValue)
    assert.true(assemblyEntity.hasStageDiff(3))
    assert.same({ ...entity, override_stack_size: 3 }, assemblyEntity.getValueAtStage(3))
  })
})

describe("moving stage diff props", () => {
  test("resetValue removes stage diff", () => {
    const assemblyEntity = createAssemblyEntity(entity, Pos(0, 0), nil, 1)
    assemblyEntity._applyDiffAtStage(3, { override_stack_size: 3 })
    assert.true(assemblyEntity.resetValue(3))
    assert.same(entity, assemblyEntity.getValueAtStage(3))
    assert.false(assemblyEntity.hasStageDiff())
  })
  test("returns false if no diff", () => {
    const assemblyEntity = createAssemblyEntity(entity, Pos(0, 0), nil, 1)
    assemblyEntity._applyDiffAtStage(4, { override_stack_size: 3 })
    assert.false(assemblyEntity.resetValue(3))
  })

  test("moveDiffDown can apply to first value", () => {
    const assemblyEntity = createAssemblyEntity(entity, Pos(0, 0), nil, 1)
    assemblyEntity._applyDiffAtStage(3, { override_stack_size: 3 })
    assert.equal(1, assemblyEntity.moveValueDown(3))
    assert.same({ ...entity, override_stack_size: 3 }, assemblyEntity.firstValue)
    assert.false(assemblyEntity.hasStageDiff())
  })
  test("moveDiffDown can apply to next lower stage with diff", () => {
    const assemblyEntity = createAssemblyEntity(entity, Pos(0, 0), nil, 1)
    assemblyEntity._applyDiffAtStage(3, { override_stack_size: 3 })
    assemblyEntity._applyDiffAtStage(4, { override_stack_size: 4 })
    assert.equal(3, assemblyEntity.moveValueDown(4))
    assert.same({ ...entity, override_stack_size: 4 }, assemblyEntity.getValueAtStage(3))
    assert.false(assemblyEntity.hasStageDiff(4))
  })

  test("moveDiffDown returns nil if no diff", () => {
    const assemblyEntity = createAssemblyEntity(entity, Pos(0, 0), nil, 1)
    assemblyEntity._applyDiffAtStage(4, { override_stack_size: 3 })
    assert.nil(assemblyEntity.moveValueDown(3))
  })

  test("resetProp removes prop from stage diff", () => {
    const assemblyEntity = createAssemblyEntity(entity, Pos(0, 0), nil, 2)
    // is override_stack_size at stage 2
    assemblyEntity._applyDiffAtStage(3, { override_stack_size: 3 })
    assemblyEntity.resetProp(3, "override_stack_size")
    assert.same(entity, assemblyEntity.getValueAtStage(3))
    assert.false(assemblyEntity.hasStageDiff())
  })

  test("resetProp returns false if no diff", () => {
    const assemblyEntity = createAssemblyEntity(entity, Pos(0, 0), nil, 1)
    assemblyEntity._applyDiffAtStage(3, { filter_mode: "whitelist" })
    assert.false(assemblyEntity.resetProp(3, "override_stack_size"))
    assert.same({ ...entity, filter_mode: "whitelist" }, assemblyEntity.getValueAtStage(3))
  })

  test("resetProp can get from next lower stage with diff", () => {
    const assemblyEntity = createAssemblyEntity(entity, Pos(0, 0), nil, 2)
    assemblyEntity._applyDiffAtStage(3, { override_stack_size: 3 })
    assemblyEntity._applyDiffAtStage(4, { override_stack_size: 4 })
    assemblyEntity.resetProp(4, "override_stack_size")
    assert.same({ ...entity, override_stack_size: 3 }, assemblyEntity.getValueAtStage(4))
    assert.true(assemblyEntity.hasStageDiff(3))
    assert.false(assemblyEntity.hasStageDiff(4))
  })

  test("movePropDown can apply a diff to first stage", () => {
    const assemblyEntity = createAssemblyEntity(entity, Pos(0, 0), nil, 2)
    assemblyEntity._applyDiffAtStage(3, { override_stack_size: 3 })
    assert.equal(2, assemblyEntity.movePropDown(3, "override_stack_size"))
    assert.same({ ...entity, override_stack_size: 3 }, assemblyEntity.getValueAtStage(2))
    assert.false(assemblyEntity.hasStageDiff())
  })

  test("movePropDown can apply a diff to next lower stage with diff", () => {
    const assemblyEntity = createAssemblyEntity(entity, Pos(0, 0), nil, 2)
    assemblyEntity._applyDiffAtStage(3, { override_stack_size: 3 })
    assemblyEntity._applyDiffAtStage(4, { override_stack_size: 4 })
    assert.equal(3, assemblyEntity.movePropDown(4, "override_stack_size"))
    assert.same({ ...entity, override_stack_size: 4 }, assemblyEntity.getValueAtStage(3))
    assert.true(assemblyEntity.hasStageDiff(3))
    assert.false(assemblyEntity.hasStageDiff(4))
  })
})

describe("move to stage", () => {
  test("move down", () => {
    fooAssemblyEntity.moveToStage(1)
    assert.same(entity, fooAssemblyEntity.firstValue)
    assert.equal(1, fooAssemblyEntity.firstStage)
  })

  test("moving up", () => {
    const valueAt5 = fooAssemblyEntity.getValueAtStage(5)
    fooAssemblyEntity.moveToStage(5)
    assert.same(valueAt5, fooAssemblyEntity.firstValue)
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
    assert.nil(assemblyEntity.getWorldEntity(1))
    assert.nil(assemblyEntity.getWorldEntity(2))
    assemblyEntity.replaceWorldEntity(1, entity)
    assert.same(entity, assemblyEntity.getWorldEntity(1))
    assert.nil(assemblyEntity.getWorldEntity(2))
    assemblyEntity.replaceWorldEntity(2, entity)
    assert.same(entity, assemblyEntity.getWorldEntity(1))
    assert.same(entity, assemblyEntity.getWorldEntity(2))
  })

  test("getWorldEntity returns nil if is a preview entity", () => {
    assemblyEntity.replaceWorldOrPreviewEntity(1, previewEntity)
    assert.nil(assemblyEntity.getWorldEntity(1))
    assert.equal(previewEntity, assemblyEntity.getWorldOrPreviewEntity(1))
  })

  test("destroyWorldOrPreviewEntity", () => {
    assemblyEntity.replaceWorldEntity(1, entity)
    assemblyEntity.destroyWorldOrPreviewEntity(1)
    assert.false(entity.valid)
    assert.nil(assemblyEntity.getWorldEntity(1))
  })

  test("replace with nil destroys the entity", () => {
    assemblyEntity.replaceWorldEntity(1, entity)
    assemblyEntity.replaceWorldEntity(1, nil)
    assert.false(entity.valid)
    assert.nil(assemblyEntity.getWorldEntity(1))
  })

  test("replace world entity deletes old entity", () => {
    assemblyEntity.replaceWorldEntity(1, entity)
    const newEntity = surfaces[0].create_entity({ name: "iron-chest", position: Pos(1.5, 1.5) })!
    assemblyEntity.replaceWorldEntity(1, newEntity)
    assert.false(entity.valid)
    assert.same(newEntity, assemblyEntity.getWorldEntity(1))
  })

  test("replace world entity does not delete if same entity", () => {
    assemblyEntity.replaceWorldEntity(1, entity)
    assemblyEntity.replaceWorldEntity(1, entity)
    assert.true(entity.valid)
    assert.same(entity, assemblyEntity.getWorldEntity(1))
  })

  test("get world entity returns nil if entity becomes invalid", () => {
    assemblyEntity.replaceWorldEntity(1, entity)
    entity.destroy()
    assert.nil(assemblyEntity.getWorldEntity(1))
  })

  test("destroyAllWorldOrPreviewEntities", () => {
    assemblyEntity.replaceWorldOrPreviewEntity(1, entity)
    assemblyEntity.replaceWorldOrPreviewEntity(2, previewEntity)
    assemblyEntity.destroyAllWorldOrPreviewEntities()
    assert.false(entity.valid)
    assert.false(previewEntity.valid)
    assert.nil(assemblyEntity.getWorldEntity(1))
    assert.nil(assemblyEntity.getWorldEntity(2))
  })

  test("hasWorldEntityInRange", () => {
    assert.false(assemblyEntity.hasWorldEntityInRange(1, 2))
    assemblyEntity.replaceWorldEntity(2, entity)
    assemblyEntity.replaceWorldEntity(5, entity)
    assert.false(assemblyEntity.hasWorldEntityInRange(1, 1))
    assert.true(assemblyEntity.hasWorldEntityInRange(1, 3))
    assert.false(assemblyEntity.hasWorldEntityInRange(3, 4))
    assert.true(assemblyEntity.hasWorldEntityInRange(3, 5))
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
    assert.nil(assemblyEntity.getExtraEntity(type, 1))
    assert.nil(assemblyEntity.getExtraEntity(type, 2))
    assemblyEntity.replaceExtraEntity(type, 1, entity)
    assert.same(entity, assemblyEntity.getExtraEntity(type, 1))
    assert.nil(assemblyEntity.getExtraEntity(type, 2))
    assemblyEntity.replaceExtraEntity(type, 2, entity)
    assert.same(entity, assemblyEntity.getExtraEntity(type, 1))
    assert.same(entity, assemblyEntity.getExtraEntity(type, 2))
  })

  test("destroyExtraEntity", () => {
    assemblyEntity.replaceExtraEntity(type, 1, entity)
    assemblyEntity.destroyExtraEntity(type, 1)
    assert.false(entity.valid)
    assert.nil(assemblyEntity.getExtraEntity(type, 1))
  })

  test("replace with nil destroys the entity", () => {
    assemblyEntity.replaceExtraEntity(type, 1, entity)
    assemblyEntity.replaceExtraEntity(type, 1, nil)
    assert.false(entity.valid)
    assert.nil(assemblyEntity.getExtraEntity(type, 1))
  })

  test("replace extra entity deletes old entity", () => {
    assemblyEntity.replaceExtraEntity(type, 1, entity)
    const newEntity = simpleMock<LuaEntity>({ name: "test", position: Pos(0, 0) })
    assemblyEntity.replaceExtraEntity(type, 1, newEntity)
    assert.false(entity.valid)
    assert.same(newEntity, assemblyEntity.getExtraEntity(type, 1))
  })

  test("replace extra entity does not delete if same entity", () => {
    assemblyEntity.replaceExtraEntity(type, 1, entity)
    assemblyEntity.replaceExtraEntity(type, 1, entity)
    assert.true(entity.valid)
    assert.same(entity, assemblyEntity.getExtraEntity(type, 1))
  })

  test("get extra entity returns nil if entity becomes invalid", () => {
    assemblyEntity.replaceExtraEntity(type, 1, entity)
    entity.destroy()
    assert.nil(assemblyEntity.getExtraEntity(type, 1))
  })

  test("destroyAllExtraEntities", () => {
    assemblyEntity.replaceExtraEntity(type, 1, entity)
    assemblyEntity.destroyAllExtraEntities(type)
    assert.false(entity.valid)
    assert.nil(assemblyEntity.getExtraEntity(type, 1))
  })
})

describe("rolling stock", () => {
  test("rolling stock only appears in its first stage", () => {
    const assemblyEntity = createAssemblyEntity({ name: "cargo-wagon" }, Pos(0, 0), nil, 2)
    assert.nil(assemblyEntity.getValueAtStage(1))
    assert.same(assemblyEntity.firstValue, assemblyEntity.getValueAtStage(2))
    assert.nil(assemblyEntity.getValueAtStage(3))

    assert.true(assemblyEntity.inFirstStageOnly())
  })
  test("cannot apply stage diffs to rolling stock beyond first stage", () => {
    const assemblyEntity = createAssemblyEntity({ name: "cargo-wagon" } as RollingStockEntity, Pos(0, 0), nil, 1)
    const adjusted = assemblyEntity.adjustValueAtStage(1, { name: "cargo-wagon", items: { foo: 1 } })
    assert.true(adjusted)
    const adjusted2 = assemblyEntity.adjustValueAtStage(2, { name: "cargo-wagon", items: { foo: 2 } })
    assert.false(adjusted2)
    assert.same(assemblyEntity.firstValue, assemblyEntity.getValueAtStage(1))
  })
  test("apply stage diff ignores orientation changes", () => {
    const assemblyEntity = createAssemblyEntity({ name: "cargo-wagon", orientation: 0.25 }, Pos(0, 0), nil, 1)
    const adjusted = assemblyEntity.adjustValueAtStage(1, { ...assemblyEntity.firstValue, orientation: 0.5 })
    assert.false(adjusted)
    assert.equal(0.25, assemblyEntity.firstValue.orientation)
  })
  test("cannot apply upgrade to rolling stock", () => {
    const assemblyEntity = createAssemblyEntity({ name: "cargo-wagon" }, Pos(0, 0), nil, 1)
    const adjusted = assemblyEntity.applyUpgradeAtStage(1, "cargo-wagon-2")
    assert.false(adjusted)
    assert.equal("cargo-wagon", assemblyEntity.getNameAtStage(1))
  })
  test("setting a rolling stock world entity will register it in entity-registration", () => {
    const rollingStock = createRollingStock()

    fooAssemblyEntity.replaceWorldEntity(1, rollingStock)
    const found = getRegisteredAssemblyEntity(rollingStock)
    assert.same(fooAssemblyEntity, found)
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
    assert.nil(fooAssemblyEntity.getProperty("foo", 2))
  })
  test("get and set property", () => {
    fooAssemblyEntity.setProperty("foo", 2, "bar")
    assert.equal("bar", fooAssemblyEntity.getProperty("foo", 2))
  })
  test("propertyIsSetAnywhere", () => {
    assert.false(fooAssemblyEntity.propertySetInAnyStage("foo"))
    fooAssemblyEntity.setProperty("foo", 2, "bar")
    assert.true(fooAssemblyEntity.propertySetInAnyStage("foo"))
    fooAssemblyEntity.setProperty("foo", 3, "bar")
    fooAssemblyEntity.setProperty("foo", 2, nil)
    assert.true(fooAssemblyEntity.propertySetInAnyStage("foo"))
    fooAssemblyEntity.setProperty("foo", 3, nil)
    assert.false(fooAssemblyEntity.propertySetInAnyStage("foo"))
  })
  test("clear property", () => {
    fooAssemblyEntity.setProperty("foo", 2, "bar")
    fooAssemblyEntity.setProperty("foo", 3, "bar")
    fooAssemblyEntity.clearPropertyInAllStages("foo")
    assert.nil(fooAssemblyEntity.getProperty("foo", 2))
    assert.nil(fooAssemblyEntity.getProperty("foo", 3))
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

    entity.insertStage(3)

    // all keys at 3 and above are shifted up

    assert.equal(entity.firstStage, 1)

    assert.not_nil(entity.getWorldEntity(2))
    assert.nil(entity.getWorldEntity(3))
    assert.not_nil(entity.getWorldEntity(4))

    assert.equal("bar2", entity.getProperty("foo", 2))
    assert.nil(entity.getProperty("foo", 3))
    assert.equal("bar3", entity.getProperty("foo", 4))
    assert.equal("bar4", entity.getProperty("foo", 5))

    assert.same(
      {
        2: { override_stack_size: 2 },
        3: nil,
        4: { override_stack_size: 3 },
        5: { override_stack_size: 4 },
      },
      entity.getStageDiffs(),
    )
  })

  test("insert stage before base", () => {
    const entity = createAssemblyEntity<InserterEntity>(
      {
        name: "filter-inserter",
        override_stack_size: 1,
      },
      Pos(0, 0),
      nil,
      2,
    )

    entity.insertStage(1)
    assert.equal(3, entity.firstStage)
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

    entity.deleteStage(3)

    // key 3 is deleted, all keys above it are shifted down

    assert.equal(entity.firstStage, 1)

    assert.not_nil(entity.getWorldEntity(2))
    assert.not_nil(entity.getWorldEntity(3))
    assert.nil(entity.getWorldEntity(4))

    assert.equal("bar2", entity.getProperty("foo", 2))
    assert.equal("bar4", entity.getProperty("foo", 3))
    assert.nil(entity.getProperty("foo", 4))

    assert.same(
      {
        2: { override_stack_size: 3, filter_mode: "blacklist" }, // merge of 2 and 3
        3: { override_stack_size: 4 },
      },
      entity.getStageDiffs(),
    )
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
    assert.equal(2, entity.firstStage)
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
    assert.same(value, entity.getValueAtStage(1))
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
    assert.same(value, entity.getValueAtStage(1))
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
    assert.equal("bar2", entity.getProperty("foo", 1))
    assert.equal("bar3", entity.getProperty("foo", 2))
  })
})
