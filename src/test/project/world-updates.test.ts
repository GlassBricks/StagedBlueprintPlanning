// Copyright (c) 2022-2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { BlueprintInsertPlan, EventData, LuaEntity, LuaSurface } from "factorio:runtime"
import expect from "tstl-expect"
import { Prototypes } from "../../constants"
import { Entity, UndergroundBeltEntity } from "../../entity/Entity"
import {
  addWireConnection,
  newProjectEntity,
  ProjectEntity,
  StageNumber,
  UndergroundBeltProjectEntity,
} from "../../entity/ProjectEntity"
import { createProjectTile } from "../../tiles/ProjectTile"
import { createEntity, createPreviewEntity, saveEntity } from "../../entity/save-load"
import { Events } from "../../lib"
import { BBox, Pos } from "../../lib/geometry"
import { EntityHighlights } from "../../project/entity-highlights"
import { Project } from "../../project/ProjectDef"
import { WorldUpdates } from "../../project/world-updates"
import { createRollingStock } from "../entity/createRollingStock"
import { moduleInsertPlan, simpleInsertPlan } from "../entity/entity-util"
import { fMock } from "../f-mock"
import { clearModuleMock, doModuleMock, moduleMock } from "../module-mock"
import { createMockProject, setupTestSurfaces } from "./Project-mock"

interface TestEntity extends Entity {
  name: "inserter" | "fast-inserter" | "assembling-machine-3"
  override_stack_size?: number
  recipe?: string
  items?: BlueprintInsertPlan[]
}
let project: Project
let entity: ProjectEntity<TestEntity>

import _wireHandler = require("../../entity/wires")

const wireUpdater = moduleMock(_wireHandler, true)
const entityHighlights = fMock<EntityHighlights>()

const origPos = { x: 0.5, y: 0.5 }
const origDir = defines.direction.east
const surfaces: LuaSurface[] = setupTestSurfaces(4)

let worldUpdates: WorldUpdates
before_each(() => {
  project = createMockProject(surfaces)
  project.worldUpdates = worldUpdates = WorldUpdates(project, entityHighlights)
  entity = newProjectEntity(
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
  const [value] = saveEntity(worldEntity)
  const valueAtStage = entity.getValueAtStage(i)
  expect(valueAtStage).toEqual(value)
  expect(entity.direction).toBe(worldEntity.direction)
  return worldEntity
}

describe("updateWorldEntities()", () => {
  describe.each([false, true])("with entity changes %s", (withChanges) => {
    if (withChanges) {
      before_each(() => {
        entity._applyDiffAtStage(entity.firstStage, { override_stack_size: 2 })
        entity._applyDiffAtStage(3, { override_stack_size: 1 })
      })
    }
    test.each([1, 2, 3, 4])("can create one entity at stage %d", (stage) => {
      worldUpdates.refreshWorldEntityAtStage(entity, stage)
      assertEntityCorrect(stage)
    })
    test("can create all entities", () => {
      worldUpdates.updateWorldEntities(entity, 1)
      for (let i = 1; i <= 4; i++) assertEntityCorrect(i)
    })

    test("does not create entities past lastStage", () => {
      entity.setLastStageUnchecked(3)
      worldUpdates.updateWorldEntities(entity, 1)
      for (let i = 1; i <= 3; i++) assertEntityCorrect(i)
      assertNothingPresent(4)
    })

    test("if first stage passed is past last stage, does nothing", () => {
      entity.setLastStageUnchecked(3)
      worldUpdates.updateWorldEntities(entity, 4)
      for (let i = 1; i <= 4; i++) assertNothingPresent(i)
    })

    test("can refresh a single entity", () => {
      const replaced = createEntity(
        project.getSurface(2)!,
        entity.position,
        entity.direction,
        {
          name: "inserter",
          override_stack_size: 3,
        } as TestEntity,
        nil,
      )!
      entity.replaceWorldEntity(2, replaced)
      worldUpdates.refreshWorldEntityAtStage(entity, 2)
      const val = assertEntityCorrect(2)
      expect(replaced).toEqual(val)
    })

    test("attempting to refresh world entity past last stage deletes entity if it exists", () => {
      entity.setLastStageUnchecked(3)
      entity.replaceWorldOrPreviewEntity(4, {} as any)
      worldUpdates.refreshWorldEntityAtStage(entity, 4)
      assertNothingPresent(4)
    })

    test("replaces deleted entity", () => {
      worldUpdates.refreshWorldEntityAtStage(entity, 3)
      entity.getWorldEntity(3)!.destroy()
      assertNothingPresent(3)
      worldUpdates.refreshWorldEntityAtStage(entity, 3)
      assertEntityCorrect(3)
    })

    test("can upgrade entities", () => {
      worldUpdates.refreshWorldEntityAtStage(entity, 1)
      entity._applyDiffAtStage(1, { name: "fast-inserter" })
      worldUpdates.refreshWorldEntityAtStage(entity, 1)
      assertEntityCorrect(1)
    })
  })

  test("does nothing if range is empty", () => {
    worldUpdates.updateWorldEntities(entity, 5)
    for (let i = 1; i <= 3; i++) assertNothingPresent(i)
  })

  test("creates preview entities in stages below first stage", () => {
    entity.setFirstStageUnchecked(3)
    worldUpdates.updateWorldEntities(entity, 1)
    assertHasPreview(1)
    assertHasPreview(2)
    assertEntityCorrect(3)
  })

  test("calls wireUpdater", () => {
    worldUpdates.updateWorldEntities(entity, 1)
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
      const luaEntity = createEntity(
        project.getSurface(3)!,
        entity.position,
        entity.direction,
        {
          name: "inserter",
          override_stack_size: 3,
        } as TestEntity,
        nil,
      )!
      entity.replaceWorldEntity(3, luaEntity)
    }
    worldUpdates.updateWorldEntities(entity, 1)

    assertDestructible(assertEntityCorrect(2), true)
    assertDestructible(assertEntityCorrect(3), false)
    assertDestructible(assertEntityCorrect(4), false)
  })

  test("can handle entity moving up", () => {
    worldUpdates.updateWorldEntities(entity, 1)
    entity.setFirstStageUnchecked(2)
    worldUpdates.updateWorldEntities(entity, 1)

    expect(findMainEntity(1)).toBeNil()
    assertHasPreview(1)
    assertDestructible(assertEntityCorrect(2), true)
    assertDestructible(assertEntityCorrect(3), false)
  })

  test("can rotate entities", () => {
    worldUpdates.updateWorldEntities(entity, 1)
    entity.direction = defines.direction.west
    worldUpdates.updateWorldEntities(entity, 1)
    for (let i = 1; i <= 3; i++) assertEntityCorrect(i)
  })

  test("can un-rotate entities", () => {
    worldUpdates.updateWorldEntities(entity, 1)
    entity.getWorldEntity(2)!.direction = defines.direction.west
    worldUpdates.refreshWorldEntityAtStage(entity, 2)
    for (let i = 1; i <= 3; i++) assertEntityCorrect(i)
  })

  test("calls updateHighlights", () => {
    worldUpdates.updateWorldEntities(entity, 1)
    expect(entityHighlights.updateAllHighlights).toHaveBeenCalledWith(entity)
  })

  test("entity preview in all previous stages if is rolling stock", () => {
    const rollingStock = createRollingStock(surfaces[2 - 1])
    const [value] = saveEntity(rollingStock)
    entity = newProjectEntity(value!, rollingStock.position, rollingStock.direction, 2) as any
    rollingStock.destroy()

    worldUpdates.updateWorldEntities(entity, 1)

    assertHasPreview(1)
    const worldEntity = expect(findMainEntity(2)).toBeAny().getValue()
    const [foundValue] = saveEntity(worldEntity)
    expect(foundValue).toEqual(value)
    assertNothingPresent(3)
  })

  test("refreshWorldEntityAtStage also builds previews", () => {
    entity.setFirstStageUnchecked(2)
    worldUpdates.refreshWorldEntityAtStage(entity, 1)
    assertHasPreview(1)
  })

  test("can insert modules", () => {
    entity.setFirstValueDirectly({
      name: "assembling-machine-3",
      items: [moduleInsertPlan(defines.inventory.crafter_modules, 4, 0, "productivity-module-3")],
    })

    worldUpdates.updateWorldEntities(entity, 2)
    const luaEntity = expect(findMainEntity(2)).toBeAny().getValue()

    expect(luaEntity.get_module_inventory()?.get_item_count("productivity-module-3")).toBe(4)
  })

  test("can insert modules and item requests", () => {
    entity.setFirstValueDirectly({
      name: "assembling-machine-3",
      recipe: "iron-gear-wheel",
      items: [moduleInsertPlan(defines.inventory.crafter_modules, 4, 0, "productivity-module-3")],
    })
    const plateInsertPlan = simpleInsertPlan(defines.inventory.crafter_input, "iron-plate", 0)
    entity.setUnstagedValue(2, {
      items: [plateInsertPlan],
    })

    worldUpdates.updateWorldEntities(entity, 2)
    const luaEntity = expect(findMainEntity(2)).toBeAny().getValue()

    expect(luaEntity.get_module_inventory()?.get_item_count("productivity-module-3")).toBe(4)
    expect(luaEntity.item_request_proxy?.insert_plan).toEqual([plateInsertPlan])
  })
})

test("rebuildWorldEntityAtStage replaces old value", () => {
  worldUpdates.refreshWorldEntityAtStage(entity, 2)
  const value = assertEntityCorrect(2)
  worldUpdates.rebuildWorldEntityAtStage(entity, 2)
  expect(value.valid).toBe(false)
  assertEntityCorrect(2)
})

describe("updateWorldEntitiesOnLastStageChanged()", () => {
  test("moving up creates entities", () => {
    entity.setFirstStageUnchecked(2)
    entity.setLastStageUnchecked(2)
    worldUpdates.updateWorldEntities(entity, 1)
    assertHasPreview(1)
    assertEntityCorrect(2)
    assertNothingPresent(3)
    assertNothingPresent(4)

    clearModuleMock(_wireHandler)

    entity.setLastStageUnchecked(3)
    worldUpdates.updateWorldEntitiesOnLastStageChanged(entity, 2)
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
    worldUpdates.updateWorldEntities(entity, 1)
    assertHasPreview(1)
    assertEntityCorrect(2)
    assertEntityCorrect(3)
    assertNothingPresent(4)

    entity.setLastStageUnchecked(2)
    worldUpdates.updateWorldEntitiesOnLastStageChanged(entity, 3)
    assertHasPreview(1)
    assertEntityCorrect(2)
    assertNothingPresent(3)
    assertNothingPresent(4)

    expect(entityHighlights.updateAllHighlights).toHaveBeenCalledWith(entity)
  })
})

describe("updateNewEntityWithoutWires()", () => {
  test("can update", () => {
    const entity = newProjectEntity({ name: "inserter" }, Pos(0, 0), defines.direction.north, 2)
    project.content.addEntity(entity)
    worldUpdates.updateNewWorldEntitiesWithoutWires(entity)
    expect(entityHighlights.updateAllHighlights).not.toHaveBeenCalled()
    expect(wireUpdater.updateWireConnectionsAtStage).not.toHaveBeenCalled()
    expect(entity.getWorldOrPreviewEntity(2)).not.toBeNil()
  })
  test("updates highlights if there are errors", () => {
    const entity = newProjectEntity({ name: "inserter" }, Pos(0, 0), defines.direction.north, 2)
    project.content.addEntity(entity)
    surfaces[3 - 1].create_entity({ name: "stone-wall", position: entity.position })
    worldUpdates.updateNewWorldEntitiesWithoutWires(entity)
    expect(entityHighlights.updateAllHighlights).toHaveBeenCalledWith(entity)
    expect(wireUpdater.updateWireConnectionsAtStage).not.toHaveBeenCalled()
    expect(entity.getWorldOrPreviewEntity(2)).not.toBeNil()
    expect(findPreviewEntity(3)).not.toBeNil()
  })
})

test("updateWireConnections", () => {
  const entity = newProjectEntity({ name: "inserter" }, Pos(0, 0), defines.direction.north, 2)
  project.content.addEntity(entity)
  // note: actually updating the first stage, so below works
  worldUpdates.updateNewWorldEntitiesWithoutWires(entity) //
  worldUpdates.updateWireConnections(entity)
  for (const i of $range(2, project.lastStageFor(entity))) {
    expect(wireUpdater.updateWireConnectionsAtStage).toHaveBeenCalledWith(project.content, entity, i)
  }
})

test("clearWorldEntityAtStage", () => {
  entity.applyUpgradeAtStage(2, { name: "fast-inserter" })
  worldUpdates.updateWorldEntities(entity, 1)
  worldUpdates.clearWorldEntityAtStage(entity, 2)
  expect(entityHighlights.updateAllHighlights).toHaveBeenCalledWith(entity)
  expect(findMainEntity(2)).toBeNil()
  expect(findPreviewEntity(2)?.name).toBe(Prototypes.PreviewEntityPrefix + "fast-inserter")
  assertEntityCorrect(1)
  assertEntityCorrect(3)
})

test("deleteWorldEntities", () => {
  worldUpdates.updateWorldEntities(entity, 1)
  worldUpdates.deleteWorldEntities(entity)
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
    middleUg = newProjectEntity(
      { name: "underground-belt", type: "input" },
      Pos(0.5, 0.5),
      defines.direction.east,
      1,
    ) as UndergroundBeltProjectEntity
    worldUpdates.updateWorldEntities(middleUg, 1)
    const middleWorldEntity = middleUg.getWorldEntity(1)!
    assert(middleWorldEntity)

    rightUg = newProjectEntity(
      { name: "underground-belt", type: "output" },
      Pos(1.5, 0.5),
      defines.direction.east,
      1,
    ) as UndergroundBeltProjectEntity
    project.content.addEntity(rightUg)
    worldUpdates.updateWorldEntities(rightUg, 1)

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
    worldUpdates.deleteWorldEntities(middleUg)
    expect(middleUg.getWorldOrPreviewEntity(1)).toBeNil()
  })
  test("bug: deleteWorldEntities on underground belt does not crash if is preview", () => {
    worldUpdates.deleteWorldEntities(middleUg)
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
    worldUpdates.refreshWorldEntityAtStage(middleUg, 1)

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
  worldUpdates.makeSettingsRemnant(entity)
  for (let i = 1; i <= 3; i++) assertHasPreview(i)
  expect(entityHighlights.makeSettingsRemnantHighlights).toHaveBeenCalledWith(entity)
})

test("updateWorldEntities calls makeSettingsRemnant", () => {
  entity.isSettingsRemnant = true
  worldUpdates.updateWorldEntities(entity, 1)
  for (let i = 1; i <= 3; i++) assertHasPreview(i)
  expect(entityHighlights.makeSettingsRemnantHighlights).toHaveBeenCalledWith(entity)
})

test("tryReviveSettingsRemnant revives correct entities and calls highlighter.tryReviveSettingsRemnant", () => {
  entity.setFirstStageUnchecked(2)
  entity.isSettingsRemnant = true
  worldUpdates.makeSettingsRemnant(entity)

  entity.isSettingsRemnant = nil
  worldUpdates.reviveSettingsRemnant(entity)
  assertHasPreview(1)
  assertEntityCorrect(2)
  assertEntityCorrect(3)
  expect(entityHighlights.updateHighlightsOnReviveSettingsRemnant).toHaveBeenCalledWith(entity)
})

test("rebuildStage", () => {
  const entity1 = newProjectEntity({ name: "transport-belt" }, Pos(0, 0), 0, 1)
  const entity2 = newProjectEntity({ name: "iron-chest" }, Pos(1, 1), 0, 2)
  const entity3 = newProjectEntity({ name: "iron-chest" }, Pos(1, 1), 0, 2)
  project.content.addEntity(entity1)
  project.content.addEntity(entity2)
  project.content.addEntity(entity3)

  const pos1 = Pos(0, 0)
  const tile1 = createProjectTile()
  tile1.setTileAtStage(1, "concrete")
  project.content.setTile(pos1, tile1)

  const surface = project.getSurface(2)!
  const chest = surface.create_entity({
    name: "iron-chest",
    position: Pos(0, 0),
  })!

  worldUpdates.rebuildStage(2)

  expect(chest.valid).toBe(false)
  expect(entity1.getWorldEntity(2)).toBeAny()
  expect(entity2.getWorldEntity(2)).toBeAny()
  expect(entity3.getWorldOrPreviewEntity(2)).toBeAny()
  expect(entity3.getWorldEntity(2)).toBeNil()

  expect(surface.get_tile(0, 0).name).toBe("concrete")
})

// this duplicates WireHandler test a bit
// let's call it an integration test
describe("circuit wires", () => {
  let entity1: ProjectEntity
  let entity2: ProjectEntity
  before_each(() => {
    doModuleMock(_wireHandler, false) // real wire handler
    game.surfaces[1].find_entities().forEach((e) => e.destroy())
    entity1 = newProjectEntity({ name: "arithmetic-combinator" }, Pos(5.5, 6), 0, 1)
    entity2 = newProjectEntity({ name: "arithmetic-combinator" }, Pos(5.5, 8), 0, 1)
    project.content.addEntity(entity1)
    project.content.addEntity(entity2)
  })

  function doAdd() {
    worldUpdates.updateWorldEntities(entity1, 1)
    worldUpdates.updateWorldEntities(entity2, 1)
    const luaEntity1 = entity1.getWorldEntity(1)!
    const luaEntity2 = entity2.getWorldEntity(1)!
    return { luaEntity1, luaEntity2 }
  }

  function addExtraWires({ luaEntity1, luaEntity2 }: { luaEntity1: LuaEntity; luaEntity2: LuaEntity }) {
    // luaEntity1.connect_neighbour({
    //   target_entity: luaEntity2,
    //   wire: defines.wire_type.red,
    //   source_circuit_id: defines.circuit_connector_id.combinator_input,
    //   target_circuit_id: defines.circuit_connector_id.combinator_output,
    // })
    // luaEntity2.connect_neighbour({
    //   target_entity: luaEntity1,
    //   wire: defines.wire_type.green,
    //   source_circuit_id: defines.circuit_connector_id.combinator_input,
    //   target_circuit_id: defines.circuit_connector_id.combinator_output,
    // })
    luaEntity1
      .get_wire_connector(defines.wire_connector_id.combinator_input_red, true)
      .connect_to(luaEntity2.get_wire_connector(defines.wire_connector_id.combinator_output_red, true))

    luaEntity2
      .get_wire_connector(defines.wire_connector_id.combinator_input_green, true)
      .connect_to(luaEntity1.get_wire_connector(defines.wire_connector_id.combinator_output_green, true))
  }

  function addWireToProject() {
    addWireConnection({
      fromEntity: entity1,
      toEntity: entity2,
      // wire: defines.wire_type.red,
      fromId: defines.wire_connector_id.combinator_input_red,
      toId: defines.wire_connector_id.combinator_output_red,
    })
  }

  function assertSingleWire({ luaEntity1, luaEntity2 }: { luaEntity1: LuaEntity; luaEntity2: LuaEntity }): void {
    /* expect(luaEntity1.circuit_connection_definitions).toEqual([
       {
         target_entity: luaEntity2,
         wire: defines.wire_type.red,
         source_circuit_id: defines.circuit_connector_id.combinator_input,
         target_circuit_id: defines.circuit_connector_id.combinator_output,
       } as wireConnectionDefinition,
     ])*/
    expect(
      luaEntity1
        .get_wire_connector(defines.wire_connector_id.combinator_input_red, false)
        .connections.map((c) => [c.target.owner, c.target.wire_connector_id]),
    ).toEqual([[luaEntity2, defines.wire_connector_id.combinator_output_red]])
  }

  function assertNoConnections(entity: LuaEntity): void {
    for (const [, connector] of pairs(entity.get_wire_connectors(false))) {
      expect(connector.connections).toEqual([])
    }
  }

  test("can remove circuit wires", () => {
    const { luaEntity1, luaEntity2 } = doAdd()
    addExtraWires({ luaEntity1, luaEntity2 })
    worldUpdates.refreshWorldEntityAtStage(entity1, 1)
    // expect(luaEntity1.circuit_connection_definitions ?? []).toEqual([])
    // expect(luaEntity2.circuit_connection_definitions ?? []).toEqual([])
    assertNoConnections(luaEntity1)
    assertNoConnections(luaEntity2)
  })
  test("can add circuit wires", () => {
    addWireToProject()
    assertSingleWire(doAdd())
  })
  test("can remove extra circuit wires", () => {
    addWireToProject()
    const entities = doAdd()
    addExtraWires(entities)
    worldUpdates.refreshWorldEntityAtStage(entity1, 1)
    assertSingleWire(entities)
  })
})

describe("tiles", () => {
  before_each(() => {
    for (const s of surfaces) {
      s.build_checkerboard(BBox.coords(-2, -2, 2, 2))
    }
  })
  let running = false
  let events: EventData[] = []
  before_each(() => {
    running = true
  })
  Events.script_raised_set_tiles((e) => {
    if (running) {
      events.push(e)
    }
  })
  after_each(() => {
    running = false
    events = []
  })
  describe("updateTilesInRange", () => {
    const position = { x: 0, y: 0 }

    before_each(() => {
      for (let stage = 1; stage <= 4; stage++) {
        const surface = project.getSurface(stage)!
        surface.set_tiles([{ position, name: "lab-white" }], true, false)
      }
    })

    test("updates tile value in range", () => {
      const tile = createProjectTile()
      tile.setTileAtStage(2, "concrete")
      project.content.setTile(position, tile)

      worldUpdates.updateTilesInRange(position, 2, nil)

      expect(project.getSurface(1)!.get_tile(0, 0).name).toBe("lab-white")
      expect(project.getSurface(2)!.get_tile(0, 0).name).toBe("concrete")
      expect(project.getSurface(3)!.get_tile(0, 0).name).toBe("concrete")
    })

    test("handles nil values by resetting to default", () => {
      const tile = createProjectTile()
      tile.setTileAtStage(2, "concrete")
      tile.setTileAtStage(4, nil)
      project.content.setTile(position, tile)

      worldUpdates.updateTilesInRange(position, 1, nil)

      expect(project.getSurface(2)!.get_tile(0, 0).name).toBe("concrete")
      expect(project.getSurface(3)!.get_tile(0, 0).name).toBe("concrete")
      expect(project.getSurface(4)!.get_tile(0, 0).name).not.toBe("concrete")
    })

    test("respects toStage parameter", () => {
      const tile = createProjectTile()
      tile.setTileAtStage(2, "concrete")
      project.content.setTile(position, tile)

      worldUpdates.updateTilesInRange(position, 2, 3)

      expect(project.getSurface(2)!.get_tile(0, 0).name).toBe("concrete")
      expect(project.getSurface(3)!.get_tile(0, 0).name).toBe("concrete")
      expect(project.getSurface(4)!.get_tile(0, 0).name).toBe("lab-white")
    })

    test("returns collision info when tile can't be set due to entity", () => {
      const tile = createProjectTile()
      tile.setTileAtStage(1, "concrete")
      project.content.setTile(position, tile)

      for (let stage = 1; stage <= 4; stage++) {
        project.getSurface(stage)!.set_tiles([{ position, name: "concrete" }], true, false)
      }

      const surface2 = project.getSurface(2)!
      surface2.create_entity({
        name: "iron-chest",
        position: { x: 0.5, y: 0.5 },
      })

      tile.setTileAtStage(1, "water")

      const collision = worldUpdates.updateTilesInRange(position, 1, nil)

      expect(collision).not.toBeNil()
      expect(collision!.stage).toBe(2)
      expect(collision!.actualValue).toBe("concrete")

      expect(project.getSurface(1)!.get_tile(0, 0).name).toBe("water")
      expect(project.getSurface(2)!.get_tile(0, 0).name).toBe("concrete")
    })

    test("returns nil when no collision occurs", () => {
      const tile = createProjectTile()
      tile.setTileAtStage(2, "concrete")
      project.content.setTile(position, tile)

      const collision = worldUpdates.updateTilesInRange(position, 2, nil)

      expect(collision).toBeNil()
    })
  })
})
