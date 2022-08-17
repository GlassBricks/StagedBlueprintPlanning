/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of BBPP3.
 *
 * BBPP3 is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * BBPP3 is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with BBPP3. If not, see <https://www.gnu.org/licenses/>.
 */

import { AssemblyEntity, createAssemblyEntity } from "../../entity/AssemblyEntity"
import { getEntityDiff, getNilPlaceholder } from "../../entity/diff"
import { Entity } from "../../entity/Entity"
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
  assemblyEntity._applyDiffAtLayer(3, { foo1: 3, foo2: 4 })
  assemblyEntity._applyDiffAtLayer(5, { foo1: 5 })
  assemblyEntity._applyDiffAtLayer(7, { foo2: getNilPlaceholder() })
})

test("getters", () => {
  assert.same(2, assemblyEntity.getBaseLayer())
  assert.same(entity, assemblyEntity.getBaseValue())
})

describe("getValueAtLayer", () => {
  test("nil if lower than layer", () => {
    assert.nil(assemblyEntity.getValueAtLayer(1))
  })

  test("getValueAtLayer returns same entity if no layerChanges", () => {
    assert.same(entity, assemblyEntity.getValueAtLayer(2))
  })

  test("applies changes from one layer", () => {
    const result = assemblyEntity.getValueAtLayer(3)
    assert.same({ ...entity, foo1: 3, foo2: 4 }, result)
  })

  test("applies changes from multiple layers", () => {
    const result = assemblyEntity.getValueAtLayer(5)
    assert.same({ ...entity, foo1: 5, foo2: 4 }, result)
  })

  test("replaces nilPlaceholder with nil", () => {
    const result = assemblyEntity.getValueAtLayer(7)
    const expected = { ...entity, foo1: 5 }
    delete expected.foo2

    assert.same(expected, result)
  })

  test("getNameAtLayer ", () => {
    assemblyEntity._applyDiffAtLayer(4, { name: "foo2" })
    assert.same("foo", assemblyEntity.getNameAtLayer(1))
    assert.same("foo", assemblyEntity.getNameAtLayer(2))
    assert.same("foo", assemblyEntity.getNameAtLayer(3))
    assert.same("foo2", assemblyEntity.getNameAtLayer(4))
    assert.same("foo2", assemblyEntity.getNameAtLayer(5))
  })
})

test("hasLayerChanges", () => {
  const assemblyEntity = createAssemblyEntity(entity, Pos(0, 0), nil, 2)
  assert.false(assemblyEntity.hasLayerChange())
  assemblyEntity._applyDiffAtLayer(3, { foo1: 3 })
  assert.true(assemblyEntity.hasLayerChange())
  assert.true(assemblyEntity.hasLayerChange(3))
  assert.false(assemblyEntity.hasLayerChange(2))
})

test("iterateValues", () => {
  const expected = []
  for (let layer = 1; layer <= 6; layer++) {
    expected[layer] = assemblyEntity.getValueAtLayer(layer) ?? "nil"
  }
  const result = []
  for (const [layer, entity] of assemblyEntity.iterateValues(1, 6)) {
    result[layer] = entity === nil ? "nil" : shallowCopy(entity)
  }
  assert.same(expected, result)
})

describe("moveEntityDown", () => {
  test("with no changes", () => {
    assemblyEntity.moveDown(1)
    assert.same(entity, assemblyEntity.getBaseValue())
    assert.equal(1, assemblyEntity.getBaseLayer())
  })

  test("with new value", () => {
    assemblyEntity.moveDown(1, { ...entity, foo1: 3 })
    assert.same({ ...entity, foo1: 3 }, assemblyEntity.getBaseValue())
    assert.same({ ...entity, foo1: 3 }, assemblyEntity.getValueAtLayer(2))
    assert.equal(1, assemblyEntity.getBaseLayer())
  })

  test("with new value and changes", () => {
    assemblyEntity._applyDiffAtLayer(3, { foo1: 3 })
    assemblyEntity.moveDown(1, { ...entity, foo1: 3 }, true)
    assert.same({ ...entity, foo1: 3 }, assemblyEntity.getBaseValue())
    assert.same({ ...entity }, assemblyEntity.getValueAtLayer(2))
  })

  test("error if moving up", () => {
    assert.error(() => assemblyEntity.moveDown(2))
  })
})

describe("adjustValueAtLayer", () => {
  test("can set base value", () => {
    const newEntity = { ...entity, foo1: 3 }
    assemblyEntity.adjustValueAtLayer(2, newEntity)
    assert.same(newEntity, assemblyEntity.getBaseValue())
  })

  test("removes no longer effectual diffs after set at base value", () => {
    const assemblyEntity = createAssemblyEntity(entity, Pos(0, 0), nil, 1)
    assemblyEntity._applyDiffAtLayer(3, { foo1: 3 })
    assemblyEntity.adjustValueAtLayer(1, { ...entity, foo1: 3 })
    assert.same({ ...entity, foo1: 3 }, assemblyEntity.getBaseValue())
    assert.false(assemblyEntity.hasLayerChange())
  })

  test("creates diff if set at higher layer", () => {
    const assemblyEntity = createAssemblyEntity(entity, Pos(0, 0), nil, 1)
    assemblyEntity.adjustValueAtLayer(2, { ...entity, foo1: 3 })
    assert.same(entity, assemblyEntity.getBaseValue())
    assert.true(assemblyEntity.hasLayerChange())
    assert.same({ ...entity, foo1: 3 }, assemblyEntity.getValueAtLayer(2))
  })

  test("complex case", () => {
    const baseValue = { name: "test", a: 1, b: 1, c: 1 }
    const value2 = { ...baseValue, b: 2, c: 2 }
    const newValue2 = { ...baseValue, a: 2, b: 1, c: 5 }
    const value3 = { ...baseValue, a: 2, b: 2, c: 5 }
    const assemblyEntity = createAssemblyEntity(baseValue, Pos(0, 0), nil, 1)
    assemblyEntity.adjustValueAtLayer(2, value2)
    assert.same(baseValue, assemblyEntity.getBaseValue())
    assert.same(value2, assemblyEntity.getValueAtLayer(2))
    assemblyEntity.adjustValueAtLayer(3, value3)
    assert.same(baseValue, assemblyEntity.getBaseValue())
    assert.same(value2, assemblyEntity.getValueAtLayer(2))
    assert.same(value3, assemblyEntity.getValueAtLayer(3))
    assemblyEntity.adjustValueAtLayer(2, newValue2)
    assert.same(baseValue, assemblyEntity.getBaseValue())
    assert.same(newValue2, assemblyEntity.getValueAtLayer(2))
    const newValue3 = { ...value3, b: 1 } // due to change in newValue2
    assert.same(newValue3, assemblyEntity.getValueAtLayer(3))
    assert.same(getEntityDiff(newValue2, newValue3), assemblyEntity._getLayerChanges()[3], "diff trimmed")
  })
})

describe("Get/set world entities", () => {
  let entity: LuaEntity
  let assemblyEntity: AssemblyEntity
  before_each(() => {
    // entity = area.surface.create_entity({ name: "iron-chest", position: area.bbox.left_top })!
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
  export interface LayerProperties {
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
    assert.false(assemblyEntity.propertySetInAnyLayer("foo"))
    assemblyEntity.setProperty(2, "foo", "bar")
    assert.true(assemblyEntity.propertySetInAnyLayer("foo"))
    assemblyEntity.setProperty(3, "foo", "bar")
    assemblyEntity.setProperty(2, "foo", nil)
    assert.true(assemblyEntity.propertySetInAnyLayer("foo"))
    assemblyEntity.setProperty(3, "foo", nil)
    assert.false(assemblyEntity.propertySetInAnyLayer("foo"))
  })
  test("clear property", () => {
    assemblyEntity.setProperty(2, "foo", "bar")
    assemblyEntity.setProperty(3, "foo", "bar")
    assemblyEntity.clearPropertyInAllLayers("foo")
    assert.nil(assemblyEntity.getProperty(2, "foo"))
    assert.nil(assemblyEntity.getProperty(3, "foo"))
  })
})
