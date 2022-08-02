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

import { Pos } from "../lib/geometry"
import { clearTestArea } from "../test-util/area"
import { WorldArea } from "../utils/world-location"
import { AssemblyEntity, createAssemblyEntity } from "./AssemblyEntity"
import { getNilPlaceholder } from "./diff"
import { Entity } from "./Entity"

describe("Get/set world entities", () => {
  let area: WorldArea
  let entity: LuaEntity
  let assemblyEntity: AssemblyEntity
  before_each(() => {
    area = clearTestArea()
    entity = area.surface.create_entity({ name: "iron-chest", position: area.bbox.left_top })!
    assemblyEntity = createAssemblyEntity({ name: entity.name }, area.bbox.left_top, nil, 1)
    assert(entity)
  })

  test("get after replace returns the correct entity", () => {
    assert.nil(assemblyEntity.getWorldEntity(1))
    assert.nil(assemblyEntity.getWorldEntity(2))
    assemblyEntity.replaceOrDestroyWorldEntity(1, entity)
    assert.same(entity, assemblyEntity.getWorldEntity(1))
    assert.nil(assemblyEntity.getWorldEntity(2))
    assemblyEntity.replaceOrDestroyWorldEntity(2, entity)
    assert.same(entity, assemblyEntity.getWorldEntity(1))
    assert.same(entity, assemblyEntity.getWorldEntity(2))
  })

  test("destroy world entity removes the entity", () => {
    assemblyEntity.replaceOrDestroyWorldEntity(1, entity)
    assemblyEntity.destroyWorldEntity(1)
    assert.false(entity.valid)
    assert.nil(assemblyEntity.getWorldEntity(1))
  })

  test("replaceOrDestroy with nil destroys the entity", () => {
    assemblyEntity.replaceOrDestroyWorldEntity(1, entity)
    assemblyEntity.replaceOrDestroyWorldEntity(1, nil)
    assert.false(entity.valid)
    assert.nil(assemblyEntity.getWorldEntity(1))
  })

  test("replace world entity deletes old entity", () => {
    assemblyEntity.replaceOrDestroyWorldEntity(1, entity)
    const newEntity = area.surface.create_entity({
      name: "iron-chest",
      position: Pos.plus(area.bbox.left_top, { x: 1, y: 1 }),
    })!
    assemblyEntity.replaceOrDestroyWorldEntity(1, newEntity)
    assert.false(entity.valid)
    assert.same(newEntity, assemblyEntity.getWorldEntity(1))
  })

  test("replace world entity does not delete if same entity", () => {
    assemblyEntity.replaceOrDestroyWorldEntity(1, entity)
    assemblyEntity.replaceOrDestroyWorldEntity(1, entity)
    assert.true(entity.valid)
    assert.same(entity, assemblyEntity.getWorldEntity(1))
  })

  test("get world entity returns nil if entity becomes invalid", () => {
    assemblyEntity.replaceOrDestroyWorldEntity(1, entity)
    entity.destroy()
    assert.nil(assemblyEntity.getWorldEntity(1))
  })
})

describe("getValueAtLayer", () => {
  interface FooEntity extends Entity {
    foo1: number
    foo2?: number | nil
  }

  const entity: FooEntity = {
    name: "foo",
    foo1: 1,
  }

  let assemblyEntity: AssemblyEntity<FooEntity>
  before_all(() => {
    assemblyEntity = createAssemblyEntity(entity, Pos(0, 0), nil, 2)
    assemblyEntity.layerChanges = {
      3: {
        foo1: 3,
        foo2: 4,
      },
      5: {
        foo1: 5,
      },
      7: {
        foo2: getNilPlaceholder(),
      },
    }
  })

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
})
