/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of 100% Blueprint Planning.
 *
 * 100% Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * 100% Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with 100% Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { AssemblyEntity, createAssemblyEntity } from "../../entity/AssemblyEntity"
import { Entity } from "../../entity/Entity"
import { getEntityDiff, getNilPlaceholder } from "../../entity/stage-diff"
import { shallowCopy } from "../../lib"
import { Pos } from "../../lib/geometry"
import { entityMock } from "../simple-mock"

interface FooEntity extends Entity {
  foo1: number
  foo2?: number | nil
}

let entity: FooEntity
let assemblyEntity: AssemblyEntity<FooEntity>
before_each(() => {
  entity = {
    name: "foo",
    foo1: 1,
  }
  assemblyEntity = createAssemblyEntity(entity, Pos(0, 0), nil, 2)
  assemblyEntity._applyDiffAtStage(3, { foo1: 3, foo2: 4 })
  assemblyEntity._applyDiffAtStage(5, { foo1: 5 })
  assemblyEntity._applyDiffAtStage(7, { foo2: getNilPlaceholder() })
})

test("getters", () => {
  assert.same(2, assemblyEntity.getFirstStage())
  assert.same(entity, assemblyEntity.getFirstValue())
})

describe("getValueAtStage", () => {
  test("nil if lower than stage", () => {
    assert.nil(assemblyEntity.getValueAtStage(1))
  })

  test("getValueAtStage returns same entity if no stageDiffs", () => {
    assert.same(entity, assemblyEntity.getValueAtStage(2))
  })

  test("applies changes from one stage", () => {
    const result = assemblyEntity.getValueAtStage(3)
    assert.same({ ...entity, foo1: 3, foo2: 4 }, result)
  })

  test("applies changes from multiple stages", () => {
    const result = assemblyEntity.getValueAtStage(5)
    assert.same({ ...entity, foo1: 5, foo2: 4 }, result)
  })

  test("replaces nilPlaceholder with nil", () => {
    const result = assemblyEntity.getValueAtStage(7)
    const expected = { ...entity, foo1: 5 }
    delete expected.foo2

    assert.same(expected, result)
  })

  test("getNameAtStage ", () => {
    assemblyEntity._applyDiffAtStage(4, { name: "foo2" })
    assert.same("foo", assemblyEntity.getNameAtStage(1))
    assert.same("foo", assemblyEntity.getNameAtStage(2))
    assert.same("foo", assemblyEntity.getNameAtStage(3))
    assert.same("foo2", assemblyEntity.getNameAtStage(4))
    assert.same("foo2", assemblyEntity.getNameAtStage(5))
  })
})

test("hasStageDiffs", () => {
  const assemblyEntity = createAssemblyEntity(entity, Pos(0, 0), nil, 2)
  assert.false(assemblyEntity.hasStageDiff())
  assemblyEntity._applyDiffAtStage(3, { foo1: 3 })
  assert.true(assemblyEntity.hasStageDiff())
  assert.true(assemblyEntity.hasStageDiff(3))
  assert.false(assemblyEntity.hasStageDiff(2))
})

test("iterateValues", () => {
  const expected = []
  for (let stage = 1; stage <= 6; stage++) {
    expected[stage] = assemblyEntity.getValueAtStage(stage) ?? "nil"
  }
  const result = []
  for (const [stage, entity] of assemblyEntity.iterateValues(1, 6)) {
    result[stage] = entity === nil ? "nil" : shallowCopy(entity)
  }
  assert.same(expected, result)
})

describe("move to stage", () => {
  test("move down", () => {
    assemblyEntity.moveToStage(1)
    assert.same(entity, assemblyEntity.getFirstValue())
    assert.equal(1, assemblyEntity.getFirstStage())
  })

  test("moving up", () => {
    const valueAt5 = assemblyEntity.getValueAtStage(5)
    assemblyEntity.moveToStage(5)
    assert.same(valueAt5, assemblyEntity.getFirstValue())
  })

  test("records old stage", () => {
    assemblyEntity.moveToStage(5, true)
    assert.equal(2, assemblyEntity.getOldStage())
  })

  test("clears old stage if recordOldStage is false", () => {
    assemblyEntity.moveToStage(4, true)
    assemblyEntity.moveToStage(2)
    assert.nil(assemblyEntity.getOldStage())
  })

  test("clears old stage if same stage", () => {
    assemblyEntity.moveToStage(5)
    assemblyEntity.moveToStage(5)
    assert.nil(assemblyEntity.getOldStage())
  })

  test("clears old stage if adjustValueAtStage called at stage", () => {
    assemblyEntity.moveToStage(5, true)
    assemblyEntity.adjustValueAtStage(6, { ...entity, foo1: 6 })
    assert.nil(assemblyEntity.getOldStage())
  })
})

describe("adjustValueAtStage", () => {
  test("can set first value", () => {
    const newEntity = { ...entity, foo1: 3 }
    assemblyEntity.adjustValueAtStage(2, newEntity)
    assert.same(newEntity, assemblyEntity.getFirstValue())
  })

  test("removes no longer effectual diffs after set at first value", () => {
    const assemblyEntity = createAssemblyEntity(entity, Pos(0, 0), nil, 1)
    assemblyEntity._applyDiffAtStage(3, { foo1: 3 })
    assemblyEntity.adjustValueAtStage(1, { ...entity, foo1: 3 })
    assert.same({ ...entity, foo1: 3 }, assemblyEntity.getFirstValue())
    assert.false(assemblyEntity.hasStageDiff())
  })

  test("creates diff if set at higher stage", () => {
    const assemblyEntity = createAssemblyEntity(entity, Pos(0, 0), nil, 1)
    assemblyEntity.adjustValueAtStage(2, { ...entity, foo1: 3 })
    assert.same(entity, assemblyEntity.getFirstValue())
    assert.true(assemblyEntity.hasStageDiff())
    assert.same({ ...entity, foo1: 3 }, assemblyEntity.getValueAtStage(2))
  })

  test("removes diff entirely if matches lower stage", () => {
    assert.true(assemblyEntity.hasStageDiff(3))
    assemblyEntity.adjustValueAtStage(3, assemblyEntity.getFirstValue())
    assert.false(assemblyEntity.hasStageDiff(3))
  })

  test("complex case", () => {
    const firstValue = { name: "test", a: 1, b: 1, c: 1 }
    const value2 = { ...firstValue, b: 2, c: 2 }
    const newValue2 = { ...firstValue, a: 2, b: 1, c: 5 }
    const value3 = { ...firstValue, a: 2, b: 2, c: 5 }
    const assemblyEntity = createAssemblyEntity(firstValue, Pos(0, 0), nil, 1)
    assemblyEntity.adjustValueAtStage(2, value2)
    assert.same(firstValue, assemblyEntity.getFirstValue())
    assert.same(value2, assemblyEntity.getValueAtStage(2))
    assemblyEntity.adjustValueAtStage(3, value3)
    assert.same(firstValue, assemblyEntity.getFirstValue())
    assert.same(value2, assemblyEntity.getValueAtStage(2))
    assert.same(value3, assemblyEntity.getValueAtStage(3))
    assemblyEntity.adjustValueAtStage(2, newValue2)
    assert.same(firstValue, assemblyEntity.getFirstValue())
    assert.same(newValue2, assemblyEntity.getValueAtStage(2))
    const newValue3 = { ...value3, b: 1 } // due to change in newValue2
    assert.same(newValue3, assemblyEntity.getValueAtStage(3))
    assert.same(getEntityDiff(newValue2, newValue3), assemblyEntity._getStageDiffs()[3], "diff trimmed")
  })
})

describe("Get/set world entities", () => {
  let entity: LuaEntity
  let assemblyEntity: AssemblyEntity
  before_each(() => {
    // entity = surface.create_entity({ name: "iron-chest", position: area.bbox.left_top })!
    entity = entityMock({ name: "test", position: Pos(0, 0) })
    assemblyEntity = createAssemblyEntity({ name: entity.name }, Pos(0, 0), nil, 1)
    assert(entity)
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

  test("destroyWorldEntity", () => {
    assemblyEntity.replaceWorldEntity(1, entity)
    assemblyEntity.destroyWorldEntity(1, "mainEntity")
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
    const newEntity = entityMock({ name: "test", position: Pos(0, 0) })
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

  test("hasAnyWorldEntity", () => {
    assert.false(assemblyEntity.hasAnyWorldEntity("mainEntity"))
    assemblyEntity.replaceWorldEntity(1, entity)
    assert.true(assemblyEntity.hasAnyWorldEntity("mainEntity"))
  })
})

declare module "../../entity/AssemblyEntity" {
  export interface StageProperties {
    foo?: string
  }
}
describe("get/set properties", () => {
  test("get property when not set is nil", () => {
    assert.nil(assemblyEntity.getProperty(2, "foo"))
  })
  test("get and set property", () => {
    assemblyEntity.setProperty(2, "foo", "bar")
    assert.equal("bar", assemblyEntity.getProperty(2, "foo"))
  })
  test("propertyIsSetAnywhere", () => {
    assert.false(assemblyEntity.propertySetInAnyStage("foo"))
    assemblyEntity.setProperty(2, "foo", "bar")
    assert.true(assemblyEntity.propertySetInAnyStage("foo"))
    assemblyEntity.setProperty(3, "foo", "bar")
    assemblyEntity.setProperty(2, "foo", nil)
    assert.true(assemblyEntity.propertySetInAnyStage("foo"))
    assemblyEntity.setProperty(3, "foo", nil)
    assert.false(assemblyEntity.propertySetInAnyStage("foo"))
  })
  test("clear property", () => {
    assemblyEntity.setProperty(2, "foo", "bar")
    assemblyEntity.setProperty(3, "foo", "bar")
    assemblyEntity.clearPropertyInAllStages("foo")
    assert.nil(assemblyEntity.getProperty(2, "foo"))
    assert.nil(assemblyEntity.getProperty(3, "foo"))
  })
})

test("insert stage after base", () => {
  const luaEntity = entityMock({ name: "test", position: Pos(0, 0) })
  const entity = createAssemblyEntity<FooEntity>({ name: luaEntity.name, foo1: 1 }, Pos(0, 0), nil, 1)
  entity.replaceWorldEntity(2, luaEntity)
  entity.replaceWorldEntity(3, luaEntity)
  entity.setProperty(2, "foo", "bar2")
  entity.setProperty(3, "foo", "bar3")
  entity.setProperty(4, "foo", "bar4")
  entity._applyDiffAtStage(2, { foo1: 2 })
  entity._applyDiffAtStage(3, { foo1: 3 })
  entity._applyDiffAtStage(4, { foo1: 4 })

  entity.insertStage(3)

  // all keys at 3 and above are shifted up

  assert.equal(entity.getFirstStage(), 1)

  assert.not_nil(entity.getWorldEntity(2))
  assert.nil(entity.getWorldEntity(3))
  assert.not_nil(entity.getWorldEntity(4))

  assert.equal("bar2", entity.getProperty(2, "foo"))
  assert.nil(entity.getProperty(3, "foo"))
  assert.equal("bar3", entity.getProperty(4, "foo"))
  assert.equal("bar4", entity.getProperty(5, "foo"))

  assert.same(
    {
      2: { foo1: 2 },
      3: nil,
      4: { foo1: 3 },
      5: { foo1: 4 },
    },
    entity._getStageDiffs(),
  )
})

test("insert stage before base", () => {
  const entity = createAssemblyEntity<FooEntity>({ name: "foo", foo1: 1 }, Pos(0, 0), nil, 2)

  entity.insertStage(1)
  assert.equal(3, entity.getFirstStage())
})

test("delete stage after base", () => {
  const luaEntity = entityMock({ name: "test", position: Pos(0, 0) })
  const entity = createAssemblyEntity<FooEntity>({ name: luaEntity.name, foo1: 1 }, Pos(0, 0), nil, 1)
  entity.replaceWorldEntity(2, luaEntity)
  entity.replaceWorldEntity(3, luaEntity)
  entity.replaceWorldEntity(4, luaEntity)
  entity.setProperty(2, "foo", "bar2")
  entity.setProperty(3, "foo", "bar3")
  entity.setProperty(4, "foo", "bar4")
  entity._applyDiffAtStage(2, { foo1: 2, foo2: 2 })
  entity._applyDiffAtStage(3, { foo1: 3 })
  entity._applyDiffAtStage(4, { foo1: 4 })

  entity.deleteStage(3)

  // key 3 is deleted, all keys above it are shifted down

  assert.equal(entity.getFirstStage(), 1)

  assert.not_nil(entity.getWorldEntity(2))
  assert.not_nil(entity.getWorldEntity(3))
  assert.nil(entity.getWorldEntity(4))

  assert.equal("bar2", entity.getProperty(2, "foo"))
  assert.equal("bar4", entity.getProperty(3, "foo"))
  assert.nil(entity.getProperty(4, "foo"))

  assert.same(
    {
      2: { foo1: 3, foo2: 2 }, // merge of 2 and 3
      3: { foo1: 4 },
    },
    entity._getStageDiffs(),
  )
})

test("delete stage before base", () => {
  const entity = createAssemblyEntity<FooEntity>({ name: "foo", foo1: 1 }, Pos(0, 0), nil, 3)

  entity.deleteStage(2)
  assert.equal(2, entity.getFirstStage())
})

test("delete stage right after base applies stage diffs to first entity", () => {
  const entity = createAssemblyEntity<FooEntity>({ name: "foo", foo1: 1 }, Pos(0, 0), nil, 1)
  entity._applyDiffAtStage(2, { foo1: 2 })
  const value = entity.getValueAtStage(2)

  entity.deleteStage(2)
  assert.same(value, entity.getValueAtStage(1))
})

test("delete layer 1 merges with layer 2 instead", () => {
  const entity = createAssemblyEntity<FooEntity>({ name: "foo", foo1: 1 }, Pos(0, 0), nil, 1)
  entity._applyDiffAtStage(2, { foo1: 2 })
  entity._applyDiffAtStage(3, { foo1: 3 })

  const value = entity.getValueAtStage(2)
  entity.deleteStage(2)
  assert.same(value, entity.getValueAtStage(1))
})

test("delete layer 1 sets layer 1 properties to layer 2 properties", () => {
  const entity = createAssemblyEntity<FooEntity>({ name: "foo", foo1: 1 }, Pos(0, 0), nil, 1)
  entity.setProperty(1, "foo", "bar1")
  entity.setProperty(2, "foo", "bar2")
  entity.setProperty(3, "foo", "bar3")

  entity.deleteStage(1)
  assert.equal("bar2", entity.getProperty(1, "foo"))
  assert.equal("bar3", entity.getProperty(2, "foo"))
})
