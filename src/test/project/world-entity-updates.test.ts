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
import { Prototypes } from "../../constants"
import { Entity, UndergroundBeltEntity } from "../../entity/Entity"
import { forceDollyEntity } from "../../entity/picker-dollies"
import {
  addCircuitConnection,
  createProjectEntityNoCopy,
  ProjectEntity,
  StageNumber,
  UndergroundBeltProjectEntity,
} from "../../entity/ProjectEntity"
import { createEntity, createPreviewEntity, saveEntity } from "../../entity/save-load"
import { Pos } from "../../lib/geometry"
import { EntityHighlights } from "../../project/entity-highlights"
import { Project } from "../../project/ProjectDef"
import { WorldEntityUpdates } from "../../project/world-entity-updates"
import { createRollingStock } from "../entity/createRollingStock"
import { setupEntityMoveTest } from "../entity/setup-entity-move-test"
import { fMock } from "../f-mock"
import { clearModuleMock, doModuleMock, moduleMock } from "../module-mock"
import { createMockProject, setupTestSurfaces } from "./Project-mock"

interface TestEntity extends Entity {
  name: "inserter" | "fast-inserter"
  override_stack_size?: number
}
let project: Project
let entity: ProjectEntity<TestEntity>

import _wireHandler = require("../../entity/wires")

const wireUpdater = moduleMock(_wireHandler, true)
const entityHighlights = fMock<EntityHighlights>()

const origPos = { x: 0.5, y: 0.5 }
const origDir = defines.direction.east
const surfaces: LuaSurface[] = setupTestSurfaces(4)

let worldEntityUpdates: WorldEntityUpdates
before_each(() => {
  project = createMockProject(surfaces)
  project.entityUpdates = worldEntityUpdates = WorldEntityUpdates(project, entityHighlights)
  entity = createProjectEntityNoCopy(
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
  expect(findAnyEntity(i)).toBeNil()
  expect(entity.getWorldOrPreviewEntity(i)).toBeNil()
}
function assertHasPreview(i: StageNumber): void {
  expect(findMainEntity(i)).toBeNil()
  expect(findPreviewEntity(i)).toBeAny().and.toEqual(entity.getWorldOrPreviewEntity(i))
}

function assertEntityCorrect(i: StageNumber): LuaEntity {
  const worldEntity = expect(findMainEntity(i)).toBeAny().getValue()
  const value = saveEntity(worldEntity)
  const valueAtStage = entity.getValueAtStage(i)
  expect(valueAtStage).toEqual(value)
  expect(entity.direction).toBe(worldEntity.direction)
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
      worldEntityUpdates.refreshWorldEntityAtStage(entity, stage)
      assertEntityCorrect(stage)
    })
    test("can create all entities", () => {
      worldEntityUpdates.updateWorldEntities(entity, 1)
      for (let i = 1; i <= 4; i++) assertEntityCorrect(i)
    })

    test("does not create entities past lastStage", () => {
      entity.setLastStageUnchecked(3)
      worldEntityUpdates.updateWorldEntities(entity, 1)
      for (let i = 1; i <= 3; i++) assertEntityCorrect(i)
      assertNothingPresent(4)
    })

    test("if first stage passed is past last stage, does nothing", () => {
      entity.setLastStageUnchecked(3)
      worldEntityUpdates.updateWorldEntities(entity, 4)
      for (let i = 1; i <= 4; i++) assertNothingPresent(i)
    })

    test("can refresh a single entity", () => {
      const replaced = createEntity(project.getSurface(2)!, entity.position, entity.direction, {
        name: "inserter",
        override_stack_size: 3,
      } as TestEntity)!
      entity.replaceWorldEntity(2, replaced)
      worldEntityUpdates.refreshWorldEntityAtStage(entity, 2)
      const val = assertEntityCorrect(2)
      expect(replaced).toEqual(val)
    })

    test("attempting to refresh world entity past last stage deletes entity if it exists", () => {
      entity.setLastStageUnchecked(3)
      entity.replaceWorldOrPreviewEntity(4, {} as any)
      worldEntityUpdates.refreshWorldEntityAtStage(entity, 4)
      assertNothingPresent(4)
    })

    test("replaces deleted entity", () => {
      worldEntityUpdates.refreshWorldEntityAtStage(entity, 3)
      entity.getWorldEntity(3)!.destroy()
      assertNothingPresent(3)
      worldEntityUpdates.refreshWorldEntityAtStage(entity, 3)
      assertEntityCorrect(3)
    })

    test("can upgrade entities", () => {
      worldEntityUpdates.refreshWorldEntityAtStage(entity, 1)
      entity._applyDiffAtStage(1, { name: "fast-inserter" })
      worldEntityUpdates.refreshWorldEntityAtStage(entity, 1)
      assertEntityCorrect(1)
    })
  })

  test("does nothing if range is empty", () => {
    worldEntityUpdates.updateWorldEntities(entity, 5)
    for (let i = 1; i <= 3; i++) assertNothingPresent(i)
  })

  test("creates preview entities in stages below first stage", () => {
    entity.setFirstStageUnchecked(3)
    worldEntityUpdates.updateWorldEntities(entity, 1)
    assertHasPreview(1)
    assertHasPreview(2)
    assertEntityCorrect(3)
  })

  test("calls wireUpdater", () => {
    worldEntityUpdates.updateWorldEntities(entity, 1)
    for (let i = 1; i <= 3; i++)
      expect(wireUpdater.updateWireConnectionsAtStage).toHaveBeenCalledWith(project.content, entity, i)
  })

  function assertDestructible(luaEntity: LuaEntity, value: boolean) {
    expect(luaEntity.minable).toBe(value)
    expect(luaEntity.rotatable).toBe(value)
    expect(luaEntity.destructible).toBe(false)
  }

  test.each([true, false])("entities not in first stage are indestructible, with existing: %s", (withExisting) => {
    entity.setFirstStageUnchecked(2)
    if (withExisting) {
      const luaEntity = createEntity(project.getSurface(3)!, entity.position, entity.direction, {
        name: "inserter",
        override_stack_size: 3,
      } as TestEntity)!
      entity.replaceWorldEntity(3, luaEntity)
    }
    worldEntityUpdates.updateWorldEntities(entity, 1)

    assertDestructible(assertEntityCorrect(2), true)
    assertDestructible(assertEntityCorrect(3), false)
    assertDestructible(assertEntityCorrect(4), false)
  })

  test("can handle entity moving up", () => {
    worldEntityUpdates.updateWorldEntities(entity, 1)
    entity.setFirstStageUnchecked(2)
    worldEntityUpdates.updateWorldEntities(entity, 1)

    expect(findMainEntity(1)).toBeNil()
    assertHasPreview(1)
    assertDestructible(assertEntityCorrect(2), true)
    assertDestructible(assertEntityCorrect(3), false)
  })

  test("can rotate entities", () => {
    worldEntityUpdates.updateWorldEntities(entity, 1)
    entity.direction = defines.direction.west
    worldEntityUpdates.updateWorldEntities(entity, 1)
    for (let i = 1; i <= 3; i++) assertEntityCorrect(i)
  })

  test("can un-rotate entities", () => {
    worldEntityUpdates.updateWorldEntities(entity, 1)
    entity.getWorldEntity(2)!.direction = defines.direction.west
    worldEntityUpdates.refreshWorldEntityAtStage(entity, 2)
    for (let i = 1; i <= 3; i++) assertEntityCorrect(i)
  })

  test("calls updateHighlights", () => {
    worldEntityUpdates.updateWorldEntities(entity, 1)
    expect(entityHighlights.updateAllHighlights).toHaveBeenCalledWith(entity)
  })

  test("entity preview in all previous stages if is rolling stock", () => {
    const rollingStock = createRollingStock(surfaces[2 - 1])
    const value = saveEntity(rollingStock)!
    entity = createProjectEntityNoCopy(value, rollingStock.position, rollingStock.direction, 2) as any
    rollingStock.destroy()

    worldEntityUpdates.updateWorldEntities(entity, 1)

    assertHasPreview(1)
    const worldEntity = expect(findMainEntity(2)).toBeAny().getValue()
    const foundValue = saveEntity(worldEntity)
    expect(foundValue).toEqual(value)
    assertNothingPresent(3)
  })

  test("refreshWorldEntityAtStage also builds previews", () => {
    entity.setFirstStageUnchecked(2)
    worldEntityUpdates.refreshWorldEntityAtStage(entity, 1)
    assertHasPreview(1)
  })
})

test("rebuildWorldEntityAtStage replaces old value", () => {
  worldEntityUpdates.refreshWorldEntityAtStage(entity, 2)
  const value = assertEntityCorrect(2)
  worldEntityUpdates.rebuildWorldEntityAtStage(entity, 2)
  expect(value.valid).toBe(false)
  assertEntityCorrect(2)
})

describe("updateWorldEntitiesOnLastStageChanged", () => {
  test("moving up creates entities", () => {
    entity.setFirstStageUnchecked(2)
    entity.setLastStageUnchecked(2)
    worldEntityUpdates.updateWorldEntities(entity, 1)
    assertHasPreview(1)
    assertEntityCorrect(2)
    assertNothingPresent(3)
    assertNothingPresent(4)

    clearModuleMock(_wireHandler)

    entity.setLastStageUnchecked(3)
    worldEntityUpdates.updateWorldEntitiesOnLastStageChanged(entity, 2)
    assertHasPreview(1)
    assertEntityCorrect(2)
    assertEntityCorrect(3)
    assertNothingPresent(4)

    expect(wireUpdater.updateWireConnectionsAtStage).toHaveBeenCalledWith(project.content, entity, 3)
    expect(entityHighlights.updateAllHighlights).toHaveBeenCalledWith(entity)
  })

  test("moving down destroys entities", () => {
    entity.setFirstStageUnchecked(2)
    entity.setLastStageUnchecked(3)
    worldEntityUpdates.updateWorldEntities(entity, 1)
    assertHasPreview(1)
    assertEntityCorrect(2)
    assertEntityCorrect(3)
    assertNothingPresent(4)

    entity.setLastStageUnchecked(2)
    worldEntityUpdates.updateWorldEntitiesOnLastStageChanged(entity, 3)
    assertHasPreview(1)
    assertEntityCorrect(2)
    assertNothingPresent(3)
    assertNothingPresent(4)

    expect(entityHighlights.updateAllHighlights).toHaveBeenCalledWith(entity)
  })
})

describe("tryMoveEntity", () => {
  // use real entities
  const { entities, origPos } = setupEntityMoveTest(4, nil, origDir)
  before_each(() => {
    entities.forEach((e, i) => {
      entity.replaceWorldEntity(i + 1, e)
    })
    project.content.add(entity)
    project.content.changePosition(entity, origPos)
  })
  const newPos = Pos(1.5, 2)
  const newDir = defines.direction.north

  function assertMoved() {
    for (let i = 0; i < 4; i++) {
      const luaEntity = entities[i]
      if (!luaEntity.valid) continue
      expect(luaEntity.position).toEqual(newPos)
      expect(luaEntity.direction).toBe(newDir)
    }
    expect(entity.position).toEqual(newPos)
    expect(entity.direction).toBe(newDir)

    expect(project.content.findCompatibleByProps(entity.getNameAtStage(1), newPos, newDir, 1)).toBe(entity)
  }

  function assertNotMoved() {
    for (let i = 0; i < 4; i++) {
      const luaEntity = entities[i]
      if (!luaEntity.valid) continue
      expect(luaEntity.position).toEqual(origPos)
      expect(luaEntity.direction).toBe(origDir)
    }
    expect(entity.position).toEqual(origPos)
    expect(entity.direction).toBe(origDir)

    expect(project.content.findCompatibleByProps(entity.getNameAtStage(1), origPos, origDir, 1)).toBe(entity)
  }

  test("can move entity if moved in first stage", () => {
    expect(forceDollyEntity(entities[0], newPos, newDir)).toBe(true)
    const result = worldEntityUpdates.tryDollyEntities(entity, 1)
    expect(result).toBe("success")
    assertMoved()
  })

  test("can't move entity if moved in later stage", () => {
    expect(forceDollyEntity(entities[1], newPos, newDir)).toBe(true)
    const result = worldEntityUpdates.tryDollyEntities(entity, 2)
    expect(result).toBe("cannot-move")
    assertNotMoved()
  })

  test("can't move if world entities are missing in any stage", () => {
    expect(forceDollyEntity(entities[0], newPos, newDir)).toBe(true)
    entity.getWorldEntity(2)!.destroy()
    const result = worldEntityUpdates.tryDollyEntities(entity, 1)
    expect(result).toBe("entities-missing")
    assertNotMoved()
  })

  describe("with wire connections", () => {
    let otherEntity: ProjectEntity
    before_each(() => {
      otherEntity = createProjectEntityNoCopy(
        { name: "small-electric-pole" },
        Pos(-0.5, 0.5),
        defines.direction.north,
        1,
      )
      project.content.add(otherEntity)
    })

    test("can't move if cable connected missing in all stages", () => {
      entity.tryAddDualCableConnection(otherEntity) // uh, this is a bit hacky, cable connection directly onto inserter?

      expect(forceDollyEntity(entities[0], newPos, newDir)).toBe(true)
      const result = worldEntityUpdates.tryDollyEntities(entity, 1)
      expect(result).toBe("connected-entities-missing")
    })

    test("can't move if circuit connected missing in all stages", () => {
      addCircuitConnection({
        fromEntity: entity,
        toEntity: otherEntity,
        fromId: 1,
        toId: 1,
        wire: defines.wire_type.red,
      })

      expect(forceDollyEntity(entities[0], newPos, newDir)).toBe(true)
      const result = worldEntityUpdates.tryDollyEntities(entity, 1)
      expect(result).toBe("connected-entities-missing")
    })

    test("can move if entity present in at least one stage", () => {
      entity.tryAddDualCableConnection(otherEntity)
      addCircuitConnection({
        fromEntity: entity,
        toEntity: otherEntity,
        fromId: 1,
        toId: 1,
        wire: defines.wire_type.red,
      })
      expect(forceDollyEntity(entities[0], newPos, newDir)).toBe(true)

      otherEntity.replaceWorldEntity(
        2,
        surfaces[0].create_entity({
          name: "small-electric-pole",
          position: newPos,
          direction: newDir,
        }),
      )

      const result = worldEntityUpdates.tryDollyEntities(entity, 1)
      expect(result).toBe("success")
      assertMoved()
    })
  })
})

describe("updateNewEntityWithoutWires", () => {
  test("can update", () => {
    const entity = createProjectEntityNoCopy({ name: "inserter" }, Pos(0, 0), defines.direction.north, 2)
    project.content.add(entity)
    worldEntityUpdates.updateNewWorldEntitiesWithoutWires(entity)
    expect(entityHighlights.updateAllHighlights).not.toHaveBeenCalled()
    expect(wireUpdater.updateWireConnectionsAtStage).not.toHaveBeenCalled()
    expect(entity.getWorldOrPreviewEntity(2)).not.toBeNil()
  })
  test("updates highlights if there are errors", () => {
    const entity = createProjectEntityNoCopy({ name: "inserter" }, Pos(0, 0), defines.direction.north, 2)
    project.content.add(entity)
    surfaces[3 - 1].create_entity({ name: "stone-wall", position: entity.position })
    worldEntityUpdates.updateNewWorldEntitiesWithoutWires(entity)
    expect(entityHighlights.updateAllHighlights).toHaveBeenCalledWith(entity)
    expect(wireUpdater.updateWireConnectionsAtStage).not.toHaveBeenCalled()
    expect(entity.getWorldOrPreviewEntity(2)).not.toBeNil()
    expect(findPreviewEntity(3)).not.toBeNil()
  })
})

test("updateWireConnections", () => {
  const entity = createProjectEntityNoCopy({ name: "inserter" }, Pos(0, 0), defines.direction.north, 2)
  project.content.add(entity)
  // note: actually updating the first stage, so below works
  worldEntityUpdates.updateNewWorldEntitiesWithoutWires(entity) //
  worldEntityUpdates.updateWireConnections(entity)
  for (const i of $range(2, project.lastStageFor(entity))) {
    expect(wireUpdater.updateWireConnectionsAtStage).toHaveBeenCalledWith(project.content, entity, i)
  }
})

test("clearWorldEntityAtStage", () => {
  entity.applyUpgradeAtStage(2, "fast-inserter")
  worldEntityUpdates.updateWorldEntities(entity, 1)
  worldEntityUpdates.clearWorldEntityAtStage(entity, 2)
  expect(entityHighlights.updateAllHighlights).toHaveBeenCalledWith(entity)
  expect(findMainEntity(2)).toBeNil()
  expect(findPreviewEntity(2)?.name).toBe(Prototypes.PreviewEntityPrefix + "fast-inserter")
  assertEntityCorrect(1)
  assertEntityCorrect(3)
})

test("deleteWorldEntities", () => {
  worldEntityUpdates.updateWorldEntities(entity, 1)
  worldEntityUpdates.deleteWorldEntities(entity)
  for (let i = 1; i <= 3; i++) assertNothingPresent(i)
  expect(entityHighlights.deleteAllHighlights).toHaveBeenCalledWith(entity)
})

describe("underground pair", () => {
  let leftWorldEntity: LuaEntity
  let middleUg: ProjectEntity<UndergroundBeltEntity>
  let rightUg: ProjectEntity<UndergroundBeltEntity>
  before_each(() => {
    leftWorldEntity = surfaces[0].create_entity({
      name: "underground-belt",
      type: "output",
      position: Pos(-0.5, 0.5),
      direction: defines.direction.west,
      force: "player",
    })!
    assert(leftWorldEntity)
    middleUg = createProjectEntityNoCopy(
      { name: "underground-belt", type: "input" },
      Pos(0.5, 0.5),
      defines.direction.east,
      1,
    ) as UndergroundBeltProjectEntity
    worldEntityUpdates.updateWorldEntities(middleUg, 1)
    const middleWorldEntity = middleUg.getWorldEntity(1)!
    assert(middleWorldEntity)

    rightUg = createProjectEntityNoCopy(
      { name: "underground-belt", type: "output" },
      Pos(1.5, 0.5),
      defines.direction.east,
      1,
    ) as UndergroundBeltProjectEntity
    project.content.add(rightUg)
    worldEntityUpdates.updateWorldEntities(rightUg, 1)

    expect(rightUg.getWorldEntity(1)).toMatchTable({
      neighbours: middleWorldEntity,
    })
  })
  test("deleteWorldEntities on underground belt calls update highlights on all pairs", () => {
    middleUg.replaceWorldEntity(
      1,
      createPreviewEntity(
        surfaces[0],
        Pos(0.5, 0.5),
        defines.direction.east,
        Prototypes.PreviewEntityPrefix + "underground-belt",
      ),
    )
    worldEntityUpdates.deleteWorldEntities(middleUg)
    expect(middleUg.getWorldOrPreviewEntity(1)).toBeNil()
  })
  test("bug: deleteWorldEntities on underground belt does not crash if is preview", () => {
    worldEntityUpdates.deleteWorldEntities(middleUg)
    expect(rightUg.getWorldEntity(1)).toMatchTable({
      neighbours: leftWorldEntity,
    })
    expect(rightUg.hasErrorAt(1)).toBe(true)
  })
  test("refreshWorldEntityAtStage with force=true still rotates underground even if errored", () => {
    // manually break right underground
    rightUg.setTypeProperty("input")
    rightUg.direction = defines.direction.west
    expect(rightUg.hasErrorAt(1)).toBe(true)

    middleUg.getWorldEntity(1)!.rotate()
    worldEntityUpdates.refreshWorldEntityAtStage(middleUg, 1)

    // expect rotated back
    expect(rightUg).toMatchTable({
      firstValue: { type: "input" },
      direction: defines.direction.west,
    })
    expect(middleUg).toMatchTable({
      firstValue: { type: "input" },
      direction: defines.direction.east,
    })
    // still broken
    expect(rightUg.getWorldEntity(1)).toMatchTable({
      belt_to_ground_type: "output",
      direction: defines.direction.east,
    })
    expect(middleUg.getWorldEntity(1)).toMatchTable({
      belt_to_ground_type: "input",
      direction: defines.direction.east,
    })
  })
})

test("makeSettingsRemnant makes all previews and calls highlighter.makeSettingsRemnant", () => {
  entity.isSettingsRemnant = true
  worldEntityUpdates.makeSettingsRemnant(entity)
  for (let i = 1; i <= 3; i++) assertHasPreview(i)
  expect(entityHighlights.makeSettingsRemnantHighlights).toHaveBeenCalledWith(entity)
})

test("updateWorldEntities calls makeSettingsRemnant", () => {
  entity.isSettingsRemnant = true
  worldEntityUpdates.updateWorldEntities(entity, 1)
  for (let i = 1; i <= 3; i++) assertHasPreview(i)
  expect(entityHighlights.makeSettingsRemnantHighlights).toHaveBeenCalledWith(entity)
})

test("tryReviveSettingsRemnant revives correct entities and calls highlighter.tryReviveSettingsRemnant", () => {
  entity.setFirstStageUnchecked(2)
  entity.isSettingsRemnant = true
  worldEntityUpdates.makeSettingsRemnant(entity)

  entity.isSettingsRemnant = nil
  worldEntityUpdates.reviveSettingsRemnant(entity)
  assertHasPreview(1)
  assertEntityCorrect(2)
  assertEntityCorrect(3)
  expect(entityHighlights.updateHighlightsOnReviveSettingsRemnant).toHaveBeenCalledWith(entity)
})

test("rebuildStage", () => {
  const entity1 = createProjectEntityNoCopy({ name: "transport-belt" }, Pos(0, 0), nil, 1)
  const entity2 = createProjectEntityNoCopy({ name: "iron-chest" }, Pos(1, 1), nil, 2)
  const entity3 = createProjectEntityNoCopy({ name: "iron-chest" }, Pos(1, 1), nil, 2)
  project.content.add(entity1)
  project.content.add(entity2)
  project.content.add(entity3)

  const surface = project.getSurface(2)!
  const chest = surface.create_entity({
    name: "iron-chest",
    position: Pos(0, 0),
  })!

  worldEntityUpdates.rebuildStage(2)

  expect(chest.valid).toBe(false)
  expect(entity1.getWorldEntity(2)).toBeAny()
  expect(entity2.getWorldEntity(2)).toBeAny()
  expect(entity3.getWorldOrPreviewEntity(2)).toBeAny()
  expect(entity3.getWorldEntity(2)).toBeNil()
})

// this duplicates WireHandler test a bit
// let's call it an integration test
describe("circuit wires", () => {
  let entity1: ProjectEntity
  let entity2: ProjectEntity
  before_each(() => {
    doModuleMock(_wireHandler, false) // real wire handler
    game.surfaces[1].find_entities().forEach((e) => e.destroy())
    entity1 = createProjectEntityNoCopy({ name: "arithmetic-combinator" }, Pos(5.5, 6), nil, 1)
    entity2 = createProjectEntityNoCopy({ name: "arithmetic-combinator" }, Pos(5.5, 8), nil, 1)
    project.content.add(entity1)
    project.content.add(entity2)
  })

  function doAdd() {
    worldEntityUpdates.updateWorldEntities(entity1, 1)
    worldEntityUpdates.updateWorldEntities(entity2, 1)
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

  function addWireToProject() {
    addCircuitConnection({
      fromEntity: entity1,
      toEntity: entity2,
      wire: defines.wire_type.red,
      fromId: defines.circuit_connector_id.combinator_input,
      toId: defines.circuit_connector_id.combinator_output,
    })
  }

  function assertSingleWire({ luaEntity1, luaEntity2 }: { luaEntity1: LuaEntity; luaEntity2: LuaEntity }): void {
    expect(luaEntity1.circuit_connection_definitions).toEqual([
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
    worldEntityUpdates.refreshWorldEntityAtStage(entity1, 1)
    expect(luaEntity1.circuit_connection_definitions ?? []).toEqual([])
    expect(luaEntity2.circuit_connection_definitions ?? []).toEqual([])
  })
  test("can add circuit wires", () => {
    addWireToProject()
    assertSingleWire(doAdd())
  })
  test("can remove extra circuit wires", () => {
    addWireToProject()
    const entities = doAdd()
    addExtraWires(entities)
    worldEntityUpdates.refreshWorldEntityAtStage(entity1, 1)
    assertSingleWire(entities)
  })
})
