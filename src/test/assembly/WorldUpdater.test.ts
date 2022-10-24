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

import { keys } from "ts-transformer-keys"
import { Assembly } from "../../assembly/AssemblyDef"
import { EntityHighlighter } from "../../assembly/EntityHighlighter"
import { createWorldUpdater, WorldUpdater } from "../../assembly/WorldUpdater"
import { AssemblyEntity, createAssemblyEntity, SavedDirection, StageNumber } from "../../entity/AssemblyEntity"
import { Entity } from "../../entity/Entity"
import { forceMoveEntity } from "../../entity/entity-move"
import { EntityHandler } from "../../entity/EntityHandler"
import { WireHandler, WireUpdater } from "../../entity/WireHandler"
import { Pos } from "../../lib/geometry"
import { setupEntityMoveTest } from "../entity/setup-entity-move-test"
import { makeMocked, makeStubbed } from "../simple-mock"
import { createMockAssembly, setupTestSurfaces } from "./Assembly-mock"

interface TestEntity extends Entity {
  name: "inserter" | "fast-inserter"
  override_stack_size?: number
}
let assembly: Assembly
let entity: AssemblyEntity<TestEntity>

let highlighter: mock.Mocked<EntityHighlighter>
let wireUpdater: mock.Stubbed<WireUpdater>
let worldUpdater: WorldUpdater

const origPos = { x: 0.5, y: 0.5 }
const origDir = defines.direction.east as SavedDirection
const surfaces: LuaSurface[] = setupTestSurfaces(4)
before_each(() => {
  assembly = createMockAssembly(surfaces)
  entity = createAssemblyEntity(
    {
      name: "inserter",
      override_stack_size: 1,
    },
    origPos,
    origDir,
    1,
  )

  wireUpdater = makeStubbed(keys<WireUpdater>())
  highlighter = makeMocked(keys<EntityHighlighter>())
  worldUpdater = createWorldUpdater(EntityHandler, wireUpdater, highlighter)
})

function findPreviewEntity(i: StageNumber) {
  return surfaces[i - 1].find_entities_filtered({
    type: ["simple-entity-with-owner", "rail-remnants"],
    limit: 1,
  })[0]
}
function findMainEntity(i: StageNumber) {
  return surfaces[i - 1].find_entities_filtered({
    type: ["simple-entity-with-owner", "rail-remnants"],
    invert: true,
    limit: 1,
  })[0]
}
function findAnyEntity(i: StageNumber): LuaEntity | nil {
  return surfaces[i - 1].find_entities_filtered({
    limit: 1,
  })[0]
}

function assertNothingPresent(i: StageNumber): void {
  if (i <= 0 || i > surfaces.length) return
  assert.nil(findAnyEntity(i))
  assert.is_nil(entity.getWorldOrPreviewEntity(i))
}
function assertHasPreview(i: StageNumber): void {
  const preview = assert.not_nil(findPreviewEntity(i))
  const e = entity.getWorldOrPreviewEntity(i)
  assert.nil(findMainEntity(i))
  assert.equal(e, preview)
}

function assertEntityCorrect(i: StageNumber): LuaEntity {
  const worldEntity = assert.not_nil(findMainEntity(i))
  const [value, direction] = EntityHandler.saveEntity(worldEntity)
  assert.equal(direction, entity.getDirection())
  const valueAtStage = entity.getValueAtStage(i)
  assert.same(value, valueAtStage)
  return worldEntity
}

describe("updateWorldEntities", () => {
  describe.each([false, true])("with entity changes %s", (withChanges) => {
    if (withChanges) {
      before_each(() => {
        entity._applyDiffAtStage(entity.firstStage, { override_stack_size: 2 })
        entity._applyDiffAtStage(3, { override_stack_size: 1 })
      })
    }
    test.each([1, 2, 3])("can create one entity at stage %d", (stage) => {
      worldUpdater.updateAllWorldEntities(assembly, entity, stage, stage)
      assertEntityCorrect(stage)
    })
    test("can create all entities", () => {
      worldUpdater.updateAllWorldEntities(assembly, entity, 1, 3)
      for (let i = 1; i <= 3; i++) assertEntityCorrect(i)
    })

    test("can refresh a single entity", () => {
      const replaced = EntityHandler.createEntity(
        assembly.getStage(2)!.surface,
        entity.position,
        entity.getDirection(),
        {
          name: "inserter",
          override_stack_size: 3,
        } as TestEntity,
      )!
      entity.replaceWorldEntity(2, replaced)
      worldUpdater.updateAllWorldEntities(assembly, entity, 2, 2)
      const val = assertEntityCorrect(2)
      assert.equal(val, replaced)
    })

    test("when replace is true, deletes old entities", () => {
      worldUpdater.updateAllWorldEntities(assembly, entity, 2, 2)
      const value = assertEntityCorrect(2)
      worldUpdater.updateAllWorldEntities(assembly, entity, 2, 2, true)
      assert.false(value.valid)
      assertEntityCorrect(2)
    })

    test("replaces deleted entity", () => {
      worldUpdater.updateAllWorldEntities(assembly, entity, 3, 3)
      entity.getWorldEntity(3)!.destroy()
      assertNothingPresent(3)
      worldUpdater.updateAllWorldEntities(assembly, entity, 3, 3)
      assertEntityCorrect(3)
    })

    test("can upgrade entities", () => {
      worldUpdater.updateAllWorldEntities(assembly, entity, 1, 1)
      entity._applyDiffAtStage(1, { name: "fast-inserter" })
      worldUpdater.updateAllWorldEntities(assembly, entity, 1, 1)
      assertEntityCorrect(1)
    })
  })

  test("creates preview entities in stages below first stage", () => {
    entity.moveToStage(3)
    worldUpdater.updateAllWorldEntities(assembly, entity, 1, 3)
    assertHasPreview(1)
    assertHasPreview(2)
    assertEntityCorrect(3)
  })

  test("calls wireUpdater", () => {
    worldUpdater.updateAllWorldEntities(assembly, entity, 1, 3)
    for (let i = 1; i <= 3; i++)
      assert.spy(wireUpdater.updateWireConnections).called_with(match.ref(assembly.content), match.ref(entity), i)
  })

  function assertDestructible(luaEntity: LuaEntity, value: boolean) {
    assert.equal(value, luaEntity.minable, `minable not ${value}`)
    assert.equal(value, luaEntity.rotatable, `rotatable not ${value}`)
    assert.false(luaEntity.destructible, "destructible always false")
  }

  test.each([true, false])("entities not in first stage are indestructible, with existing: %s", (withExisting) => {
    entity.moveToStage(2)
    if (withExisting) {
      const luaEntity = EntityHandler.createEntity(
        assembly.getStage(3)!.surface,
        entity.position,
        entity.getDirection(),
        {
          name: "inserter",
          override_stack_size: 3,
        } as TestEntity,
      )!
      entity.replaceWorldEntity(3, luaEntity)
    }
    worldUpdater.updateAllWorldEntities(assembly, entity, 1, 4)

    assertDestructible(assertEntityCorrect(2), true)
    assertDestructible(assertEntityCorrect(3), false)
    assertDestructible(assertEntityCorrect(4), false)
  })

  test("can handle entity moving up", () => {
    worldUpdater.updateAllWorldEntities(assembly, entity, 1, 3)
    entity.moveToStage(2)
    worldUpdater.updateAllWorldEntities(assembly, entity, 1, 3)

    assert.nil(findMainEntity(1))
    assertHasPreview(1)
    assertDestructible(assertEntityCorrect(2), true)
    assertDestructible(assertEntityCorrect(3), false)
  })

  test("can rotate entities", () => {
    worldUpdater.updateAllWorldEntities(assembly, entity, 1, 3)
    entity.setDirection(defines.direction.west as SavedDirection)
    worldUpdater.updateAllWorldEntities(assembly, entity, 1, 3)
    for (let i = 1; i <= 3; i++) assertEntityCorrect(i)
  })

  test("can un-rotate entities", () => {
    worldUpdater.updateAllWorldEntities(assembly, entity, 1, 3)
    entity.getWorldEntity(2)!.direction = defines.direction.west
    worldUpdater.updateAllWorldEntities(assembly, entity, 2, 2)
    for (let i = 1; i <= 3; i++) assertEntityCorrect(i)
  })

  test("calls updateHighlights", () => {
    worldUpdater.updateAllWorldEntities(assembly, entity, 1, 3)
    assert.spy(highlighter.updateHighlights).called_with(match.ref(assembly), match.ref(entity), 1, 3)
  })

  test("entity preview not created if is rolling stock", () => {
    entity.applyUpgradeAtStage(1, "cargo-wagon")
    entity.moveToStage(2)
    worldUpdater.updateAllWorldEntities(assembly, entity, 1, 3)
    assertNothingPresent(1)
    assertHasPreview(2) // no rail, can't create
    assertNothingPresent(3)
  })
})

describe("tryMoveEntity", () => {
  // use real entities
  const { entities, origPos } = setupEntityMoveTest(4, nil, origDir)
  before_each(() => {
    entities.forEach((e, i) => {
      entity.replaceWorldEntity(i + 1, e)
    })
    assembly.content.add(entity)
    assembly.content.changePosition(entity, origPos)
  })
  const newPos = Pos(1.5, 2)
  const newDir = defines.direction.north

  function assertMoved() {
    for (let i = 0; i < 4; i++) {
      const luaEntity = entities[i]
      if (!luaEntity.valid) continue
      assert.same(newPos, luaEntity.position)
      assert.equal(newDir, luaEntity.direction)
    }
    assert.same(newPos, entity.position)
    assert.equal(newDir, entity.getDirection())

    assert.equal(entity, assembly.content.findCompatibleByName(entity.getNameAtStage(1), newPos, newDir))
  }

  function assertNotMoved() {
    for (let i = 0; i < 4; i++) {
      const luaEntity = entities[i]
      if (!luaEntity.valid) continue
      assert.same(origPos, luaEntity.position)
      assert.equal(origDir, luaEntity.direction)
    }
    assert.same(origPos, entity.position)
    assert.equal(origDir, entity.getDirection())

    assert.equal(entity, assembly.content.findCompatibleByName(entity.getNameAtStage(1), origPos, origDir))
  }

  test("can move entity if moved in first stage", () => {
    assert.true(forceMoveEntity(entities[0], newPos, newDir))
    const result = worldUpdater.tryDollyEntities(assembly, 1, entity)
    assert.equal("success", result)
    assertMoved()
  })

  test("can't move entity if moved in later stage", () => {
    assert.true(forceMoveEntity(entities[1], newPos, newDir))
    const result = worldUpdater.tryDollyEntities(assembly, 2, entity)
    assert.equal("not-first-stage", result)
    assertNotMoved()
  })

  test("can't move if world entities are missing in any stage", () => {
    assert.true(forceMoveEntity(entities[0], newPos, newDir))
    entity.getWorldEntity(2)!.destroy()
    const result = worldUpdater.tryDollyEntities(assembly, 1, entity)
    assert.equal("entities-missing", result)
    assertNotMoved()
  })

  describe("with wire connections", () => {
    let otherEntity: AssemblyEntity
    before_each(() => {
      otherEntity = createAssemblyEntity(
        { name: "small-electric-pole" },
        Pos(-0.5, 0.5),
        defines.direction.north as SavedDirection,
        1,
      )
      assembly.content.add(otherEntity)
    })

    test("can't move if cable connected missing in all stages", () => {
      assembly.content.addCableConnection(entity, otherEntity) // uh, this is a bit hacky, cable connection directly onto inserter?

      assert.true(forceMoveEntity(entities[0], newPos, newDir))
      const result = worldUpdater.tryDollyEntities(assembly, 1, entity)
      assert.equal("connected-entities-missing", result)
    })

    test("can't move if circuit connected missing in all stages", () => {
      assembly.content.addCircuitConnection({
        fromEntity: entity,
        toEntity: otherEntity,
        fromId: 1,
        toId: 1,
        wire: defines.wire_type.red,
      })

      assert.true(forceMoveEntity(entities[0], newPos, newDir))
      const result = worldUpdater.tryDollyEntities(assembly, 1, entity)
      assert.equal("connected-entities-missing", result)
    })

    test("can move if entity present in at least one stage", () => {
      assembly.content.addCableConnection(entity, otherEntity)
      assembly.content.addCircuitConnection({
        fromEntity: entity,
        toEntity: otherEntity,
        fromId: 1,
        toId: 1,
        wire: defines.wire_type.red,
      })
      assert.true(forceMoveEntity(entities[0], newPos, newDir))

      otherEntity.replaceWorldEntity(
        2,
        surfaces[0].create_entity({
          name: "small-electric-pole",
          position: newPos,
          direction: newDir,
        }),
      )

      const result = worldUpdater.tryDollyEntities(assembly, 1, entity)
      assert.equal("success", result)
      assertMoved()
    })
  })
})

test("force delete", () => {
  worldUpdater.updateAllWorldEntities(assembly, entity, 1, 3)
  worldUpdater.clearWorldEntity(assembly, 2, entity)
  assert.spy(highlighter.updateHighlights).called_with(match.ref(assembly), match.ref(entity), 2, 2)
  assert.nil(findMainEntity(2))
  assertEntityCorrect(1)
  assertEntityCorrect(3)
})

describe("invalid stages", () => {
  test("out of range is ignored", () => {
    assert.no_errors(() => worldUpdater.updateAllWorldEntities(assembly, entity, -1, 5))
    for (let i = -1; i <= 5; i++) {
      if (i >= 1 && i <= 4) assertEntityCorrect(i)
      else assertNothingPresent(i)
    }
  })
  test("does nothing if range is empty", () => {
    worldUpdater.updateAllWorldEntities(assembly, entity, 3, 1)
    for (let i = 1; i <= 3; i++) assertNothingPresent(i)
  })
})

test("deleteWorldEntities", () => {
  worldUpdater.updateAllWorldEntities(assembly, entity, 1, 3)
  worldUpdater.deleteAllEntities(entity)
  for (let i = 1; i <= 3; i++) assertNothingPresent(i)
  assert.spy(highlighter.deleteHighlights).called_with(match.ref(entity))
})

test("deleteExtraEntitiesOnly", () => {
  worldUpdater.updateAllWorldEntities(assembly, entity, 1, 3)
  worldUpdater.deleteExtraEntitiesOnly(entity)
  for (let i = 1; i <= 3; i++) assertEntityCorrect(i)
  assert.spy(highlighter.deleteHighlights).called_with(match.ref(entity))
})

test("makeSettingsRemnant makes all previews and calls highlighter.makeSettingsRemnant", () => {
  entity.isSettingsRemnant = true
  worldUpdater.makeSettingsRemnant(assembly, entity)
  for (let i = 1; i <= 3; i++) assertHasPreview(i)
  assert.spy(highlighter.makeSettingsRemnant).called_with(match.ref(assembly), match.ref(entity))
})

test("updateWorldEntities calls makeSettingsRemnant", () => {
  entity.isSettingsRemnant = true
  worldUpdater.updateAllWorldEntities(assembly, entity, 1, 3)
  for (let i = 1; i <= 3; i++) assertHasPreview(i)
  assert.spy(highlighter.makeSettingsRemnant).called_with(match.ref(assembly), match.ref(entity))
})

test("reviveSettingsRemnant revives correct entities and calls highlighter.reviveSettingsRemnant", () => {
  entity.moveToStage(2)
  entity.isSettingsRemnant = true
  worldUpdater.makeSettingsRemnant(assembly, entity)

  entity.isSettingsRemnant = nil
  worldUpdater.reviveSettingsRemnant(assembly, entity)
  assertHasPreview(1)
  assertEntityCorrect(2)
  assertEntityCorrect(3)
  assert.spy(highlighter.reviveSettingsRemnant).called_with(match.ref(assembly), match.ref(entity))
})

// this duplicates WireHandler test a bit
// let's call it an integration test
describe("circuit wires", () => {
  let worldUpdater: WorldUpdater
  let entity1: AssemblyEntity
  let entity2: AssemblyEntity
  before_each(() => {
    worldUpdater = createWorldUpdater(EntityHandler, WireHandler, highlighter) // real entity handler
    game.surfaces[1].find_entities().forEach((e) => e.destroy())
    entity1 = createAssemblyEntity({ name: "arithmetic-combinator" }, Pos(5.5, 6), nil, 1)
    entity2 = createAssemblyEntity({ name: "arithmetic-combinator" }, Pos(5.5, 8), nil, 1)
    assembly.content.add(entity1)
    assembly.content.add(entity2)
  })

  function doAdd() {
    worldUpdater.updateAllWorldEntities(assembly, entity1, 1, 1)
    worldUpdater.updateAllWorldEntities(assembly, entity2, 1, 1)
    const luaEntity1 = entity1.getWorldEntity(1)!
    const luaEntity2 = entity2.getWorldEntity(1)!
    return { luaEntity1, luaEntity2 }
  }

  function addExtraWires({ luaEntity1, luaEntity2 }: { luaEntity1: LuaEntity; luaEntity2: LuaEntity }) {
    luaEntity1.connect_neighbour({
      target_entity: luaEntity2,
      wire: defines.wire_type.red,
      source_circuit_id: defines.circuit_connector_id.combinator_input,
      target_circuit_id: defines.circuit_connector_id.combinator_output,
    })
    luaEntity2.connect_neighbour({
      target_entity: luaEntity1,
      wire: defines.wire_type.green,
      source_circuit_id: defines.circuit_connector_id.combinator_input,
      target_circuit_id: defines.circuit_connector_id.combinator_output,
    })
  }

  function addWireToAssembly() {
    assembly.content.addCircuitConnection({
      fromEntity: entity1,
      toEntity: entity2,
      wire: defines.wire_type.red,
      fromId: defines.circuit_connector_id.combinator_input,
      toId: defines.circuit_connector_id.combinator_output,
    })
  }

  function assertSingleWire({ luaEntity1, luaEntity2 }: { luaEntity1: LuaEntity; luaEntity2: LuaEntity }): void {
    assert.same(
      [
        {
          target_entity: luaEntity2,
          wire: defines.wire_type.red,
          source_circuit_id: defines.circuit_connector_id.combinator_input,
          target_circuit_id: defines.circuit_connector_id.combinator_output,
        } as CircuitConnectionDefinition,
      ],
      luaEntity1.circuit_connection_definitions,
    )
  }

  test("can remove circuit wires", () => {
    const { luaEntity1, luaEntity2 } = doAdd()
    addExtraWires({ luaEntity1, luaEntity2 })
    worldUpdater.updateAllWorldEntities(assembly, entity2, 1, 1)
    assert.same([], luaEntity1.circuit_connection_definitions ?? [])
    assert.same([], luaEntity2.circuit_connection_definitions ?? [])
  })
  test("can add circuit wires", () => {
    addWireToAssembly()
    assertSingleWire(doAdd())
  })
  test("can remove extra circuit wires", () => {
    addWireToAssembly()
    const entities = doAdd()
    addExtraWires(entities)
    worldUpdater.updateAllWorldEntities(assembly, entity2, 1, 1)
    assertSingleWire(entities)
  })
})
