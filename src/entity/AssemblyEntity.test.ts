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
import {
  applyDiffToEntity,
  AssemblyEntity,
  createAssemblyEntity,
  destroyWorldEntity,
  Entity,
  getEntityDiff,
  getNilPlaceholder,
  getValueAtLayer,
  getWorldEntity,
  replaceOrDestroyWorldEntity,
  replaceWorldEntity,
} from "./AssemblyEntity"

const entity1 = {
  name: "1",
  changedProp: { x: 1, y: 2 },
  simpleUnchanged: "unchanged",
  unchanged: { x: 1, y: 2 },
  setToNil: "setToNil",
}
const entity2 = {
  name: "2",
  changedProp: { x: 2, y: 2 },
  simpleUnchanged: "unchanged",
  unchanged: { x: 1, y: 2 },
}

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
    assert.nil(getWorldEntity(assemblyEntity, 1))
    assert.nil(getWorldEntity(assemblyEntity, 2))
    replaceWorldEntity(assemblyEntity, entity, 1)
    assert.same(entity, getWorldEntity(assemblyEntity, 1))
    assert.nil(getWorldEntity(assemblyEntity, 2))
    replaceWorldEntity(assemblyEntity, entity, 2)
    assert.same(entity, getWorldEntity(assemblyEntity, 1))
    assert.same(entity, getWorldEntity(assemblyEntity, 2))
  })

  test("destroy world entity removes the entity", () => {
    replaceWorldEntity(assemblyEntity, entity, 1)
    destroyWorldEntity(assemblyEntity, 1)
    assert.false(entity.valid)
    assert.nil(getWorldEntity(assemblyEntity, 1))
  })

  test("replaceOrDestroy with nil destroys the entity", () => {
    replaceWorldEntity(assemblyEntity, entity, 1)
    replaceOrDestroyWorldEntity(assemblyEntity, nil, 1)
    assert.false(entity.valid)
    assert.nil(getWorldEntity(assemblyEntity, 1))
  })

  test("replace world entity deletes old entity", () => {
    replaceWorldEntity(assemblyEntity, entity, 1)
    const newEntity = area.surface.create_entity({
      name: "iron-chest",
      position: Pos.plus(area.bbox.left_top, { x: 1, y: 1 }),
    })!
    replaceWorldEntity(assemblyEntity, newEntity, 1)
    assert.false(entity.valid)
    assert.same(newEntity, getWorldEntity(assemblyEntity, 1))
  })

  test("replace world entity does not delete if same entity", () => {
    replaceWorldEntity(assemblyEntity, entity, 1)
    replaceWorldEntity(assemblyEntity, entity, 1)
    assert.true(entity.valid)
    assert.same(entity, getWorldEntity(assemblyEntity, 1))
  })

  test("get world entity returns nil if entity becomes invalid", () => {
    replaceWorldEntity(assemblyEntity, entity, 1)
    entity.destroy()
    assert.nil(getWorldEntity(assemblyEntity, 1))
  })
})

describe("entityDiff", () => {
  test("getEntityDiff", () => {
    const diff = getEntityDiff(entity1, entity2)
    assert.same(
      {
        name: "2",
        changedProp: { x: 2, y: 2 },
        setToNil: getNilPlaceholder(),
      },
      diff,
    )
  })
  test("applyDiffToEntity", () => {
    const diff = getEntityDiff(entity1, entity2)!
    const entity = { ...entity1 }
    applyDiffToEntity(entity, diff)
    assert.same(entity2, entity)
  })

  describe("getValueAtLayer", () => {
    interface FooEntity extends Entity {
      foo1: number
      foo2?: number | nil
    }

    const entity: AssemblyEntity<FooEntity> = createAssemblyEntity<FooEntity>(
      {
        name: "foo",
        foo1: 1,
      },
      { x: 0, y: 0 },
      nil,
      2,
    )

    let changingEntity: AssemblyEntity<FooEntity>
    before_all(() => {
      changingEntity = {
        ...entity,
        layerChanges: {
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
        },
      }
    })

    test("nil if lower than layer", () => {
      assert.nil(getValueAtLayer(changingEntity, 1))
    })

    test("getValueAtLayer returns same entity if no layerChanges", () => {
      assert.same(entity.baseEntity, getValueAtLayer(entity, 2))
    })

    test("applies changes from one layer", () => {
      const result = getValueAtLayer(changingEntity, 3)
      assert.same({ ...entity.baseEntity, foo1: 3, foo2: 4 }, result)
    })

    test("applies changes from multiple layers", () => {
      const result = getValueAtLayer(changingEntity, 5)
      assert.same({ ...entity.baseEntity, foo1: 5, foo2: 4 }, result)
    })

    test("replaces nilPlaceholder with nil", () => {
      const result = getValueAtLayer(changingEntity, 7)
      const expected = { ...entity.baseEntity, foo1: 5 }
      delete expected.foo2

      assert.same(expected, result)
    })
  })
})
