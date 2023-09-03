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

import { CircuitConnectionDefinition, LuaEntity, LuaSurface } from "factorio:runtime"
import expect from "tstl-expect"
import { Assembly } from "../../assembly/AssemblyDef"
import { AssemblyEntity, createAssemblyEntityNoCopy, StageNumber } from "../../entity/AssemblyEntity"
import { Entity } from "../../entity/Entity"
import { forceDollyEntity } from "../../entity/picker-dollies"
import { createEntity, saveEntity } from "../../entity/save-load"
import { Pos } from "../../lib/geometry"
import { createRollingStock } from "../entity/createRollingStock"
import { setupEntityMoveTest } from "../entity/setup-entity-move-test"
import { clearModuleMock, doModuleMock, moduleMock } from "../module-mock"
import { createMockAssembly, setupTestSurfaces } from "./Assembly-mock"

interface TestEntity extends Entity {
  name: "inserter" | "fast-inserter"
  override_stack_size?: number
}
let assembly: Assembly
let entity: AssemblyEntity<TestEntity>

import _highlighter = require("../../assembly/entity-highlights")
import WorldUpdater = require("../../assembly/world-entity-updates")
import _wireHandler = require("../../entity/wires")

const wireUpdater = moduleMock(_wireHandler, true)
const highlighter = moduleMock(_highlighter, true)

const origPos = { x: 0.5, y: 0.5 }
const origDir = defines.direction.east
const surfaces: LuaSurface[] = setupTestSurfaces(4)
before_each(() => {
  assembly = createMockAssembly(surfaces)
  entity = createAssemblyEntityNoCopy(
    {
      name: "inserter",
      override_stack_size: 1,
    },
    origPos,
    origDir,
    1,
  )
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
  const value = saveEntity(worldEntity)
  const valueAtStage = entity.getValueAtStage(i)
  expect(valueAtStage).to.equal(value)
  expect(entity.direction).to.be(worldEntity.direction)
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
      WorldUpdater.refreshWorldEntityAtStage(assembly, entity, stage)
      assertEntityCorrect(stage)
    })
    test("can create all entities", () => {
      WorldUpdater.updateWorldEntities(assembly, entity, 1)
      for (let i = 1; i <= 4; i++) assertEntityCorrect(i)
    })

    test("does not create entities past lastStage", () => {
      entity.setLastStageUnchecked(3)
      WorldUpdater.updateWorldEntities(assembly, entity, 1)
      for (let i = 1; i <= 3; i++) assertEntityCorrect(i)
      assertNothingPresent(4)
    })

    test("if first stage passed is past last stage, does nothing", () => {
      entity.setLastStageUnchecked(3)
      WorldUpdater.updateWorldEntities(assembly, entity, 4)
      for (let i = 1; i <= 4; i++) assertNothingPresent(i)
    })

    test("can refresh a single entity", () => {
      const replaced = createEntity(assembly.getSurface(2)!, entity.position, entity.direction, {
        name: "inserter",
        override_stack_size: 3,
      } as TestEntity)!
      entity.replaceWorldEntity(2, replaced)
      WorldUpdater.refreshWorldEntityAtStage(assembly, entity, 2)
      const val = assertEntityCorrect(2)
      expect(replaced).to.equal(val)
    })

    test("attempting to refresh world entity past last stage deletes entity if it exists", () => {
      entity.setLastStageUnchecked(3)
      entity.replaceWorldOrPreviewEntity(4, {} as any)
      WorldUpdater.refreshWorldEntityAtStage(assembly, entity, 4)
      assertNothingPresent(4)
    })

    test("replaces deleted entity", () => {
      WorldUpdater.refreshWorldEntityAtStage(assembly, entity, 3)
      entity.getWorldEntity(3)!.destroy()
      assertNothingPresent(3)
      WorldUpdater.refreshWorldEntityAtStage(assembly, entity, 3)
      assertEntityCorrect(3)
    })

    test("can upgrade entities", () => {
      WorldUpdater.refreshWorldEntityAtStage(assembly, entity, 1)
      entity._applyDiffAtStage(1, { name: "fast-inserter" })
      WorldUpdater.refreshWorldEntityAtStage(assembly, entity, 1)
      assertEntityCorrect(1)
    })
  })

  test("does nothing if range is empty", () => {
    WorldUpdater.updateWorldEntities(assembly, entity, 5)
    for (let i = 1; i <= 3; i++) assertNothingPresent(i)
  })

  test("creates preview entities in stages below first stage", () => {
    entity.setFirstStageUnchecked(3)
    WorldUpdater.updateWorldEntities(assembly, entity, 1)
    assertHasPreview(1)
    assertHasPreview(2)
    assertEntityCorrect(3)
  })

  test("calls wireUpdater", () => {
    WorldUpdater.updateWorldEntities(assembly, entity, 1)
    for (let i = 1; i <= 3; i++)
      expect(wireUpdater.updateWireConnectionsAtStage).calledWith(assembly.content, entity, i)
  })

  function assertDestructible(luaEntity: LuaEntity, value: boolean) {
    expect(luaEntity.minable).to.be(value)
    expect(luaEntity.rotatable).to.be(value)
    expect(luaEntity.destructible).to.be(false)
  }

  test.each([true, false])("entities not in first stage are indestructible, with existing: %s", (withExisting) => {
    entity.setFirstStageUnchecked(2)
    if (withExisting) {
      const luaEntity = createEntity(assembly.getSurface(3)!, entity.position, entity.direction, {
        name: "inserter",
        override_stack_size: 3,
      } as TestEntity)!
      entity.replaceWorldEntity(3, luaEntity)
    }
    WorldUpdater.updateWorldEntities(assembly, entity, 1)

    assertDestructible(assertEntityCorrect(2), true)
    assertDestructible(assertEntityCorrect(3), false)
    assertDestructible(assertEntityCorrect(4), false)
  })

  test("can handle entity moving up", () => {
    WorldUpdater.updateWorldEntities(assembly, entity, 1)
    entity.setFirstStageUnchecked(2)
    WorldUpdater.updateWorldEntities(assembly, entity, 1)

    expect(findMainEntity(1)).to.be.nil()
    assertHasPreview(1)
    assertDestructible(assertEntityCorrect(2), true)
    assertDestructible(assertEntityCorrect(3), false)
  })

  test("can rotate entities", () => {
    WorldUpdater.updateWorldEntities(assembly, entity, 1)
    entity.direction = defines.direction.west as defines.direction
    WorldUpdater.updateWorldEntities(assembly, entity, 1)
    for (let i = 1; i <= 3; i++) assertEntityCorrect(i)
  })

  test("can un-rotate entities", () => {
    WorldUpdater.updateWorldEntities(assembly, entity, 1)
    entity.getWorldEntity(2)!.direction = defines.direction.west
    WorldUpdater.refreshWorldEntityAtStage(assembly, entity, 2)
    for (let i = 1; i <= 3; i++) assertEntityCorrect(i)
  })

  test("calls updateHighlights", () => {
    WorldUpdater.updateWorldEntities(assembly, entity, 1)
    expect(highlighter.updateAllHighlights).calledWith(assembly, entity)
  })

  test("entity preview in all previous stages if is rolling stock", () => {
    const rollingStock = createRollingStock(surfaces[2 - 1])
    const value = saveEntity(rollingStock)!
    entity = createAssemblyEntityNoCopy(value, rollingStock.position, rollingStock.direction, 2) as any
    rollingStock.destroy()

    WorldUpdater.updateWorldEntities(assembly, entity, 1)

    assertHasPreview(1)
    const worldEntity = expect(findMainEntity(2)).to.be.any().getValue()
    const foundValue = saveEntity(worldEntity)
    expect(foundValue).to.equal(value)
    assertNothingPresent(3)
  })

  test("refreshWorldEntityAtStage also builds previews", () => {
    entity.setFirstStageUnchecked(2)
    WorldUpdater.refreshWorldEntityAtStage(assembly, entity, 1)
    assertHasPreview(1)
    // assertEntityCorrect(2)
  })
})

test("rebuildWorldEntityAtStage replaces old value", () => {
  WorldUpdater.refreshWorldEntityAtStage(assembly, entity, 2)
  const value = assertEntityCorrect(2)
  WorldUpdater.rebuildWorldEntityAtStage(assembly, entity, 2)
  expect(value.valid).to.be(false)
  assertEntityCorrect(2)
})

describe("updateWorldEntitiesOnLastStageChanged", () => {
  test("moving up creates entities", () => {
    entity.setFirstStageUnchecked(2)
    entity.setLastStageUnchecked(2)
    WorldUpdater.updateWorldEntities(assembly, entity, 1)
    assertHasPreview(1)
    assertEntityCorrect(2)
    assertNothingPresent(3)
    assertNothingPresent(4)

    clearModuleMock(_highlighter)
    clearModuleMock(_wireHandler)

    entity.setLastStageUnchecked(3)
    WorldUpdater.updateWorldEntitiesOnLastStageChanged(assembly, entity, 2)
    assertHasPreview(1)
    assertEntityCorrect(2)
    assertEntityCorrect(3)
    assertNothingPresent(4)

    expect(wireUpdater.updateWireConnectionsAtStage).calledWith(assembly.content, entity, 3)
    expect(highlighter.updateAllHighlights).calledWith(assembly, entity)
  })

  test("moving down destroys entities", () => {
    entity.setFirstStageUnchecked(2)
    entity.setLastStageUnchecked(3)
    WorldUpdater.updateWorldEntities(assembly, entity, 1)
    assertHasPreview(1)
    assertEntityCorrect(2)
    assertEntityCorrect(3)
    assertNothingPresent(4)

    clearModuleMock(_highlighter)

    entity.setLastStageUnchecked(2)
    WorldUpdater.updateWorldEntitiesOnLastStageChanged(assembly, entity, 3)
    assertHasPreview(1)
    assertEntityCorrect(2)
    assertNothingPresent(3)
    assertNothingPresent(4)

    expect(highlighter.updateAllHighlights).calledWith(assembly, entity)
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
      expect(luaEntity.position).to.equal(newPos)
      expect(luaEntity.direction).to.be(newDir)
    }
    expect(entity.position).to.equal(newPos)
    expect(entity.direction).to.be(newDir)

    expect(assembly.content.findCompatibleByProps(entity.getNameAtStage(1), newPos, newDir, 1)).to.be(entity)
  }

  function assertNotMoved() {
    for (let i = 0; i < 4; i++) {
      const luaEntity = entities[i]
      if (!luaEntity.valid) continue
      expect(luaEntity.position).to.equal(origPos)
      expect(luaEntity.direction).to.be(origDir)
    }
    expect(entity.position).to.equal(origPos)
    expect(entity.direction).to.be(origDir)

    expect(assembly.content.findCompatibleByProps(entity.getNameAtStage(1), origPos, origDir, 1)).to.be(entity)
  }

  test("can move entity if moved in first stage", () => {
    expect(forceDollyEntity(entities[0], newPos, newDir)).to.be(true)
    const result = WorldUpdater.tryDollyEntities(assembly, entity, 1)
    expect(result).to.be("success")
    assertMoved()
  })

  test("can't move entity if moved in later stage", () => {
    expect(forceDollyEntity(entities[1], newPos, newDir)).to.be(true)
    const result = WorldUpdater.tryDollyEntities(assembly, entity, 2)
    expect(result).to.be("cannot-move")
    assertNotMoved()
  })

  test("can't move if world entities are missing in any stage", () => {
    expect(forceDollyEntity(entities[0], newPos, newDir)).to.be(true)
    entity.getWorldEntity(2)!.destroy()
    const result = WorldUpdater.tryDollyEntities(assembly, entity, 1)
    expect(result).to.be("entities-missing")
    assertNotMoved()
  })

  describe("with wire connections", () => {
    let otherEntity: AssemblyEntity
    before_each(() => {
      otherEntity = createAssemblyEntityNoCopy(
        { name: "small-electric-pole" },
        Pos(-0.5, 0.5),
        defines.direction.north as defines.direction,
        1,
      )
      assembly.content.add(otherEntity)
    })

    test("can't move if cable connected missing in all stages", () => {
      assembly.content.addCableConnection(entity, otherEntity) // uh, this is a bit hacky, cable connection directly onto inserter?

      expect(forceDollyEntity(entities[0], newPos, newDir)).to.be(true)
      const result = WorldUpdater.tryDollyEntities(assembly, entity, 1)
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
      const result = WorldUpdater.tryDollyEntities(assembly, entity, 1)
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

      const result = WorldUpdater.tryDollyEntities(assembly, entity, 1)
      expect(result).to.be("success")
      assertMoved()
    })
  })
})

describe("updateNewEntityWithoutWires", () => {
  test("without updating firstStage", () => {
    const entity = createAssemblyEntityNoCopy(
      { name: "inserter" },
      Pos(0, 0),
      defines.direction.north as defines.direction,
      2,
    )
    assembly.content.add(entity)
    WorldUpdater.updateNewWorldEntitiesWithoutWires(assembly, entity, false)
    expect(highlighter.updateAllHighlights).not.called()
    expect(wireUpdater.updateWireConnectionsAtStage).not.called()
    expect(entity.getWorldOrPreviewEntity(2)).toBeNil()
  })
  test("with updating firstStage", () => {
    const entity = createAssemblyEntityNoCopy(
      { name: "inserter" },
      Pos(0, 0),
      defines.direction.north as defines.direction,
      2,
    )
    assembly.content.add(entity)
    WorldUpdater.updateNewWorldEntitiesWithoutWires(assembly, entity, true)
    // expect(highlighter.updateAllHighlights).calledWith(assembly, entity)
    expect(highlighter.updateAllHighlights).not.called()
    expect(wireUpdater.updateWireConnectionsAtStage).not.called()
    expect(entity.getWorldOrPreviewEntity(2)).not.toBeNil()
  })
  test("updates highlights if there are errors", () => {
    const entity = createAssemblyEntityNoCopy(
      { name: "inserter" },
      Pos(0, 0),
      defines.direction.north as defines.direction,
      2,
    )
    assembly.content.add(entity)
    surfaces[3 - 1].create_entity({ name: "stone-wall", position: entity.position })
    WorldUpdater.updateNewWorldEntitiesWithoutWires(assembly, entity, false)
    expect(highlighter.updateAllHighlights).calledWith(assembly, entity)
    expect(wireUpdater.updateWireConnectionsAtStage).not.called()
    expect(entity.getWorldOrPreviewEntity(2)).toBeNil()
    expect(findPreviewEntity(3)).not.toBeNil()
  })
})

test("updateWireConnections", () => {
  const entity = createAssemblyEntityNoCopy(
    { name: "inserter" },
    Pos(0, 0),
    defines.direction.north as defines.direction,
    2,
  )
  assembly.content.add(entity)
  WorldUpdater.updateNewWorldEntitiesWithoutWires(assembly, entity, true) // note: actually updating first stage, so below works
  WorldUpdater.updateWireConnections(assembly, entity)
  for (const i of $range(2, assembly.lastStageFor(entity))) {
    expect(wireUpdater.updateWireConnectionsAtStage).calledWith(assembly.content, entity, i)
  }
})

test("clearWorldEntity", () => {
  WorldUpdater.updateWorldEntities(assembly, entity, 1)
  WorldUpdater.clearWorldEntityAtStage(assembly, entity, 2)
  expect(highlighter.updateAllHighlights).calledWith(assembly, entity)
  expect(findMainEntity(2)).to.be.nil()
  assertEntityCorrect(1)
  assertEntityCorrect(3)
})

test("deleteWorldEntities", () => {
  WorldUpdater.updateWorldEntities(assembly, entity, 1)
  WorldUpdater.deleteAllEntities(entity)
  for (let i = 1; i <= 3; i++) assertNothingPresent(i)
  expect(highlighter.deleteAllHighlights).calledWith(entity)
})

test("makeSettingsRemnant makes all previews and calls highlighter.makeSettingsRemnant", () => {
  entity.isSettingsRemnant = true
  WorldUpdater.makeSettingsRemnant(assembly, entity)
  for (let i = 1; i <= 3; i++) assertHasPreview(i)
  expect(highlighter.makeSettingsRemnantHighlights).calledWith(assembly, entity)
})

test("updateWorldEntities calls makeSettingsRemnant", () => {
  entity.isSettingsRemnant = true
  WorldUpdater.updateWorldEntities(assembly, entity, 1)
  for (let i = 1; i <= 3; i++) assertHasPreview(i)
  expect(highlighter.makeSettingsRemnantHighlights).calledWith(assembly, entity)
})

test("tryReviveSettingsRemnant revives correct entities and calls highlighter.tryReviveSettingsRemnant", () => {
  entity.setFirstStageUnchecked(2)
  entity.isSettingsRemnant = true
  WorldUpdater.makeSettingsRemnant(assembly, entity)

  entity.isSettingsRemnant = nil
  WorldUpdater.updateEntitiesOnSettingsRemnantRevived(assembly, entity)
  assertHasPreview(1)
  assertEntityCorrect(2)
  assertEntityCorrect(3)
  expect(highlighter.updateHighlightsOnSettingsRemnantRevived).calledWith(assembly, entity)
})

test("rebuildStage", () => {
  const entity1 = createAssemblyEntityNoCopy({ name: "transport-belt" }, Pos(0, 0), nil, 1)
  const entity2 = createAssemblyEntityNoCopy({ name: "iron-chest" }, Pos(1, 1), nil, 2)
  const entity3 = createAssemblyEntityNoCopy({ name: "iron-chest" }, Pos(1, 1), nil, 2)
  assembly.content.add(entity1)
  assembly.content.add(entity2)
  assembly.content.add(entity3)

  const surface = assembly.getSurface(2)!
  const chest = surface.create_entity({
    name: "iron-chest",
    position: Pos(0, 0),
  })!

  WorldUpdater.rebuildStage(assembly, 2)

  expect(chest.valid).to.be(false)
  expect(entity1.getWorldEntity(2)).to.be.any()
  expect(entity2.getWorldEntity(2)).to.be.any()
  expect(entity3.getWorldOrPreviewEntity(2)).to.be.any()
  expect(entity3.getWorldEntity(2)).toBeNil()
})

// this duplicates WireHandler test a bit
// let's call it an integration test
describe("circuit wires", () => {
  let entity1: AssemblyEntity
  let entity2: AssemblyEntity
  before_each(() => {
    doModuleMock(_wireHandler, false) // real wire handler
    game.surfaces[1].find_entities().forEach((e) => e.destroy())
    entity1 = createAssemblyEntityNoCopy({ name: "arithmetic-combinator" }, Pos(5.5, 6), nil, 1)
    entity2 = createAssemblyEntityNoCopy({ name: "arithmetic-combinator" }, Pos(5.5, 8), nil, 1)
    assembly.content.add(entity1)
    assembly.content.add(entity2)
  })

  function doAdd() {
    WorldUpdater.updateWorldEntities(assembly, entity1, 1)
    WorldUpdater.updateWorldEntities(assembly, entity2, 1)
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
    WorldUpdater.refreshWorldEntityAtStage(assembly, entity1, 1)
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
    WorldUpdater.refreshWorldEntityAtStage(assembly, entity1, 1)
    assertSingleWire(entities)
  })
})
