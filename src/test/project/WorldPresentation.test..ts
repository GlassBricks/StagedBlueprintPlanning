// Copyright (c) 2022-2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { BlueprintInsertPlan, EventData, LuaEntity, LuaSurface } from "factorio:runtime"
import expect from "tstl-expect"
import { Prototypes } from "../../constants"
import { Entity, UndergroundBeltEntity } from "../../entity/Entity"
import { newProjectEntity, ProjectEntity, StageNumber, UndergroundBeltProjectEntity } from "../../entity/ProjectEntity"
import { createEntity, createPreviewEntity, saveEntity } from "../../entity/save-load"
import { Events } from "../../lib"
import { BBox, Pos } from "../../lib/geometry"
import { WorldPresentation } from "../../project/WorldPresentation"
import { createProjectTile } from "../../tiles/ProjectTile"
import { createRollingStock } from "../entity/createRollingStock"
import { moduleInsertPlan, simpleInsertPlan } from "../entity/entity-util"
import { clearModuleMock, doModuleMock, moduleMock } from "../module-mock"
import { createMockProject, MockProject, setupTestSurfaces } from "./Project-mock"

interface TestEntity extends Entity {
  name: "inserter" | "fast-inserter" | "assembling-machine-3"
  override_stack_size?: number
  recipe?: string
  items?: BlueprintInsertPlan[]
}
let project: MockProject
let entity: ProjectEntity<TestEntity>

import _wireHandler = require("../../entity/wires")

const wireUpdater = moduleMock(_wireHandler, true)

const origPos = { x: 0.5, y: 0.5 }
const origDir = defines.direction.east
const surfaces: LuaSurface[] = setupTestSurfaces(4)

function wp(): WorldPresentation {
  return project.worldPresentation
}

before_each(() => {
  project = createMockProject(surfaces)
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

const excludeFromFind: string[] = ["highlight-box"]

function findPreviewEntity(i: StageNumber) {
  return surfaces[i - 1].find_entities_filtered({
    type: ["simple-entity-with-owner", "rail-remnants"],
    limit: 1,
  })[0]
}
function findMainEntity(i: StageNumber) {
  return surfaces[i - 1].find_entities_filtered({
    type: ["simple-entity-with-owner", "rail-remnants", ...excludeFromFind],
    invert: true,
    limit: 1,
  })[0]
}
function findAnyEntity(i: StageNumber): LuaEntity | nil {
  return surfaces[i - 1].find_entities_filtered({
    type: excludeFromFind,
    invert: true,
    limit: 1,
  })[0]
}

function assertNothingPresent(i: StageNumber): void {
  if (i <= 0 || i > surfaces.length) return
  expect(findAnyEntity(i)).toBeNil()
  expect(wp().getWorldOrPreviewEntity(entity, i)).toBeNil()
}
function assertHasPreview(i: StageNumber): void {
  expect(findMainEntity(i)).toBeNil()
  expect(findPreviewEntity(i)).toBeAny().and.toEqual(wp().getWorldOrPreviewEntity(entity, i))
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
        const mut = entity._asMut()
        mut._applyDiffAtStage(entity.firstStage, { override_stack_size: 2 })
        mut._applyDiffAtStage(3, { override_stack_size: 1 })
      })
    }
    test.each([1, 2, 3, 4])("can create one entity at stage %d", (stage) => {
      wp().refreshEntity(entity, stage)
      assertEntityCorrect(stage)
    })
    test("can create all entities", () => {
      wp().updateWorldEntities(entity, 1)
      for (let i = 1; i <= 4; i++) assertEntityCorrect(i)
    })

    test("does not create entities past lastStage", () => {
      entity._asMut().setLastStageUnchecked(3)
      wp().updateWorldEntities(entity, 1)
      for (let i = 1; i <= 3; i++) assertEntityCorrect(i)
      assertNothingPresent(4)
    })

    test("if first stage passed is past last stage, does nothing", () => {
      entity._asMut().setLastStageUnchecked(3)
      wp().updateWorldEntities(entity, 4)
      for (let i = 1; i <= 4; i++) assertNothingPresent(i)
    })

    test("can refresh a single entity", () => {
      const replaced = createEntity(
        project.surfaces.getSurface(2)!,
        entity.position,
        entity.direction,
        {
          name: "inserter",
          override_stack_size: 3,
        } as TestEntity,
        nil,
      )!
      wp().replaceWorldOrPreviewEntity(entity, 2, replaced)
      wp().refreshEntity(entity, 2)
      const val = assertEntityCorrect(2)
      expect(replaced).toEqual(val)
    })

    test("attempting to refresh world entity past last stage deletes entity if it exists", () => {
      entity._asMut().setLastStageUnchecked(3)
      wp().replaceWorldOrPreviewEntity(entity, 4, {} as any)
      wp().refreshEntity(entity, 4)
      assertNothingPresent(4)
    })

    test("replaces deleted entity", () => {
      wp().refreshEntity(entity, 3)
      wp().getWorldEntity(entity, 3)!.destroy()
      assertNothingPresent(3)
      wp().refreshEntity(entity, 3)
      assertEntityCorrect(3)
    })

    test("can upgrade entities", () => {
      wp().refreshEntity(entity, 1)
      entity._asMut()._applyDiffAtStage(1, { name: "fast-inserter" })
      wp().refreshEntity(entity, 1)
      assertEntityCorrect(1)
    })
  })

  test("does nothing if range is empty", () => {
    wp().updateWorldEntities(entity, 5)
    for (let i = 1; i <= 3; i++) assertNothingPresent(i)
  })

  test("creates preview entities in stages below first stage", () => {
    entity._asMut().setFirstStageUnchecked(3)
    wp().updateWorldEntities(entity, 1)
    assertHasPreview(1)
    assertHasPreview(2)
    assertEntityCorrect(3)
  })

  test("calls wireUpdater", () => {
    wp().updateWorldEntities(entity, 1)
    for (let i = 1; i <= 3; i++)
      expect(wireUpdater.updateWireConnectionsAtStage).toHaveBeenCalledWith(
        project.content,
        entity,
        i,
        expect.anything(),
      )
  })

  function assertDestructible(luaEntity: LuaEntity, value: boolean) {
    expect(luaEntity.minable).toBe(value)
    expect(luaEntity.rotatable).toBe(value)
    expect(luaEntity.destructible).toBe(false)
  }

  test.each([true, false])("entities not in first stage are indestructible, with existing: %s", (withExisting) => {
    entity._asMut().setFirstStageUnchecked(2)
    if (withExisting) {
      const luaEntity = createEntity(
        project.surfaces.getSurface(3)!,
        entity.position,
        entity.direction,
        {
          name: "inserter",
          override_stack_size: 3,
        } as TestEntity,
        nil,
      )!
      wp().replaceWorldOrPreviewEntity(entity, 3, luaEntity)
    }
    wp().updateWorldEntities(entity, 1)

    assertDestructible(assertEntityCorrect(2), true)
    assertDestructible(assertEntityCorrect(3), false)
    assertDestructible(assertEntityCorrect(4), false)
  })

  test("can handle entity moving up", () => {
    wp().updateWorldEntities(entity, 1)
    entity._asMut().setFirstStageUnchecked(2)
    wp().updateWorldEntities(entity, 1)

    expect(findMainEntity(1)).toBeNil()
    assertHasPreview(1)
    assertDestructible(assertEntityCorrect(2), true)
    assertDestructible(assertEntityCorrect(3), false)
  })

  test("can rotate entities", () => {
    wp().updateWorldEntities(entity, 1)
    entity._asMut().direction = defines.direction.west
    wp().updateWorldEntities(entity, 1)
    for (let i = 1; i <= 3; i++) assertEntityCorrect(i)
  })

  test("can un-rotate entities", () => {
    wp().updateWorldEntities(entity, 1)
    wp().getWorldEntity(entity, 2)!.direction = defines.direction.west
    wp().refreshEntity(entity, 2)
    for (let i = 1; i <= 3; i++) assertEntityCorrect(i)
  })

  test("updates highlights", () => {
    wp().updateWorldEntities(entity, 1)
    // highlights are updated - verified by integration tests
  })

  test("entity preview in all previous stages if is rolling stock", () => {
    const rollingStock = createRollingStock(surfaces[2 - 1])
    const [value] = saveEntity(rollingStock)
    entity = newProjectEntity(value!, rollingStock.position, rollingStock.direction, 2) as any
    rollingStock.destroy()

    wp().updateWorldEntities(entity, 1)

    assertHasPreview(1)
    const worldEntity = expect(findMainEntity(2)).toBeAny().getValue()
    const [foundValue] = saveEntity(worldEntity)
    expect(foundValue).toEqual(value)
    assertNothingPresent(3)
  })

  test("refreshEntity also builds previews", () => {
    entity._asMut().setFirstStageUnchecked(2)
    wp().refreshEntity(entity, 1)
    assertHasPreview(1)
  })

  test("can insert modules", () => {
    entity._asMut().setFirstValueDirectly({
      name: "assembling-machine-3",
      items: [moduleInsertPlan(defines.inventory.crafter_modules, 4, 0, "productivity-module-3")],
    })

    wp().updateWorldEntities(entity, 2)
    const luaEntity = expect(findMainEntity(2)).toBeAny().getValue()

    expect(luaEntity.get_module_inventory()?.get_item_count("productivity-module-3")).toBe(4)
  })

  test("can insert modules and item requests", () => {
    const mut = entity._asMut()
    mut.setFirstValueDirectly({
      name: "assembling-machine-3",
      recipe: "iron-gear-wheel",
      items: [moduleInsertPlan(defines.inventory.crafter_modules, 4, 0, "productivity-module-3")],
    })
    const plateInsertPlan = simpleInsertPlan(defines.inventory.crafter_input, "iron-plate", 0)
    mut.setUnstagedValue(2, {
      items: [plateInsertPlan],
    })

    wp().updateWorldEntities(entity, 2)
    const luaEntity = expect(findMainEntity(2)).toBeAny().getValue()

    expect(luaEntity.get_module_inventory()?.get_item_count("productivity-module-3")).toBe(4)
    expect(luaEntity.item_request_proxy?.insert_plan).toEqual([plateInsertPlan])
  })
})

test("rebuildEntity replaces old value", () => {
  wp().refreshEntity(entity, 2)
  const value = assertEntityCorrect(2)
  wp().rebuildEntity(entity, 2)
  expect(value.valid).toBe(false)
  assertEntityCorrect(2)
})

describe("updateWorldEntitiesOnLastStageChanged()", () => {
  test("moving up creates entities", () => {
    const mut = entity._asMut()
    mut.setFirstStageUnchecked(2)
    mut.setLastStageUnchecked(2)
    wp().updateWorldEntities(entity, 1)
    assertHasPreview(1)
    assertEntityCorrect(2)
    assertNothingPresent(3)
    assertNothingPresent(4)

    clearModuleMock(_wireHandler)

    mut.setLastStageUnchecked(3)
    wp().updateWorldEntitiesOnLastStageChanged(entity, 2)
    assertHasPreview(1)
    assertEntityCorrect(2)
    assertEntityCorrect(3)
    assertNothingPresent(4)

    expect(wireUpdater.updateWireConnectionsAtStage).toHaveBeenCalledWith(project.content, entity, 3, expect.anything())
  })

  test("moving down destroys entities", () => {
    const mut = entity._asMut()
    mut.setFirstStageUnchecked(2)
    mut.setLastStageUnchecked(3)
    wp().updateWorldEntities(entity, 1)
    assertHasPreview(1)
    assertEntityCorrect(2)
    assertEntityCorrect(3)
    assertNothingPresent(4)

    mut.setLastStageUnchecked(2)
    wp().updateWorldEntitiesOnLastStageChanged(entity, 3)
    assertHasPreview(1)
    assertEntityCorrect(2)
    assertNothingPresent(3)
    assertNothingPresent(4)
  })
})

describe("updateNewEntityWithoutWires()", () => {
  test("can update", () => {
    const entity = newProjectEntity({ name: "inserter" }, Pos(0, 0), defines.direction.north, 2)
    project.content.addEntity(entity)
    wp().updateNewWorldEntitiesWithoutWires(entity)
    expect(wireUpdater.updateWireConnectionsAtStage).not.toHaveBeenCalled()
    expect(wp().getWorldOrPreviewEntity(entity, 2)).not.toBeNil()
  })
  test("updates highlights if there are errors", () => {
    const entity = newProjectEntity({ name: "inserter" }, Pos(0, 0), defines.direction.north, 2)
    surfaces[3 - 1].create_entity({ name: "stone-wall", position: entity.position })
    project.content.addEntity(entity)
    expect(wireUpdater.updateWireConnectionsAtStage).not.toHaveBeenCalled()
    expect(wp().getWorldOrPreviewEntity(entity, 2)).not.toBeNil()
    expect(findPreviewEntity(3)).not.toBeNil()
  })
})

test("updateWireConnections", () => {
  const entity = newProjectEntity({ name: "inserter" }, Pos(0, 0), defines.direction.north, 2)
  project.content.addEntity(entity)
  wp().updateNewWorldEntitiesWithoutWires(entity)
  wp().updateWireConnections(entity)
  for (const i of $range(2, entity.lastStageWith(project.settings))) {
    expect(wireUpdater.updateWireConnectionsAtStage).toHaveBeenCalledWith(project.content, entity, i, expect.anything())
  }
})

test("deleteEntityAtStage", () => {
  entity._asMut().applyUpgradeAtStage(2, { name: "fast-inserter" })
  wp().updateWorldEntities(entity, 1)
  wp().deleteEntityAtStage(entity, 2)
  expect(findMainEntity(2)).toBeNil()
  expect(findPreviewEntity(2)?.name).toBe(Prototypes.PreviewEntityPrefix + "fast-inserter")
  assertEntityCorrect(1)
  assertEntityCorrect(3)
})

test("deleteWorldEntities via onEntityDeleted", () => {
  project.content.addEntity(entity)
  wp().updateWorldEntities(entity, 1)
  project.content.deleteEntity(entity)
  for (let i = 1; i <= 3; i++) assertNothingPresent(i)
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
    project.content.addEntity(middleUg)
    wp().updateWorldEntities(middleUg, 1)
    const middleWorldEntity = wp().getWorldEntity(middleUg, 1)!
    assert(middleWorldEntity)

    rightUg = newProjectEntity(
      { name: "underground-belt", type: "output" },
      Pos(1.5, 0.5),
      defines.direction.east,
      1,
    ) as UndergroundBeltProjectEntity
    project.content.addEntity(rightUg)
    wp().updateWorldEntities(rightUg, 1)

    expect(wp().getWorldEntity(rightUg, 1)).toMatchTable({
      neighbours: middleWorldEntity,
    })
  })
  test("deleteWorldEntities on underground belt calls update highlights on all pairs", () => {
    wp().replaceWorldOrPreviewEntity(
      middleUg,
      1,
      createPreviewEntity(
        surfaces[0],
        Pos(0.5, 0.5),
        defines.direction.east,
        Prototypes.PreviewEntityPrefix + "underground-belt",
      ),
    )
    project.content.deleteEntity(middleUg)
    expect(wp().getWorldOrPreviewEntity(middleUg, 1)).toBeNil()
  })
  test("bug: deleteWorldEntities on underground belt does not crash if is preview", () => {
    project.content.deleteEntity(middleUg)
    expect(wp().getWorldEntity(rightUg, 1)).toMatchTable({
      neighbours: leftWorldEntity,
    })
    expect(wp().hasErrorAt(rightUg, 1)).toBe(true)
  })
  test("refreshEntity with force=true still rotates underground even if errored", () => {
    const rightMut = rightUg._asMut()
    rightMut.setTypeProperty("input")
    rightMut.direction = defines.direction.west
    expect(wp().hasErrorAt(rightUg, 1)).toBe(true)

    wp().getWorldEntity(middleUg, 1)!.rotate()
    wp().refreshEntity(middleUg, 1)

    expect(rightUg).toMatchTable({
      firstValue: { type: "input" },
      direction: defines.direction.west,
    })
    expect(middleUg).toMatchTable({
      firstValue: { type: "input" },
      direction: defines.direction.east,
    })
    expect(wp().getWorldEntity(rightUg, 1)).toMatchTable({
      belt_to_ground_type: "output",
      direction: defines.direction.east,
    })
    expect(wp().getWorldEntity(middleUg, 1)).toMatchTable({
      belt_to_ground_type: "input",
      direction: defines.direction.east,
    })
  })
})

test("makeSettingsRemnant makes all previews", () => {
  entity._asMut().isSettingsRemnant = true
  project.content.makeEntitySettingsRemnant(entity)
  for (let i = 1; i <= 3; i++) assertHasPreview(i)
})

test("updateWorldEntities calls makeSettingsRemnant", () => {
  entity._asMut().isSettingsRemnant = true
  wp().updateWorldEntities(entity, 1)
  for (let i = 1; i <= 3; i++) assertHasPreview(i)
})

test("reviveSettingsRemnant revives correct entities", () => {
  const mut = entity._asMut()
  mut.setFirstStageUnchecked(2)
  mut.isSettingsRemnant = true
  project.content.makeEntitySettingsRemnant(entity)

  mut.isSettingsRemnant = nil
  project.content.reviveEntity(entity, 2)
  assertHasPreview(1)
  assertEntityCorrect(2)
  assertEntityCorrect(3)
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

  const surface = project.surfaces.getSurface(2)!
  const chest = surface.create_entity({
    name: "iron-chest",
    position: Pos(0, 0),
  })!

  wp().rebuildStage(2)

  expect(chest.valid).toBe(false)
  expect(wp().getWorldEntity(entity1, 2)).toBeAny()
  expect(wp().getWorldEntity(entity2, 2)).toBeAny()
  expect(wp().getWorldOrPreviewEntity(entity3, 2)).toBeAny()
  expect(wp().getWorldEntity(entity3, 2)).toBeNil()

  expect(surface.get_tile(0, 0).name).toBe("concrete")
})

describe("circuit wires", () => {
  let entity1: ProjectEntity
  let entity2: ProjectEntity
  before_each(() => {
    doModuleMock(_wireHandler, false)
    game.surfaces[1].find_entities().forEach((e) => e.destroy())
    entity1 = newProjectEntity({ name: "arithmetic-combinator" }, Pos(5.5, 6), 0, 1)
    entity2 = newProjectEntity({ name: "arithmetic-combinator" }, Pos(5.5, 8), 0, 1)
    project.content.addEntity(entity1)
    project.content.addEntity(entity2)
  })

  function doAdd() {
    wp().updateWorldEntities(entity1, 1)
    wp().updateWorldEntities(entity2, 1)
    const luaEntity1 = wp().getWorldEntity(entity1, 1)!
    const luaEntity2 = wp().getWorldEntity(entity2, 1)!
    return { luaEntity1, luaEntity2 }
  }

  function addExtraWires({ luaEntity1, luaEntity2 }: { luaEntity1: LuaEntity; luaEntity2: LuaEntity }) {
    luaEntity1
      .get_wire_connector(defines.wire_connector_id.combinator_input_red, true)
      .connect_to(luaEntity2.get_wire_connector(defines.wire_connector_id.combinator_output_red, true))

    luaEntity2
      .get_wire_connector(defines.wire_connector_id.combinator_input_green, true)
      .connect_to(luaEntity1.get_wire_connector(defines.wire_connector_id.combinator_output_green, true))
  }

  function addWireToProject() {
    project.content.addWireConnection({
      fromEntity: entity1,
      toEntity: entity2,
      fromId: defines.wire_connector_id.combinator_input_red,
      toId: defines.wire_connector_id.combinator_output_red,
    })
  }

  function assertSingleWire({ luaEntity1, luaEntity2 }: { luaEntity1: LuaEntity; luaEntity2: LuaEntity }): void {
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
    wp().refreshEntity(entity1, 1)
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
    wp().refreshEntity(entity1, 1)
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
        const surface = project.surfaces.getSurface(stage)!
        surface.set_tiles([{ position, name: "lab-white" }], true, false)
      }
    })

    test("updates tile value in range", () => {
      const tile = createProjectTile()
      tile.setTileAtStage(2, "concrete")
      project.content.setTile(position, tile)

      wp().updateTilesInRange(position, 2, nil)

      expect(project.surfaces.getSurface(1)!.get_tile(0, 0).name).toBe("lab-white")
      expect(project.surfaces.getSurface(2)!.get_tile(0, 0).name).toBe("concrete")
      expect(project.surfaces.getSurface(3)!.get_tile(0, 0).name).toBe("concrete")
    })

    test("handles nil values by resetting to default", () => {
      const tile = createProjectTile()
      tile.setTileAtStage(2, "concrete")
      tile.setTileAtStage(4, nil)
      project.content.setTile(position, tile)

      wp().updateTilesInRange(position, 1, nil)

      expect(project.surfaces.getSurface(2)!.get_tile(0, 0).name).toBe("concrete")
      expect(project.surfaces.getSurface(3)!.get_tile(0, 0).name).toBe("concrete")
      expect(project.surfaces.getSurface(4)!.get_tile(0, 0).name).not.toBe("concrete")
    })

    test("respects toStage parameter", () => {
      const tile = createProjectTile()
      tile.setTileAtStage(2, "concrete")
      project.content.setTile(position, tile)

      wp().updateTilesInRange(position, 2, 3)

      expect(project.surfaces.getSurface(2)!.get_tile(0, 0).name).toBe("concrete")
      expect(project.surfaces.getSurface(3)!.get_tile(0, 0).name).toBe("concrete")
      expect(project.surfaces.getSurface(4)!.get_tile(0, 0).name).toBe("lab-white")
    })

    test("returns collision info when tile can't be set due to entity", () => {
      const tile = createProjectTile()
      tile.setTileAtStage(1, "concrete")
      project.content.setTile(position, tile)

      for (let stage = 1; stage <= 4; stage++) {
        project.surfaces.getSurface(stage)!.set_tiles([{ position, name: "concrete" }], true, false)
      }

      const surface2 = project.surfaces.getSurface(2)!
      surface2.create_entity({
        name: "iron-chest",
        position: { x: 0.5, y: 0.5 },
      })

      tile.setTileAtStage(1, "water")

      const collision = wp().updateTilesInRange(position, 1, nil)

      expect(collision).not.toBeNil()
      expect(collision!.stage).toBe(2)
      expect(collision!.actualValue).toBe("concrete")

      expect(project.surfaces.getSurface(1)!.get_tile(0, 0).name).toBe("water")
      expect(project.surfaces.getSurface(2)!.get_tile(0, 0).name).toBe("concrete")
    })

    test("returns nil when no collision occurs", () => {
      const tile = createProjectTile()
      tile.setTileAtStage(2, "concrete")
      project.content.setTile(position, tile)

      const collision = wp().updateTilesInRange(position, 2, nil)

      expect(collision).toBeNil()
    })
  })
})
