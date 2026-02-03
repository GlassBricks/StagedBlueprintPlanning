// Copyright (c) 2022-2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { LuaEntity, ScriptRaisedBuiltEvent, ScriptRaisedDestroyEvent } from "factorio:runtime"
import expect from "tstl-expect"
import { Entity } from "../../entity/Entity"
import { InternalProjectEntity, newProjectEntity } from "../../entity/ProjectEntity"
import { getRegisteredProjectEntity, registerEntity } from "../../entity/registration"
import { getEntityDiff } from "../../entity/stage-diff"
import { deepCompare, deepCopy, Events, shallowCopy } from "../../lib"
import { Pos } from "../../lib/geometry"
import { getNilPlaceholder } from "../../utils/diff-value"

import { createRollingStock } from "./createRollingStock"

interface InserterEntity extends Entity {
  name: "fast-inserter" | "bulk-inserter"

  override_stack_size?: number
  filter_mode?: "whitelist" | "blacklist"
}

let events: (ScriptRaisedBuiltEvent | ScriptRaisedDestroyEvent)[] = []
let running = false
before_each(() => {
  events = []
  running = true
})
after_each(() => {
  running = false
})
Events.script_raised_built((e) => {
  if (running) events.push(e)
})
Events.script_raised_destroy((e) => {
  if (running) {
    events.push({
      name: e.name,
      entity: {
        name: e.entity.name,
        position: e.entity.position,
        direction: e.entity.direction,
      } as LuaEntity,
      mod_name: e.mod_name,
      tick: e.tick,
    })
  }
})

let entity: InserterEntity
let projectEntity: InternalProjectEntity<InserterEntity>
before_each(() => {
  entity = {
    name: "fast-inserter",
    override_stack_size: 1,
  }
  projectEntity = newProjectEntity(entity, Pos(0, 0), 0, 2)
  projectEntity._applyDiffAtStage(3, { override_stack_size: 2, filter_mode: "blacklist" })
  projectEntity._applyDiffAtStage(5, { override_stack_size: 3 })
  projectEntity._applyDiffAtStage(7, { filter_mode: getNilPlaceholder() })
  projectEntity.setUnstagedValue(3, { _forTest: 3 })
  projectEntity.setUnstagedValue(5, { _forTest: 5 })
  projectEntity.setUnstagedValue(7, { _forTest: 7 })
})

test("returns correct values from getters", () => {
  expect(projectEntity.firstStage).toEqual(2)
  expect(projectEntity.firstValue).toEqual(entity)
  expect(projectEntity.direction).toEqual(0) // nil <=> 0
})

test("defaults lastStage to nil when not set", () => {
  expect(projectEntity.lastStage).toBeNil()
})

test("isInStage", () => {
  projectEntity.setLastStageUnchecked(4)
  expect(projectEntity.isInStage(1)).toBe(false)
  expect(projectEntity.isInStage(2)).toBe(true)
  expect(projectEntity.isInStage(3)).toBe(true)
  expect(projectEntity.isInStage(4)).toBe(true)
  expect(projectEntity.isInStage(5)).toBe(false)
  expect(projectEntity.isInStage(6)).toBe(false)
})

test("isPastLastStage", () => {
  projectEntity.setLastStageUnchecked(4)
  expect(projectEntity.isPastLastStage(3)).toBe(false)
  expect(projectEntity.isPastLastStage(4)).toBe(false)
  expect(projectEntity.isPastLastStage(5)).toBe(true)
  expect(projectEntity.isPastLastStage(6)).toBe(true)

  projectEntity.setLastStageUnchecked(nil)
  expect(projectEntity.isPastLastStage(4)).toBe(false)
  expect(projectEntity.isPastLastStage(5)).toBe(false)
  expect(projectEntity.isPastLastStage(6)).toBe(false)
})

test("isRollingStock", () => {
  expect(projectEntity.isMovable()).toBe(false)
  const projectEntity2 = newProjectEntity({ name: "locomotive" }, Pos(0, 0), 0, 2)
  expect(projectEntity2.isMovable()).toBe(true)
})

test("isUndergroundBelt", () => {
  expect(projectEntity.isUndergroundBelt()).toBe(false)
  const projectEntity2 = newProjectEntity({ name: "underground-belt" }, Pos(0, 0), 0, 2)
  expect(projectEntity2.isUndergroundBelt()).toBe(true)
})

test("hasStageDiff", () => {
  const projectEntity = newProjectEntity(entity, Pos(0, 0), 0, 2)
  expect(projectEntity.hasStageDiff()).toBe(false)
  projectEntity._applyDiffAtStage(3, { override_stack_size: 3 })
  expect(projectEntity.hasStageDiff()).toBe(true)
  expect(projectEntity.hasStageDiff(3)).toBe(true)
  expect(projectEntity.hasStageDiff(2)).toBe(false)
})

test("getStageDiff", () => {
  const projectEntity = newProjectEntity(entity, Pos(0, 0), 0, 2)
  expect(projectEntity.getStageDiff(3)).toBeNil()
  projectEntity._applyDiffAtStage(3, { override_stack_size: 3 })
  expect(projectEntity.getStageDiff(3)).toEqual({ override_stack_size: 3 })
})
test("getNextStageDiffForProp", () => {
  const projectEntity = newProjectEntity(entity, Pos(0, 0), 0, 2)
  expect(projectEntity.getFirstStageDiffForProp("override_stack_size")).toEqual([])
  projectEntity._applyDiffAtStage(4, { override_stack_size: 3 })
  expect(projectEntity.getFirstStageDiffForProp("override_stack_size")).toEqual([4, 3])
})

test("nextStageWithDiff", () => {
  const projectEntity = newProjectEntity(entity, Pos(0, 0), 0, 2)
  projectEntity._applyDiffAtStage(3, { override_stack_size: 3 })
  projectEntity._applyDiffAtStage(5, { override_stack_size: 5 })
  expect(projectEntity.nextStageWithDiff(2)).toBe(3)
  expect(projectEntity.nextStageWithDiff(3)).toBe(5)
  expect(projectEntity.nextStageWithDiff(4)).toBe(5)
  expect(projectEntity.nextStageWithDiff(5)).toBe(nil)
})

test("prevStageWithDiff", () => {
  const projectEntity = newProjectEntity(entity, Pos(0, 0), 0, 2)
  projectEntity._applyDiffAtStage(3, { override_stack_size: 3 })
  projectEntity._applyDiffAtStage(5, { override_stack_size: 5 })
  expect(projectEntity.prevStageWithDiff(6)).toBe(5)
  expect(projectEntity.prevStageWithDiff(5)).toBe(3)
  expect(projectEntity.prevStageWithDiff(4)).toBe(3)
  expect(projectEntity.prevStageWithDiff(3)).toBe(nil)
  expect(projectEntity.prevStageWithDiff(2)).toBe(nil)
})

describe("getValueAtStage", () => {
  test("nil if lower than stage", () => {
    expect(projectEntity.getValueAtStage(1)).toBeNil()
  })

  test("getValueAtStage returns same entity if no stageDiffs", () => {
    expect(projectEntity.getValueAtStage(2)).toEqual(entity)
  })

  test("applies changes from one stage", () => {
    const result = projectEntity.getValueAtStage(3)
    expect(result).toEqual({ ...entity, override_stack_size: 2, filter_mode: "blacklist" })
  })

  test("applies changes from multiple stages", () => {
    const result = projectEntity.getValueAtStage(5)
    expect(result).toEqual({ ...entity, override_stack_size: 3, filter_mode: "blacklist" })
  })

  test("replaces nilPlaceholder with nil", () => {
    const result = projectEntity.getValueAtStage(7)
    const expected = { ...entity, override_stack_size: 3 }
    delete expected.filter_mode

    expect(result).toEqual(expected)
  })

  test("getPropAtStage", () => {
    expect(projectEntity.getPropAtStage(2, "override_stack_size")).toEqual([1, 2])
    expect(projectEntity.getPropAtStage(3, "override_stack_size")).toEqual([2, 3])
    expect(projectEntity.getPropAtStage(4, "override_stack_size")).toEqual([2, 3])
    expect(projectEntity.getPropAtStage(5, "override_stack_size")).toEqual([3, 5])
    expect(projectEntity.getPropAtStage(6, "override_stack_size")).toEqual([3, 5])

    expect(projectEntity.getPropAtStage(1, "override_stack_size")).toEqual([1, 2])

    expect(projectEntity.getPropAtStage(2, "filter_mode")).toEqual([nil, 2])
    expect(projectEntity.getPropAtStage(3, "filter_mode")).toEqual(["blacklist", 3])
    expect(projectEntity.getPropAtStage(4, "filter_mode")).toEqual(["blacklist", 3])
    expect(projectEntity.getPropAtStage(5, "filter_mode")).toEqual(["blacklist", 3])
    expect(projectEntity.getPropAtStage(6, "filter_mode")).toEqual(["blacklist", 3])
    expect(projectEntity.getPropAtStage(7, "filter_mode")).toEqual([nil, 7])
    expect(projectEntity.getPropAtStage(8, "filter_mode")).toEqual([nil, 7])

    expect(projectEntity.getPropAtStage(1, "filter_mode")).toEqual([nil, 2])
  })

  test("getNameAtStage ", () => {
    projectEntity._applyDiffAtStage(4, { name: "bulk-inserter" })
    projectEntity._applyDiffAtStage(3, { quality: "uncommon" })
    expect(projectEntity.getUpgradeAtStage(1)).toEqual({ name: "fast-inserter" })
    expect(projectEntity.getUpgradeAtStage(2)).toEqual({ name: "fast-inserter" })
    expect(projectEntity.getUpgradeAtStage(3)).toEqual({ name: "fast-inserter", quality: "uncommon" })
    expect(projectEntity.getUpgradeAtStage(4)).toEqual({ name: "bulk-inserter", quality: "uncommon" })
    expect(projectEntity.getUpgradeAtStage(5)).toEqual({ name: "bulk-inserter", quality: "uncommon" })
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
    expect(result).toEqual(expected)
  })
})
test("iterateValues returns nothing if end > start", () => {
  const result = []
  for (const [stage, entity] of projectEntity.iterateValues(4, 2)) {
    result[stage] = entity
  }
  expect(result).toEqual([])
})

describe("adjustValueAtStage", () => {
  test("can set first value", () => {
    const newEntity = { ...entity, override_stack_size: 3 }
    projectEntity.adjustValueAtStage(2, newEntity)
    expect(projectEntity.firstValue).toEqual(newEntity)
  })

  test("removes no longer effectual diffs after set at first value", () => {
    const projectEntity = newProjectEntity(entity, Pos(0, 0), 0, 1)
    projectEntity._applyDiffAtStage(3, { override_stack_size: 3 })
    projectEntity.adjustValueAtStage(1, { ...entity, override_stack_size: 3 })
    expect(projectEntity.firstValue).toEqual({ ...entity, override_stack_size: 3 })
    expect(projectEntity.hasStageDiff()).toBe(false)
  })

  test("creates diff if set at higher stage", () => {
    const projectEntity = newProjectEntity(entity, Pos(0, 0), 0, 1)
    projectEntity.adjustValueAtStage(2, { ...entity, override_stack_size: 3 })
    expect(projectEntity.firstValue).toEqual(entity)
    expect(projectEntity.hasStageDiff()).toBe(true)
    expect(projectEntity.getValueAtStage(2)).toEqual({ ...entity, override_stack_size: 3 })
  })

  test("removes diff entirely if matches lower stage", () => {
    expect(projectEntity.hasStageDiff(3)).toBe(true)
    projectEntity.adjustValueAtStage(3, projectEntity.firstValue)
    expect(projectEntity.hasStageDiff(3)).toBe(false)
  })

  test("complex case", () => {
    const firstValue = { name: "test", a: 1, b: 1, c: 1 }
    const value2 = { ...firstValue, b: 2, c: 2 }
    const newValue2 = { ...firstValue, a: 2, b: 1, c: 5 }
    const value3 = { ...firstValue, a: 2, b: 2, c: 5 }
    const projectEntity = newProjectEntity(firstValue, Pos(0, 0), 0, 1)
    projectEntity.adjustValueAtStage(2, value2)
    expect(projectEntity.firstValue).toEqual(firstValue)
    expect(projectEntity.getValueAtStage(2)).toEqual(value2)
    projectEntity.adjustValueAtStage(3, value3)
    expect(projectEntity.firstValue).toEqual(firstValue)
    expect(projectEntity.getValueAtStage(2)).toEqual(value2)
    expect(projectEntity.getValueAtStage(3)).toEqual(value3)
    projectEntity.adjustValueAtStage(2, newValue2)
    expect(projectEntity.firstValue).toEqual(firstValue)
    expect(projectEntity.getValueAtStage(2)).toEqual(newValue2)
    const newValue3 = { ...value3, b: 1 } // due to change in newValue2
    expect(projectEntity.getValueAtStage(3)).toEqual(newValue3)
    expect(projectEntity.getStageDiff(3)).toEqual(getEntityDiff(newValue2, newValue3))
  })
})

describe("setPropAtStage", () => {
  test("can set first value", () => {
    expect(projectEntity.setPropAtStage(2, "override_stack_size", 3)).toBe(true)
    expect(projectEntity.firstValue).toEqual({ ...entity, override_stack_size: 3 })
  })

  test("returns false if no change", () => {
    expect(projectEntity.setPropAtStage(2, "override_stack_size", 1)).toBe(false)
  })

  test("removes no longer effectual diffs after set at first value", () => {
    const projectEntity = newProjectEntity(entity, Pos(0, 0), 0, 1)
    projectEntity._applyDiffAtStage(3, { override_stack_size: 3 })
    projectEntity._applyDiffAtStage(4, { override_stack_size: 4 })
    expect(projectEntity.setPropAtStage(1, "override_stack_size", 3)).toBe(true)
    expect(projectEntity.firstValue).toEqual({ ...entity, override_stack_size: 3 })
    expect(projectEntity.hasStageDiff(3)).toBe(false)
  })

  test("creates diff if set at higher stage", () => {
    const projectEntity = newProjectEntity(entity, Pos(0, 0), 0, 1)
    expect(projectEntity.setPropAtStage(3, "override_stack_size", 3)).toBe(true)
    expect(projectEntity.firstValue).toEqual(entity)
    expect(projectEntity.hasStageDiff(3)).toBe(true)
    expect(projectEntity.getValueAtStage(3)).toEqual({ ...entity, override_stack_size: 3 })
  })
})

describe("moving stage diff props", () => {
  test("resetValue removes stage diff", () => {
    const projectEntity = newProjectEntity(entity, Pos(0, 0), 0, 1)
    projectEntity._applyDiffAtStage(3, { override_stack_size: 3 })
    expect(projectEntity.resetValue(3)).toBe(true)
    expect(projectEntity.getValueAtStage(3)).toEqual(entity)
    expect(projectEntity.hasStageDiff()).toBe(false)
  })
  test("returns false if no diff", () => {
    const projectEntity = newProjectEntity(entity, Pos(0, 0), 0, 1)
    projectEntity._applyDiffAtStage(4, { override_stack_size: 3 })
    expect(projectEntity.resetValue(3)).toBe(false)
  })

  test("moveDiffDown can apply to first value", () => {
    const projectEntity = newProjectEntity(entity, Pos(0, 0), 0, 1)
    projectEntity._applyDiffAtStage(3, { override_stack_size: 3 })
    expect(projectEntity.moveValueDown(3)).toBe(1)
    expect(projectEntity.firstValue).toEqual({ ...entity, override_stack_size: 3 })
    expect(projectEntity.hasStageDiff()).toBe(false)
  })
  test("moveDiffDown can apply to next lower stage with diff", () => {
    const projectEntity = newProjectEntity(entity, Pos(0, 0), 0, 1)
    projectEntity._applyDiffAtStage(3, { override_stack_size: 3 })
    projectEntity._applyDiffAtStage(4, { override_stack_size: 4 })
    expect(projectEntity.moveValueDown(4)).toBe(3)
    expect(projectEntity.getValueAtStage(3)).toEqual({ ...entity, override_stack_size: 4 })
    expect(projectEntity.hasStageDiff(4)).toBe(false)
  })

  test("moveDiffDown returns nil if no diff", () => {
    const projectEntity = newProjectEntity(entity, Pos(0, 0), 0, 1)
    projectEntity._applyDiffAtStage(4, { override_stack_size: 3 })
    expect(projectEntity.moveValueDown(3)).toBeNil()
  })

  test("resetProp removes prop from stage diff", () => {
    const projectEntity = newProjectEntity(entity, Pos(0, 0), 0, 2)
    // is override_stack_size at stage 2
    projectEntity._applyDiffAtStage(3, { override_stack_size: 3 })
    projectEntity.resetProp(3, "override_stack_size")
    expect(projectEntity.getValueAtStage(3)).toEqual(entity)
    expect(projectEntity.hasStageDiff()).toBe(false)
  })

  test("resetProp returns false if no diff", () => {
    const projectEntity = newProjectEntity(entity, Pos(0, 0), 0, 1)
    projectEntity._applyDiffAtStage(3, { filter_mode: "whitelist" })
    expect(projectEntity.resetProp(3, "override_stack_size")).toBe(false)
    expect(projectEntity.getValueAtStage(3)).toEqual({ ...entity, filter_mode: "whitelist" })
  })

  test("resetProp can get from next lower stage with diff", () => {
    const projectEntity = newProjectEntity(entity, Pos(0, 0), 0, 2)
    projectEntity._applyDiffAtStage(3, { override_stack_size: 3 })
    projectEntity._applyDiffAtStage(4, { override_stack_size: 4 })
    projectEntity.resetProp(4, "override_stack_size")
    expect(projectEntity.getValueAtStage(4)).toEqual({ ...entity, override_stack_size: 3 })
    expect(projectEntity.hasStageDiff(3)).toBe(true)
    expect(projectEntity.hasStageDiff(4)).toBe(false)
  })

  test("movePropDown can apply a diff to first stage", () => {
    const projectEntity = newProjectEntity(entity, Pos(0, 0), 0, 2)
    projectEntity._applyDiffAtStage(3, { override_stack_size: 3 })
    expect(projectEntity.movePropDown(3, "override_stack_size")).toBe(2)
    expect(projectEntity.getValueAtStage(2)).toEqual({ ...entity, override_stack_size: 3 })
    expect(projectEntity.hasStageDiff()).toBe(false)
  })

  test("movePropDown can apply a diff to next lower stage with diff", () => {
    const projectEntity = newProjectEntity(entity, Pos(0, 0), 0, 2)
    projectEntity._applyDiffAtStage(3, { override_stack_size: 3 })
    projectEntity._applyDiffAtStage(4, { override_stack_size: 4 })
    expect(projectEntity.movePropDown(4, "override_stack_size")).toBe(3)
    expect(projectEntity.getValueAtStage(3)).toEqual({ ...entity, override_stack_size: 4 })
    expect(projectEntity.hasStageDiff(3)).toBe(true)
    expect(projectEntity.hasStageDiff(4)).toBe(false)
  })
})

describe("setFirstStageUnchecked", () => {
  test("move down", () => {
    projectEntity.setFirstStageUnchecked(1)
    expect(projectEntity.firstValue).toEqual(entity)
    expect(projectEntity.firstStage).toBe(1)
  })

  test("moving up; also merges stage diffs and clears stage properties below new first stage", () => {
    projectEntity.setExcludedFromBlueprints(3, true)
    projectEntity.setExcludedFromBlueprints(5, true)
    const valueAt5 = projectEntity.getValueAtStage(5)
    projectEntity.setFirstStageUnchecked(5)
    expect(projectEntity.firstValue).toEqual(valueAt5)
    const diffs = projectEntity.stageDiffs!
    expect(next(diffs)[0]).toBe(7)
    expect(projectEntity.getUnstagedValue(3)).toBe(nil)
    expect(projectEntity.getUnstagedValue(5)).toBeAny()
    expect(projectEntity.isExcludedFromBlueprints(3)).toBe(false)
    expect(projectEntity.isExcludedFromBlueprints(5)).toBe(true)
  })

  test("cannot move past last stage", () => {
    projectEntity.setLastStageUnchecked(4)
    expect(() => projectEntity.setFirstStageUnchecked(4)).not.toError()
    expect(() => projectEntity.setFirstStageUnchecked(5)).toError()
  })

  test("if is rolling stock, setting first stage also sets last stage", () => {
    const projectEntity = newProjectEntity({ name: "locomotive" }, Pos(0, 0), 0, 2)
    projectEntity.setFirstStageUnchecked(3)
    expect(projectEntity.lastStage).toBe(3)
  })
})

describe("trySetLastStage", () => {
  test("set", () => {
    projectEntity.setLastStageUnchecked(5)
    expect(projectEntity.lastStage).toBe(5)
  })
  test("can set back to nil", () => {
    projectEntity.setLastStageUnchecked(5)
    projectEntity.setLastStageUnchecked(nil)
    expect(projectEntity.lastStage).toBe(nil)
  })
  test("cannot move below first stage", () => {
    expect(() => projectEntity.setLastStageUnchecked(0)).toError()
  })
  test("moving down deletes later stage diffs and stage properties beyond new last stage", () => {
    projectEntity.setExcludedFromBlueprints(5, true)
    projectEntity.setExcludedFromBlueprints(7, true)
    projectEntity.setLastStageUnchecked(5)
    expect(projectEntity.lastStage).toBe(5)
    const diffs = projectEntity.stageDiffs!
    expect(diffs).not.toHaveKey(7)
    expect(next(diffs)[0]).toBe(3)
    expect(projectEntity.getUnstagedValue(7)).toBeNil()
    expect(projectEntity.getUnstagedValue(5)).toBeAny()
    expect(projectEntity.isExcludedFromBlueprints(7)).toBe(false)
    expect(projectEntity.isExcludedFromBlueprints(5)).toBe(true)
  })
  test("if is rolling stock, setting last stage does nothing", () => {
    const projectEntity = newProjectEntity({ name: "locomotive" }, Pos(0, 0), 0, 2)
    projectEntity.setLastStageUnchecked(3)
    expect(projectEntity.lastStage).toBe(2)
  })
})

describe("rolling stock", () => {
  test("rolling stock only appears in its first stage", () => {
    const projectEntity = newProjectEntity({ name: "cargo-wagon" }, Pos(0, 0), 0, 2)
    expect(projectEntity.getValueAtStage(1)).toBeNil()
    expect(projectEntity.getValueAtStage(2)).toEqual(projectEntity.firstValue)
    expect(projectEntity.getValueAtStage(3)).toBeNil()

    // expect(projectEntity.inFirstStageOnly()).toBe(true)
    expect(projectEntity.lastStage).toEqual(2)
  })
  test("apply stage diff ignores orientation changes", () => {
    const projectEntity = newProjectEntity({ name: "cargo-wagon", orientation: 0.25 }, Pos(0, 0), 0, 1)
    const adjusted = projectEntity.adjustValueAtStage(1, { ...projectEntity.firstValue, orientation: 0.5 })
    expect(adjusted).toBe(false)
    expect(projectEntity.firstValue.orientation).toBe(0.25)
  })
  test("registering a rolling stock registers it in entity-registration", () => {
    const rollingStock = createRollingStock()

    registerEntity(rollingStock, projectEntity)
    const found = getRegisteredProjectEntity(rollingStock)
    expect(found).toEqual(projectEntity)
  })
})

describe("excludedFromBlueprints", () => {
  test("defaults to false", () => {
    expect(projectEntity.isExcludedFromBlueprints(2)).toBe(false)
    expect(projectEntity.isExcludedFromBlueprints(3)).toBe(false)
  })

  test("set and get", () => {
    expect(projectEntity.setExcludedFromBlueprints(2, true)).toBe(true)
    expect(projectEntity.isExcludedFromBlueprints(2)).toBe(true)
  })

  test("per-stage only", () => {
    projectEntity.setExcludedFromBlueprints(3, true)
    expect(projectEntity.isExcludedFromBlueprints(2)).toBe(false)
    expect(projectEntity.isExcludedFromBlueprints(3)).toBe(true)
    expect(projectEntity.isExcludedFromBlueprints(4)).toBe(false)
  })

  test("clearing exclusion", () => {
    projectEntity.setExcludedFromBlueprints(3, true)
    expect(projectEntity.setExcludedFromBlueprints(3, false)).toBe(true)
    expect(projectEntity.isExcludedFromBlueprints(3)).toBe(false)
  })

  test("setting same value returns false", () => {
    expect(projectEntity.setExcludedFromBlueprints(3, false)).toBe(false)
    projectEntity.setExcludedFromBlueprints(3, true)
    expect(projectEntity.setExcludedFromBlueprints(3, true)).toBe(false)
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
    expect(projectEntity.getProperty("foo", 2)).toBeNil()
  })
  test("get and set property", () => {
    projectEntity.setProperty("foo", 2, "bar")
    expect(projectEntity.getProperty("foo", 2)).toBe("bar")
  })
  test("propertyIsSetAnywhere", () => {
    expect(projectEntity.propertySetInAnyStage("foo")).toBe(false)
    projectEntity.setProperty("foo", 2, "bar")
    expect(projectEntity.propertySetInAnyStage("foo")).toBe(true)
    projectEntity.setProperty("foo", 3, "bar")
    projectEntity.setProperty("foo", 2, nil)
    expect(projectEntity.propertySetInAnyStage("foo")).toBe(true)
    projectEntity.setProperty("foo", 3, nil)
    expect(projectEntity.propertySetInAnyStage("foo")).toBe(false)
  })
  test("clear property", () => {
    projectEntity.setProperty("foo", 2, "bar")
    projectEntity.setProperty("foo", 3, "bar")
    projectEntity.clearPropertyInAllStages("foo")
    expect(projectEntity.getProperty("foo", 2)).toBeNil()
    expect(projectEntity.getProperty("foo", 3)).toBeNil()
  })
})

describe("insert/deleting stages", () => {
  test("insert stage after base", () => {
    const entity = newProjectEntity({ name: "fast-inserter", override_stack_size: 1 }, Pos(0, 0), 0, 1)
    entity.setProperty("foo", 2, "bar2")
    entity.setProperty("foo", 3, "bar3")
    entity.setProperty("foo", 4, "bar4")
    entity._applyDiffAtStage(2, { override_stack_size: 2 })
    entity._applyDiffAtStage(3, { override_stack_size: 3 })
    entity._applyDiffAtStage(4, { override_stack_size: 4 })
    entity.setLastStageUnchecked(4)

    entity.insertStage(3)

    expect(entity.firstStage).toEqual(1)
    expect(entity.lastStage).toEqual(5)

    expect(entity.getProperty("foo", 2)).toBe("bar2")
    expect(entity.getProperty("foo", 3)).toBeNil()
    expect(entity.getProperty("foo", 4)).toBe("bar3")
    expect(entity.getProperty("foo", 5)).toBe("bar4")

    expect(entity.stageDiffs).toEqual({
      2: { override_stack_size: 2 },
      3: nil,
      4: { override_stack_size: 3 },
      5: { override_stack_size: 4 },
    })
  })

  test("if inserting stage right above last stage, last stage increases", () => {
    const entity = newProjectEntity<InserterEntity>({ name: "fast-inserter" }, Pos(0, 0), 0, 2)
    entity.setLastStageUnchecked(3)

    entity.insertStage(4)
    expect(entity.lastStage).toBe(4)
  })
  test("if inserting stage well after last stage, last stage stays the same", () => {
    const entity = newProjectEntity<InserterEntity>({ name: "fast-inserter" }, Pos(0, 0), 0, 2)
    entity.setLastStageUnchecked(3)

    entity.insertStage(5)
    expect(entity.lastStage).toBe(3)
  })

  test("insert stage before firstStage", () => {
    const entity = newProjectEntity<InserterEntity>({ name: "fast-inserter" }, Pos(0, 0), 0, 2)

    entity.insertStage(1)
    expect(entity.firstStage).toBe(3)
  })

  test("persistent entity stays at stage 1 when stage inserted at front", () => {
    const entity = newProjectEntity({ name: "space-platform-hub" }, Pos(0, 0), 0, 1)

    entity.insertStage(1)
    expect(entity.firstStage).toBe(1)
    expect(entity.lastStage).toBeNil()
  })

  test("delete stage after firstStage", () => {
    const entity = newProjectEntity<InserterEntity>(
      {
        name: "fast-inserter",
        override_stack_size: 1,
      },
      Pos(0, 0),
      0,
      1,
    )
    entity.setProperty("foo", 2, "bar2")
    entity.setProperty("foo", 3, "bar3")
    entity.setProperty("foo", 4, "bar4")
    entity._applyDiffAtStage(2, { override_stack_size: 2, filter_mode: "blacklist" })
    entity._applyDiffAtStage(3, { override_stack_size: 3 })
    entity._applyDiffAtStage(4, { override_stack_size: 4 })
    entity.setLastStageUnchecked(4)

    entity.mergeStage(3)

    expect(entity.firstStage).toEqual(1)
    expect(entity.lastStage).toEqual(3)

    expect(entity.getProperty("foo", 2)).toBe("bar2")
    expect(entity.getProperty("foo", 3)).toBe("bar4")
    expect(entity.getProperty("foo", 4)).toBeNil()

    expect(entity.stageDiffs).toEqual({
      2: { override_stack_size: 3, filter_mode: "blacklist" }, // merge of 2 and 3
      3: { override_stack_size: 4 },
    })
  })

  test("delete stage before base", () => {
    const entity = newProjectEntity<InserterEntity>(
      {
        name: "fast-inserter",
        override_stack_size: 1,
      },
      Pos(0, 0),
      0,
      3,
    )

    entity.mergeStage(2)
    expect(entity.firstStage).toBe(2)
  })

  test("delete stage after last stage", () => {
    const entity = newProjectEntity<InserterEntity>(
      {
        name: "fast-inserter",
        override_stack_size: 1,
      },
      Pos(0, 0),
      0,
      3,
    )
    entity.setLastStageUnchecked(4)

    entity.mergeStage(5)
    expect(entity.lastStage).toBe(4)
  })

  test("delete stage right after base applies stage diffs to first entity", () => {
    const entity = newProjectEntity<InserterEntity>(
      {
        name: "fast-inserter",
        override_stack_size: 1,
      },
      Pos(0, 0),
      0,
      1,
    )
    entity._applyDiffAtStage(2, { override_stack_size: 2 })
    const value = entity.getValueAtStage(2)

    entity.mergeStage(2)
    expect(entity.getValueAtStage(1)).toEqual(value)
  })

  test("delete stage 1 merges with stage 2 instead", () => {
    const entity = newProjectEntity<InserterEntity>(
      {
        name: "fast-inserter",
        override_stack_size: 1,
      },
      Pos(0, 0),
      0,
      1,
    )
    entity._applyDiffAtStage(2, { override_stack_size: 2 })
    entity._applyDiffAtStage(3, { override_stack_size: 3 })

    const value = entity.getValueAtStage(2)
    entity.mergeStage(2)
    expect(entity.getValueAtStage(1)).toEqual(value)
  })

  test("delete stage 1 sets stage 1 properties to stage 2 properties", () => {
    const entity = newProjectEntity<InserterEntity>(
      {
        name: "fast-inserter",
        override_stack_size: 1,
      },
      Pos(0, 0),
      0,
      1,
    )
    expect(entity.setProperty("foo", 1, "bar1")).toBe(true)
    expect(entity.setProperty("foo", 1, "bar1")).toBe(false) // setting to same value
    expect(entity.setProperty("foo", 2, "bar2")).toBe(true)
    expect(entity.setProperty("foo", 3, "bar3")).toBe(true)

    entity.mergeStage(1)
    expect(entity.getProperty("foo", 1)).toBe("bar2")
    expect(entity.getProperty("foo", 2)).toBe("bar3")
  })
})

describe("discarding stages", () => {
  test("discards stage without merging to previous", () => {
    const entity = newProjectEntity<InserterEntity>({ name: "fast-inserter", override_stack_size: 1 }, Pos(0, 0), 0, 1)
    entity._applyDiffAtStage(2, { override_stack_size: 2, filter_mode: "blacklist" })
    entity._applyDiffAtStage(3, { override_stack_size: 3 })
    entity._applyDiffAtStage(4, { override_stack_size: 4 })

    entity.discardStage(3)

    // Stage 2 should NOT have stage 3's changes merged into it
    expect(entity.getValueAtStage(2)).toEqual({
      name: "fast-inserter",
      override_stack_size: 2,
      filter_mode: "blacklist",
    })
    // Old stage 4 becomes stage 3
    expect(entity.getValueAtStage(3)).toEqual({
      name: "fast-inserter",
      override_stack_size: 4,
      filter_mode: "blacklist",
    })
    expect(entity.stageDiffs).toEqual({
      2: { override_stack_size: 2, filter_mode: "blacklist" },
      3: { override_stack_size: 4 },
    })
  })

  test("updates firstStage when discarding earlier stage", () => {
    const entity = newProjectEntity({ name: "inserter" }, Pos(0, 0), 0, 3)
    entity.discardStage(2)
    expect(entity.firstStage).toEqual(2)
  })

  test("updates lastStage when discarding at lastStage", () => {
    const entity = newProjectEntity({ name: "inserter" }, Pos(0, 0), 0, 1)
    entity.setLastStageUnchecked(3)
    entity.discardStage(3)
    expect(entity.lastStage).toEqual(2)
  })
})

describe("unstaged values", () => {
  test("can set and get unstaged values", () => {
    const entity = newProjectEntity({ name: "iron-chest" }, Pos(0, 0), 0, 1)
    const unstagedValue = { _forTest: "test-value" }

    expect(entity.setUnstagedValue(1, unstagedValue)).toBe(true)
    expect(entity.getUnstagedValue(1)).toEqual(unstagedValue)
  })

  test("setting same unstaged value returns false", () => {
    const entity = newProjectEntity({ name: "iron-chest" }, Pos(0, 0), 0, 1)
    const unstagedValue = { _forTest: "test-value" }

    expect(entity.setUnstagedValue(1, unstagedValue)).toBe(true)
    expect(entity.setUnstagedValue(1, unstagedValue)).toBe(false)
  })

  test("can clear unstaged values", () => {
    const entity = newProjectEntity({ name: "iron-chest" }, Pos(0, 0), 0, 1)
    const unstagedValue = { _forTest: "test-value" }

    entity.setUnstagedValue(1, unstagedValue)
    expect(entity.setUnstagedValue(1, nil)).toBe(true)
    expect(entity.getUnstagedValue(1)).toBeNil()
  })

  test("clearing non-existent unstaged value returns false", () => {
    const entity = newProjectEntity({ name: "iron-chest" }, Pos(0, 0), 0, 1)
    expect(entity.setUnstagedValue(1, nil)).toBe(false)
  })

  test("newProjectEntity can be created with initial unstaged value", () => {
    const unstagedValue = { _forTest: "initial-value" }
    const entity = newProjectEntity({ name: "iron-chest" }, Pos(0, 0), 0, 1, unstagedValue)

    expect(entity.getUnstagedValue(1)).toEqual(unstagedValue)
  })
})
