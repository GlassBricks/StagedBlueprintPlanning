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

import { Assembly } from "../../assembly/AssemblyDef"
import { EntityHighlighter } from "../../assembly/EntityHighlighter"
import { createWorldUpdater, WorldUpdater } from "../../assembly/WorldUpdater"
import { AssemblyEntity, createAssemblyEntity, StageNumber } from "../../entity/AssemblyEntity"
import { Entity } from "../../entity/Entity"
import { EntityHandler } from "../../entity/EntityHandler"
import { forceDollyEntity } from "../../entity/picker-dollies"
import { WireHandler, WireUpdater } from "../../entity/WireHandler"
import { Pos } from "../../lib/geometry"
import { createRollingStock } from "../entity/createRollingStock"
import { setupEntityMoveTest } from "../entity/setup-entity-move-test"
import { makeMocked } from "../simple-mock"
import { createMockAssembly, setupTestSurfaces } from "./Assembly-mock"
import { SavedDirection } from "../../entity/direction"
import expect, { mock } from "tstl-expect"

interface TestEntity extends Entity {
  name: "inserter" | "fast-inserter"
  override_stack_size?: number
}
let assembly: Assembly
let entity: AssemblyEntity<TestEntity>

let highlighter: mock.MockedObjectNoSelf<EntityHighlighter>
let wireUpdater: mock.MockedObjectNoSelf<WireUpdater>
let worldUpdater: WorldUpdater

const origPos = { x: 0.5, y: 0.5 }
const origDir = defines.direction.east as SavedDirection & defines.direction
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

  wireUpdater = makeMocked(keys<WireUpdater>())
  highlighter = makeMocked(keys<EntityHighlighter>())
  worldUpdater = createWorldUpdater(EntityHandler, wireUpdater, highlighter as unknown as EntityHighlighter)
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
  expect(findAnyEntity(i)).to.be.nil()
  expect(entity.getWorldOrPreviewEntity(i)).to.be.nil()
}
function assertHasPreview(i: StageNumber): void {
  expect(findMainEntity(i)).to.be.nil()
  expect(findPreviewEntity(i)).to.be.any().and.to.equal(entity.getWorldOrPreviewEntity(i))
}

function assertEntityCorrect(i: StageNumber): LuaEntity {
  const worldEntity = expect(findMainEntity(i)).to.be.any().getValue()
  const [value, direction] = EntityHandler.saveEntity(worldEntity)
  expect(entity.getDirection()).to.be(direction)
  const valueAtStage = entity.getValueAtStage(i)
  expect(valueAtStage).to.equal(value)
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
    test.each([1, 2, 3, 4])("can create one entity at stage %d", (stage) => {
      worldUpdater.refreshWorldEntityAtStage(assembly, entity, stage)
      assertEntityCorrect(stage)
    })
    test("can create all entities", () => {
      worldUpdater.updateWorldEntities(assembly, entity, 1)
      for (let i = 1; i <= 4; i++) assertEntityCorrect(i)
    })

    test("can refresh a single entity", () => {
      const replaced = EntityHandler.createEntity(assembly.getSurface(2)!, entity.position, entity.getDirection(), {
        name: "inserter",
        override_stack_size: 3,
      } as TestEntity)!
      entity.replaceWorldEntity(2, replaced)
      worldUpdater.refreshWorldEntityAtStage(assembly, entity, 2)
      const val = assertEntityCorrect(2)
      expect(replaced).to.equal(val)
    })

    test("replaces deleted entity", () => {
      worldUpdater.refreshWorldEntityAtStage(assembly, entity, 3)
      entity.getWorldEntity(3)!.destroy()
      assertNothingPresent(3)
      worldUpdater.refreshWorldEntityAtStage(assembly, entity, 3)
      assertEntityCorrect(3)
    })

    test("can upgrade entities", () => {
      worldUpdater.refreshWorldEntityAtStage(assembly, entity, 1)
      entity._applyDiffAtStage(1, { name: "fast-inserter" })
      worldUpdater.refreshWorldEntityAtStage(assembly, entity, 1)
      assertEntityCorrect(1)
    })
  })

  test("creates preview entities in stages below first stage", () => {
    entity.moveToStage(3)
    worldUpdater.updateWorldEntities(assembly, entity, 1)
    assertHasPreview(1)
    assertHasPreview(2)
    assertEntityCorrect(3)
  })

  test("calls wireUpdater", () => {
    worldUpdater.updateWorldEntities(assembly, entity, 1)
    for (let i = 1; i <= 3; i++) expect(wireUpdater.updateWireConnections).calledWith(assembly.content, entity, i)
  })

  function assertDestructible(luaEntity: LuaEntity, value: boolean) {
    expect(luaEntity.minable).to.be(value)
    expect(luaEntity.rotatable).to.be(value)
    expect(luaEntity.destructible).to.be(false)
  }

  test.each([true, false])("entities not in first stage are indestructible, with existing: %s", (withExisting) => {
    entity.moveToStage(2)
    if (withExisting) {
      const luaEntity = EntityHandler.createEntity(assembly.getSurface(3)!, entity.position, entity.getDirection(), {
        name: "inserter",
        override_stack_size: 3,
      } as TestEntity)!
      entity.replaceWorldEntity(3, luaEntity)
    }
    worldUpdater.updateWorldEntities(assembly, entity, 1)

    assertDestructible(assertEntityCorrect(2), true)
    assertDestructible(assertEntityCorrect(3), false)
    assertDestructible(assertEntityCorrect(4), false)
  })

  test("can handle entity moving up", () => {
    worldUpdater.updateWorldEntities(assembly, entity, 1)
    entity.moveToStage(2)
    worldUpdater.updateWorldEntities(assembly, entity, 1)

    expect(findMainEntity(1)).to.be.nil()
    assertHasPreview(1)
    assertDestructible(assertEntityCorrect(2), true)
    assertDestructible(assertEntityCorrect(3), false)
  })

  test("can rotate entities", () => {
    worldUpdater.updateWorldEntities(assembly, entity, 1)
    entity.setDirection(defines.direction.west as SavedDirection)
    worldUpdater.updateWorldEntities(assembly, entity, 1)
    for (let i = 1; i <= 3; i++) assertEntityCorrect(i)
  })

  test("can un-rotate entities", () => {
    worldUpdater.updateWorldEntities(assembly, entity, 1)
    entity.getWorldEntity(2)!.direction = defines.direction.west
    worldUpdater.refreshWorldEntityAtStage(assembly, entity, 2)
    for (let i = 1; i <= 3; i++) assertEntityCorrect(i)
  })

  test("calls updateHighlights", () => {
    worldUpdater.updateWorldEntities(assembly, entity, 1)
    expect(highlighter.updateHighlights).calledWith(assembly, entity, 1, assembly.maxStage())
  })

  test("entity preview in all other stages if is rolling stock", () => {
    const rollingStock = createRollingStock(surfaces[2 - 1])
    const [value, dir] = EntityHandler.saveEntity(rollingStock)
    entity = createAssemblyEntity(value, rollingStock.position, dir, 2) as any
    rollingStock.destroy()

    worldUpdater.updateWorldEntities(assembly, entity, 1)

    assertHasPreview(1)
    const worldEntity = expect(findMainEntity(2)).to.be.any().getValue()
    const [foundValue] = EntityHandler.saveEntity(worldEntity)
    expect(foundValue).to.equal(value)
    assertHasPreview(3)
  })
})

test("replaceWorldEntityAtStage replaces old value", () => {
  worldUpdater.refreshWorldEntityAtStage(assembly, entity, 2)
  const value = assertEntityCorrect(2)
  worldUpdater.replaceWorldEntityAtStage(assembly, entity, 2)
  expect(value.valid).to.be(false)
  assertEntityCorrect(2)
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
  const newDir = defines.direction.north as SavedDirection & defines.direction

  function assertMoved() {
    for (let i = 0; i < 4; i++) {
      const luaEntity = entities[i]
      if (!luaEntity.valid) continue
      expect(luaEntity.position).to.equal(newPos)
      expect(luaEntity.direction).to.be(newDir)
    }
    expect(entity.position).to.equal(newPos)
    expect(entity.getDirection()).to.be(newDir)

    expect(assembly.content.findCompatibleByTraits(entity.getNameAtStage(1), newPos, newDir)).to.be(entity)
  }

  function assertNotMoved() {
    for (let i = 0; i < 4; i++) {
      const luaEntity = entities[i]
      if (!luaEntity.valid) continue
      expect(luaEntity.position).to.equal(origPos)
      expect(luaEntity.direction).to.be(origDir)
    }
    expect(entity.position).to.equal(origPos)
    expect(entity.getDirection()).to.be(origDir)

    expect(assembly.content.findCompatibleByTraits(entity.getNameAtStage(1), origPos, origDir)).to.be(entity)
  }

  test("can move entity if moved in first stage", () => {
    expect(forceDollyEntity(entities[0], newPos, newDir)).to.be(true)
    const result = worldUpdater.tryDollyEntities(assembly, entity, 1)
    expect(result).to.be("success")
    assertMoved()
  })

  test("can't move entity if moved in later stage", () => {
    expect(forceDollyEntity(entities[1], newPos, newDir)).to.be(true)
    const result = worldUpdater.tryDollyEntities(assembly, entity, 2)
    expect(result).to.be("cannot-move")
    assertNotMoved()
  })

  test("can't move if world entities are missing in any stage", () => {
    expect(forceDollyEntity(entities[0], newPos, newDir)).to.be(true)
    entity.getWorldEntity(2)!.destroy()
    const result = worldUpdater.tryDollyEntities(assembly, entity, 1)
    expect(result).to.be("entities-missing")
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

      expect(forceDollyEntity(entities[0], newPos, newDir)).to.be(true)
      const result = worldUpdater.tryDollyEntities(assembly, entity, 1)
      expect(result).to.be("connected-entities-missing")
    })

    test("can't move if circuit connected missing in all stages", () => {
      assembly.content.addCircuitConnection({
        fromEntity: entity,
        toEntity: otherEntity,
        fromId: 1,
        toId: 1,
        wire: defines.wire_type.red,
      })

      expect(forceDollyEntity(entities[0], newPos, newDir)).to.be(true)
      const result = worldUpdater.tryDollyEntities(assembly, entity, 1)
      expect(result).to.be("connected-entities-missing")
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
      expect(forceDollyEntity(entities[0], newPos, newDir)).to.be(true)

      otherEntity.replaceWorldEntity(
        2,
        surfaces[0].create_entity({
          name: "small-electric-pole",
          position: newPos,
          direction: newDir,
        }),
      )

      const result = worldUpdater.tryDollyEntities(assembly, entity, 1)
      expect(result).to.be("success")
      assertMoved()
    })
  })
})

test("updateNewEntityWithoutWires", () => {
  const entity = createAssemblyEntity({ name: "inserter" }, Pos(0, 0), defines.direction.north as SavedDirection, 2)
  assembly.content.add(entity)
  worldUpdater.updateNewEntityWithoutWires(assembly, entity)
  expect(highlighter.updateHighlights).calledWith(assembly, entity, 1, assembly.maxStage())
  expect(wireUpdater.updateWireConnections).not.called()
})

test("updateWireConnections", () => {
  const entity = createAssemblyEntity({ name: "inserter" }, Pos(0, 0), defines.direction.north as SavedDirection, 2)
  assembly.content.add(entity)
  worldUpdater.updateNewEntityWithoutWires(assembly, entity)
  worldUpdater.updateWireConnections(assembly, entity)
  for (const i of $range(2, assembly.maxStage())) {
    expect(wireUpdater.updateWireConnections).calledWith(assembly.content, entity, i)
  }
})

test("clearWorldEntity", () => {
  worldUpdater.updateWorldEntities(assembly, entity, 1)
  worldUpdater.clearWorldEntity(assembly, entity, 2)
  expect(highlighter.updateHighlights).calledWith(assembly, entity, 2, 2)
  expect(findMainEntity(2)).to.be.nil()
  assertEntityCorrect(1)
  assertEntityCorrect(3)
})

describe("invalid stages", () => {
  test("out of range is ignored", () => {
    expect(() => worldUpdater.updateWorldEntities(assembly, entity, -1)).not.to.error()
    for (let i = -1; i <= 5; i++) {
      if (i >= 1 && i <= 4) assertEntityCorrect(i)
      else assertNothingPresent(i)
    }
  })
  test("does nothing if range is empty", () => {
    worldUpdater.updateWorldEntities(assembly, entity, 5)
    for (let i = 1; i <= 3; i++) assertNothingPresent(i)
  })
})

test("deleteWorldEntities", () => {
  worldUpdater.updateWorldEntities(assembly, entity, 1)
  worldUpdater.deleteAllEntities(entity)
  for (let i = 1; i <= 3; i++) assertNothingPresent(i)
  expect(highlighter.deleteHighlights).calledWith(entity)
})

test("makeSettingsRemnant makes all previews and calls highlighter.makeSettingsRemnant", () => {
  entity.isSettingsRemnant = true
  worldUpdater.makeSettingsRemnant(assembly, entity)
  for (let i = 1; i <= 3; i++) assertHasPreview(i)
  expect(highlighter.makeSettingsRemnant).calledWith(assembly, entity)
})

test("updateWorldEntities calls makeSettingsRemnant", () => {
  entity.isSettingsRemnant = true
  worldUpdater.updateWorldEntities(assembly, entity, 1)
  for (let i = 1; i <= 3; i++) assertHasPreview(i)
  expect(highlighter.makeSettingsRemnant).calledWith(assembly, entity)
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
  expect(highlighter.reviveSettingsRemnant).calledWith(assembly, entity)
})

test("resetStage", () => {
  const entity1 = createAssemblyEntity({ name: "transport-belt" }, Pos(0, 0), nil, 1)
  const entity2 = createAssemblyEntity({ name: "iron-chest" }, Pos(1, 1), nil, 2)
  assembly.content.add(entity1)
  assembly.content.add(entity2)

  const surface = assembly.getSurface(2)!
  const chest = surface.create_entity({
    name: "iron-chest",
    position: Pos(0, 0),
  })!

  worldUpdater.resetStage(assembly, 2)

  expect(chest.valid).to.be(false)
  expect(entity1.getWorldEntity(2)).to.be.any()
  expect(entity2.getWorldEntity(2)).to.be.any()
})

// this duplicates WireHandler test a bit
// let's call it an integration test
describe("circuit wires", () => {
  let worldUpdater: WorldUpdater
  let entity1: AssemblyEntity
  let entity2: AssemblyEntity
  before_each(() => {
    worldUpdater = createWorldUpdater(EntityHandler, WireHandler, highlighter as unknown as EntityHighlighter) // real entity handler
    game.surfaces[1].find_entities().forEach((e) => e.destroy())
    entity1 = createAssemblyEntity({ name: "arithmetic-combinator" }, Pos(5.5, 6), nil, 1)
    entity2 = createAssemblyEntity({ name: "arithmetic-combinator" }, Pos(5.5, 8), nil, 1)
    assembly.content.add(entity1)
    assembly.content.add(entity2)
  })

  function doAdd() {
    worldUpdater.updateWorldEntities(assembly, entity1, 1)
    worldUpdater.updateWorldEntities(assembly, entity2, 1)
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
    expect(luaEntity1.circuit_connection_definitions).to.equal([
      {
        target_entity: luaEntity2,
        wire: defines.wire_type.red,
        source_circuit_id: defines.circuit_connector_id.combinator_input,
        target_circuit_id: defines.circuit_connector_id.combinator_output,
      } as CircuitConnectionDefinition,
    ])
  }

  test("can remove circuit wires", () => {
    const { luaEntity1, luaEntity2 } = doAdd()
    addExtraWires({ luaEntity1, luaEntity2 })
    worldUpdater.refreshWorldEntityAtStage(assembly, entity1, 1)
    expect(luaEntity1.circuit_connection_definitions ?? []).to.equal([])
    expect(luaEntity2.circuit_connection_definitions ?? []).to.equal([])
  })
  test("can add circuit wires", () => {
    addWireToAssembly()
    assertSingleWire(doAdd())
  })
  test("can remove extra circuit wires", () => {
    addWireToAssembly()
    const entities = doAdd()
    addExtraWires(entities)
    worldUpdater.refreshWorldEntityAtStage(assembly, entity1, 1)
    assertSingleWire(entities)
  })
})
