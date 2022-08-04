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

import { AssemblyEntity, createAssemblyEntity, LayerNumber } from "../entity/AssemblyEntity"
import { Entity } from "../entity/Entity"
import { createMockEntityCreator, MockEntityCreator } from "../entity/EntityHandler-mock"
import { Mutable } from "../lib"
import { AssemblyPosition } from "./Assembly"
import { createMockAssembly } from "./Assembly-mock"
import { EntityHighlighter } from "./EntityHighlighter"
import { createWorldUpdater, WorldUpdater } from "./WorldUpdater"

interface TestEntity extends Entity {
  prop1: number
  prop2?: string
}
let assembly: AssemblyPosition
let entity: AssemblyEntity<TestEntity>

let mockEntityCreator: MockEntityCreator
let highlighter: mock.Mocked<EntityHighlighter>
let worldUpdater: WorldUpdater

before_each(() => {
  assembly = createMockAssembly(3)
  entity = createAssemblyEntity(
    {
      name: "test",
      prop1: 1,
    },
    { x: 0, y: 0 },
    defines.direction.east,
    1,
  )

  mockEntityCreator = createMockEntityCreator()
  highlighter = {
    setErrorHighlightAt: spy(),
    deleteAllHighlights: spy(),
  }
  worldUpdater = createWorldUpdater(mockEntityCreator, highlighter)
})

function assertEntityNotPresent(i: LayerNumber): void {
  assert.falsy(mockEntityCreator.getAt(i) ?? nil)
  assert.is_nil(entity.getWorldEntity(i))
}

function assertEntityCorrect(i: LayerNumber): LuaEntity {
  const entry = mockEntityCreator.getAt(i)!
  assert.not_nil(entry)
  assert.equal(entry.luaEntity, entity.getWorldEntity(i) ?? "nil")
  assert.equal(entity.direction ?? 0, entry.luaEntity.direction)
  const valueAtLayer = entity.getValueAtLayer(i)
  assert.same(valueAtLayer, entry.value, `value not equal at layer ${i}`)
  return entry.luaEntity
}
describe("updateWorldEntities", () => {
  describe.each([false, true], "with entity changes", (withChanges) => {
    if (withChanges) {
      before_each(() => {
        entity.applyDiffAtLayer(entity.getBaseLayer(), { prop1: 2 })
        entity.applyDiffAtLayer(3, { prop1: 1 })
      })
    }
    test.each([1, 2, 3], "can create one entity %d", (layer) => {
      worldUpdater.updateWorldEntities(assembly, entity, layer, layer)
      for (let i = 1; i <= 3; i++) {
        if (i === layer) assertEntityCorrect(i)
        else assertEntityNotPresent(i)
      }
    })
    test("can create all entities", () => {
      worldUpdater.updateWorldEntities(assembly, entity, 1, 3)
      for (let i = 1; i <= 3; i++) assertEntityCorrect(i)
    })

    test("entities not in base layer are indestructible", () => {
      worldUpdater.updateWorldEntities(assembly, entity, 1, 3)
      function assertDestructible(luaEntity: LuaEntity, value: boolean) {
        assert.equal(value, luaEntity.destructible)
        assert.equal(value, luaEntity.minable)
        assert.equal(value, luaEntity.rotatable)
      }
      assertDestructible(assertEntityCorrect(1), true)
      assertDestructible(assertEntityCorrect(2), false)
      assertDestructible(assertEntityCorrect(3), false)
    })

    test("can refresh a single entity", () => {
      const replaced = mockEntityCreator.createEntity(assembly.layers[2], entity, {
        name: "test",
        prop1: 10,
      } as TestEntity)!
      entity.replaceWorldEntity(2, replaced)
      worldUpdater.updateWorldEntities(assembly, entity, 2, 2)
      const val = assertEntityCorrect(2)
      assert.equal(val, replaced)
    })

    test("when replace is true, deletes old entities", () => {
      worldUpdater.updateWorldEntities(assembly, entity, 2, 2)
      const value = assertEntityCorrect(2)
      worldUpdater.updateWorldEntities(assembly, entity, 2, 2, true)
      assert.false(value.valid)
      assertEntityCorrect(2)
    })

    test("replaces deleted entity", () => {
      worldUpdater.updateWorldEntities(assembly, entity, 3, 3)
      entity.getWorldEntity(3)!.destroy()
      assertEntityNotPresent(3)
      worldUpdater.updateWorldEntities(assembly, entity, 3, 3)
      assertEntityCorrect(3)
    })

    test("can rotate entities", () => {
      worldUpdater.updateWorldEntities(assembly, entity, 1, 3)
      entity.direction = defines.direction.west
      worldUpdater.updateWorldEntities(assembly, entity, 1, 3)
      for (let i = 1; i <= 3; i++) assertEntityCorrect(i)
    })

    test("can un-rotate entities", () => {
      worldUpdater.updateWorldEntities(assembly, entity, 1, 3)
      entity.getWorldEntity(2)!.direction = defines.direction.west
      worldUpdater.updateWorldEntities(assembly, entity, 2, 2)
      for (let i = 1; i <= 3; i++) assertEntityCorrect(i)
    })
  })

  describe("invalid layers", () => {
    test("out of range is ignored", () => {
      assert.no_errors(() => worldUpdater.updateWorldEntities(assembly, entity, -1, 5))
      for (let i = -1; i <= 5; i++) {
        if (i >= 1 && i <= 3) assertEntityCorrect(i)
        else assertEntityNotPresent(i)
      }
    })
    test("does nothing if range is empty", () => {
      worldUpdater.updateWorldEntities(assembly, entity, 3, 1)
      for (let i = 1; i <= 3; i++) assertEntityNotPresent(i)
    })
  })
})

test("deleteAllEntities", () => {
  worldUpdater.updateWorldEntities(assembly, entity, 1, 3)
  worldUpdater.deleteAllWorldEntities(assembly, entity)
  for (let i = 1; i <= 3; i++) assertEntityNotPresent(i)
})

describe("error highlight", () => {
  before_each(() => {
    ;(entity as Mutable<AssemblyEntity>).categoryName = "stone-furnace"
  })
  test("creates error highlight if entity cannot be placed", () => {
    mockEntityCreator.createEntity(assembly.layers[2], entity, entity.getBaseValue())
    worldUpdater.updateWorldEntities(assembly, entity, 1, 3)
    assert.spy(highlighter.setErrorHighlightAt).called_with(match._, assembly.layers[1], false)
    assert.spy(highlighter.setErrorHighlightAt).called_with(match._, assembly.layers[2], true)
    assert.spy(highlighter.setErrorHighlightAt).called_with(match._, assembly.layers[3], false)
  })

  test("removes error highlight after entity removed", () => {
    mockEntityCreator.createEntity(assembly.layers[1], entity, entity.getBaseValue())
    worldUpdater.updateWorldEntities(assembly, entity, 1, 1)
    worldUpdater.deleteAllWorldEntities(assembly, entity)
    assert.spy(highlighter.deleteAllHighlights).called_with(entity)
  })
})
