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

import expect from "tstl-expect"
import {
  addNewEntity,
  deleteEntityOrCreateSettingsRemnant,
  forceDeleteEntity,
  moveAllPropsDown,
  moveEntityOnPreviewReplace,
  moveEntityToStage,
  movePropDown,
  resetAllProps,
  resetProp,
  reviveSettingsRemnant,
  tryApplyUpgradeTarget,
  tryRotateEntityToMatchWorld,
  tryUpdateEntityFromWorld,
  updateWiresFromWorld,
} from "../../assembly/assembly-updates"
import { Assembly } from "../../assembly/AssemblyDef"
import {
  clearWorldEntity,
  refreshEntityAllStages,
  refreshWorldEntityAtStage,
  replaceWorldEntityAtStage,
  tryDollyEntities,
} from "../../assembly/world-entities"
import { Prototypes } from "../../constants"
import { AsmCircuitConnection, circuitConnectionEquals } from "../../entity/AsmCircuitConnection"
import { AssemblyEntity, RollingStockAssemblyEntity, StageNumber } from "../../entity/AssemblyEntity"
import { emptyBeltControlBehavior, emptyInserterControlBehavior } from "../../entity/empty-control-behavior"
import { isPreviewEntity } from "../../entity/entity-info"
import { saveEntity } from "../../entity/save-load"
import { Pos } from "../../lib/geometry"
import { createRollingStock } from "../entity/createRollingStock"
import { createMockAssembly, setupTestSurfaces } from "./Assembly-mock"
import { assertConfigChangedHighlightsCorrect, assertErrorHighlightsCorrect } from "./entity-highlight-test-util"

const surfaces = setupTestSurfaces(6)
let assembly: Assembly
before_each(() => {
  assembly = createMockAssembly(surfaces)
})

const pos = Pos(10.5, 10.5)

function createEntity(stage: StageNumber, args?: Partial<SurfaceCreateEntity>) {
  const params = {
    name: "filter-inserter",
    position: pos,
    force: "player",
    direction: defines.direction.east,
    ...args,
  }
  const entity: LuaEntity = assert(surfaces[stage - 1].create_entity(params), "created entity")[0]
  const proto = game.entity_prototypes[params.name]
  if (proto.type == "inserter") {
    entity.inserter_stack_size_override = 1
    entity.inserter_filter_mode = "whitelist"
  }
  return entity
}

function assertEntityCorrect(entity: AssemblyEntity, expectedHasMissing: boolean) {
  expect(entity.isSettingsRemnant).to.be.falsy()
  const found = assembly.content.findCompatibleByTraits(entity.firstValue.name, entity.position, entity.getDirection())
  expect(found).to.be(entity)

  let hasMissing = false
  for (const stage of $range(1, assembly.maxStage())) {
    const worldEntity = entity.getWorldOrPreviewEntity(stage)!
    assert(worldEntity, `entity exists at stage ${stage}`)
    const isPreview = isPreviewEntity(worldEntity)
    const value = entity.getValueAtStage(stage)
    if (value == nil) {
      assert(isPreview, `entity must be preview at stage ${stage}`)
    } else if (isPreview) {
      hasMissing = true
    } else {
      const [savedValue, dir] = saveEntity(worldEntity)
      expect(dir).to.be(entity.getDirection())
      expect(savedValue).to.equal(value)
    }
    if (isPreview) {
      expect(worldEntity.name).to.be(Prototypes.PreviewEntityPrefix + (value ?? entity.firstValue).name)
    }
    expect(worldEntity.position).to.equal(entity.position)
    expect(worldEntity.direction).to.equal(entity.getDirection())

    expect(entity.getExtraEntity("settingsRemnantHighlight", stage)).to.be.nil()
  }

  expect(hasMissing).to.be(expectedHasMissing)

  assertErrorHighlightsCorrect(entity, 6)
  assertConfigChangedHighlightsCorrect(entity, 6)

  // cables
  const cableConnections = assembly.content.getCableConnections(entity)
  const isElectricPole = game.entity_prototypes[entity.firstValue.name].type == "electric-pole"
  if (!cableConnections) {
    if (isElectricPole) {
      for (const stage of $range(entity.firstStage, assembly.maxStage())) {
        const pole = entity.getWorldEntity(stage)
        if (!pole) continue
        const cableNeighbors = (pole.neighbours as Record<"copper", LuaEntity[]>).copper
        expect(cableNeighbors).to.equal([])
      }
    }
    // else, ok
  } else {
    expect(isElectricPole).to.be(true)
    const otherNeighbors = Object.keys(cableConnections)
    for (const stage of $range(entity.firstStage, assembly.maxStage())) {
      const expectedNeighbors = otherNeighbors
        .map((o) => o.getWorldEntity(stage))
        .filter((o) => o)
        .map((o) => o?.unit_number)
        .sort()
      const actualNeighbors = (entity.getWorldEntity(stage)?.neighbours as Record<"copper", LuaEntity[]>).copper
        .map((o) => o.unit_number)
        .sort()
      expect(actualNeighbors).to.equal(expectedNeighbors)
    }
  }

  // circuit wires
  const wireConnections = assembly.content.getCircuitConnections(entity)
  if (!wireConnections) {
    for (const stage of $range(entity.firstStage, assembly.maxStage())) {
      const worldEntity = entity.getWorldEntity(stage)
      if (!worldEntity) continue
      const wireNeighbors = worldEntity.circuit_connection_definitions
      if (!wireNeighbors) continue
      expect(wireNeighbors.filter((x) => x.wire != defines.wire_type.copper)).to.equal([])
    }
  } else {
    for (const stage of $range(entity.firstStage, assembly.maxStage())) {
      const thisWorldEntity = entity.getWorldEntity(stage)
      if (!thisWorldEntity) continue
      const expectedNeighbors = Object.entries(wireConnections).flatMap(([entity, connections]) => {
        const otherWorldEntity = entity.getWorldEntity(stage)
        if (!otherWorldEntity) return []
        return Object.keys(connections).map((connection) => ({
          wire: connection.wire,
          entities: newLuaSet(thisWorldEntity.unit_number!, otherWorldEntity.unit_number!),
        }))
      })
      const actualNeighbors = thisWorldEntity.circuit_connection_definitions
      expect(actualNeighbors).to.be.any()
      const actualNeighborsSet = actualNeighbors?.map((x) => ({
        wire: x.wire,
        entities: newLuaSet(x.target_entity.unit_number!, thisWorldEntity.unit_number!),
      }))
      expect(actualNeighborsSet).to.equal(expectedNeighbors)
    }
  }
}

function assertEntityNotPresent(entity: AssemblyEntity) {
  const found = assembly.content.findCompatibleByTraits(entity.firstValue.name, entity.position, entity.getDirection())
  expect(found).to.be.nil()

  for (const stage of $range(1, assembly.maxStage())) {
    expect(entity.getWorldOrPreviewEntity(stage)).to.be.nil()
  }
  expect(entity.hasAnyExtraEntities("errorOutline")).to.be(false)
  expect(entity.hasAnyExtraEntities("errorElsewhereIndicator")).to.be(false)
}

function assertIsSettingsRemnant(entity: AssemblyEntity) {
  expect(entity.isSettingsRemnant).to.be(true)
  for (const stage of $range(1, assembly.maxStage())) {
    const preview = entity.getWorldOrPreviewEntity(stage)!
    expect(preview).to.be.any()
    expect(isPreviewEntity(preview)).to.be(true)
    expect(entity.getExtraEntity("settingsRemnantHighlight", stage)).to.be.any()
  }
  expect(entity.hasAnyExtraEntities("errorOutline")).to.be(false)
  expect(entity.hasAnyExtraEntities("errorElsewhereIndicator")).to.be(false)
}

function setupEntity(stage: StageNumber, args?: Partial<SurfaceCreateEntity>): AssemblyEntity<BlueprintEntity> {
  const luaEntity = createEntity(stage, args)
  const entity = addNewEntity(assembly, luaEntity, stage) as AssemblyEntity<BlueprintEntity>
  assert(entity)
  expect(entity.firstStage).to.be(stage)
  return entity
}

test("creating an entity", () => {
  const entity = setupEntity(3)
  assertEntityCorrect(entity, false)
})

test("clear entity at stage", () => {
  const entity = setupEntity(3)
  clearWorldEntity(assembly, entity, 4)
  assertEntityCorrect(entity, true)
})

test("entity can not be placed at stage", () => {
  createEntity(4, { name: "stone-wall" }) // blocker
  const entity = setupEntity(3)
  expect(isPreviewEntity(entity.getWorldOrPreviewEntity(4)!)).to.be(true)
  assertEntityCorrect(entity, true)
})

test("refresh missing entity", () => {
  const blocker = createEntity(4, { name: "stone-wall" })
  const entity = setupEntity(3)
  clearWorldEntity(assembly, entity, 4)
  blocker.destroy()
  refreshWorldEntityAtStage(assembly, entity, 4)
  assertEntityCorrect(entity, false)
})

test("replacing missing entity matches", () => {
  const entity = setupEntity(3)
  const newEntity = createEntity(4, { name: "inserter", direction: defines.direction.south })
  entity.replaceWorldEntity(4, newEntity)

  refreshWorldEntityAtStage(assembly, entity, 4)
  assertEntityCorrect(entity, false)
})

test("move via preview replace", () => {
  const entity = setupEntity(3)
  const placedEntity = createEntity(2, { name: "inserter", direction: defines.direction.south })
  entity.replaceWorldEntity(2, placedEntity)
  moveEntityOnPreviewReplace(assembly, entity, 2)
  expect(entity.firstStage).to.be(2)
  assertEntityCorrect(entity, false)
})

test("disallowing entity deletion", () => {
  const entity = setupEntity(3)
  const worldEntity = entity.getWorldEntity(4)!
  replaceWorldEntityAtStage(assembly, entity, 4)
  expect(worldEntity.valid).to.be(false) // replaced
  assertEntityCorrect(entity, false)
})

test("delete entity", () => {
  const entity = setupEntity(3)
  deleteEntityOrCreateSettingsRemnant(assembly, entity)
  assertEntityNotPresent(entity)
})

test("delete to create settings remnant", () => {
  const entity = setupEntity(3)
  entity._applyDiffAtStage(4, {
    override_stack_size: 2,
  })
  deleteEntityOrCreateSettingsRemnant(assembly, entity)
  assertIsSettingsRemnant(entity)
})
describe("revive integration test", () => {
  test.each([1, 2, 3, 4, 5, 6])("settings remnant 1->3->5, revive at stage %d", (reviveStage) => {
    const entity = setupEntity(1)
    entity._applyDiffAtStage(3, { override_stack_size: 2 })
    entity._applyDiffAtStage(5, { override_stack_size: 3 })
    deleteEntityOrCreateSettingsRemnant(assembly, entity)
    assertIsSettingsRemnant(entity)

    reviveSettingsRemnant(assembly, entity, reviveStage)
    expect(entity.isSettingsRemnant).to.be.falsy()
    expect(reviveStage).to.be(entity.firstStage)

    if (reviveStage >= 5) {
      expect(entity.firstValue.override_stack_size).to.be(3)
      expect(entity.hasStageDiff()).to.be(false)
    } else if (reviveStage >= 3) {
      expect(entity.firstValue.override_stack_size).to.be(2)
      expect(entity.getStageDiffs()).to.equal({ 5: { override_stack_size: 3 } })
    } else {
      expect(entity.firstValue.override_stack_size).to.be(1)
      expect(entity.getStageDiffs()).to.equal({ 3: { override_stack_size: 2 }, 5: { override_stack_size: 3 } })
    }

    assertEntityCorrect(entity, false)
  })

  test("settings remnant 2->3, revive at stage 1", () => {
    const entity = setupEntity(2)
    entity._applyDiffAtStage(3, { override_stack_size: 3 })
    deleteEntityOrCreateSettingsRemnant(assembly, entity)
    assertIsSettingsRemnant(entity)

    reviveSettingsRemnant(assembly, entity, 1)
    expect(entity.isSettingsRemnant).to.be.falsy()
    expect(1).to.be(entity.firstStage)

    expect(entity.firstValue.override_stack_size).to.be(1)
    expect(entity.getStageDiffs()).to.equal({ 3: { override_stack_size: 3 } })

    assertEntityCorrect(entity, false)
  })
})

test("force deleting entity", () => {
  const entity = setupEntity(3)
  entity._applyDiffAtStage(4, {
    override_stack_size: 2,
  })
  forceDeleteEntity(assembly, entity)
  assertEntityNotPresent(entity)
})

test("updating first value from world", () => {
  const entity = setupEntity(3)
  const worldEntity = entity.getWorldEntity(3)!
  worldEntity.inserter_stack_size_override = 2
  const ret = tryUpdateEntityFromWorld(assembly, entity, 3)
  expect(ret).to.be("updated")
  expect(entity.firstValue.override_stack_size).to.be(2)
  assertEntityCorrect(entity, false)
})

test("updating higher value from world", () => {
  const entity = setupEntity(3)
  const worldEntity = entity.getWorldEntity(4)!
  worldEntity.inserter_stack_size_override = 2
  const ret = tryUpdateEntityFromWorld(assembly, entity, 4)
  expect(ret).to.be("updated")
  expect(entity.firstValue.override_stack_size).to.be(1)
  expect(entity.hasStageDiff(4)).to.be(true)
  expect(entity.getStageDiff(4)).to.equal({ override_stack_size: 2 })

  assertEntityCorrect(entity, false)
})

test("rotating first value from world via update", () => {
  const entity = setupEntity(3)
  const worldEntity = entity.getWorldEntity(3)!
  worldEntity.direction = defines.direction.south
  const ret = tryUpdateEntityFromWorld(assembly, entity, 3)
  expect(ret).to.be("updated")
  expect(entity.getDirection()).to.be(defines.direction.south)
  assertEntityCorrect(entity, false)
})

test("rotating first value from world via rotate", () => {
  const entity = setupEntity(3)
  const worldEntity = entity.getWorldEntity(3)!
  worldEntity.direction = defines.direction.south
  tryRotateEntityToMatchWorld(assembly, entity, 3)
  expect(entity.getDirection()).to.be(defines.direction.south)
  assertEntityCorrect(entity, false)
})

test("rotation forbidden at higher stage", () => {
  const entity = setupEntity(3)
  const worldEntity = entity.getWorldEntity(4)!
  worldEntity.direction = defines.direction.south
  const ret = tryUpdateEntityFromWorld(assembly, entity, 4)
  expect(ret).to.be("cannot-rotate")
  expect(entity.getDirection()).to.be(defines.direction.east)
  assertEntityCorrect(entity, false)
})

test("rotation forbidden at higher stage via rotate", () => {
  const entity = setupEntity(3)
  const worldEntity = entity.getWorldEntity(4)!
  worldEntity.direction = defines.direction.south
  tryRotateEntityToMatchWorld(assembly, entity, 4)
  expect(entity.getDirection()).to.be(defines.direction.east)
  assertEntityCorrect(entity, false)
})

test("creating upgrade via fast replace", () => {
  const entity = setupEntity(3)
  const replacedEntity = createEntity(4, { name: "stack-filter-inserter" })
  entity.replaceWorldEntity(4, replacedEntity)
  tryUpdateEntityFromWorld(assembly, entity, 4)
  expect(entity.firstValue.name).to.be("filter-inserter")
  expect(entity.getStageDiff(4)).to.equal({ name: "stack-filter-inserter" })

  assertEntityCorrect(entity, false)
})

test("update with upgrade", () => {
  const entity = setupEntity(3)
  entity._applyDiffAtStage(4, { name: "stack-filter-inserter" })
  refreshEntityAllStages(assembly, entity)
  assertEntityCorrect(entity, false)
})

test("update with upgrade and blocker", () => {
  createEntity(5, { name: "stone-wall" })
  const entity = setupEntity(3)

  let preview = entity.getWorldOrPreviewEntity(5)!
  expect(isPreviewEntity(preview)).to.be(true)
  expect(preview.name).to.be(Prototypes.PreviewEntityPrefix + "filter-inserter")

  assertEntityCorrect(entity, true)

  entity._applyDiffAtStage(4, { name: "stack-filter-inserter" })
  refreshEntityAllStages(assembly, entity)

  preview = entity.getWorldOrPreviewEntity(5)!
  expect(isPreviewEntity(preview)).to.be(true)
  expect(preview.name).to.be(Prototypes.PreviewEntityPrefix + "stack-filter-inserter")

  assertEntityCorrect(entity, true)
})

test("creating upgrade via apply upgrade target", () => {
  const entity = setupEntity(3)
  const worldEntity = entity.getWorldEntity(4)!
  worldEntity.order_upgrade({
    force: worldEntity.force,
    target: "stack-filter-inserter",
  })
  tryApplyUpgradeTarget(assembly, entity, 4)
  expect(entity.firstValue.name).to.be("filter-inserter")
  expect(entity.getStageDiff(4)).to.equal({ name: "stack-filter-inserter" })

  assertEntityCorrect(entity, false)
})

test("moving entity up", () => {
  const entity = setupEntity(3)
  moveEntityToStage(assembly, entity, 4)
  expect(entity.firstStage).to.be(4)
  assertEntityCorrect(entity, false)
})

test("moving entity down", () => {
  const entity = setupEntity(3)
  moveEntityToStage(assembly, entity, 2)
  expect(entity.firstStage).to.be(2)
  assertEntityCorrect(entity, false)
})

test("dolly entity", () => {
  const entity = setupEntity(3)
  const worldEntity = entity.getWorldEntity(3)!
  expect(worldEntity.teleport(1, 0)).to.be(true)
  const newPosition = worldEntity.position
  const ret = tryDollyEntities(assembly, entity, 3)
  expect(ret).to.be("success")
  expect(entity.position).to.equal(newPosition)
  assertEntityCorrect(entity, false)
})

test("resetProp", () => {
  const entity = setupEntity(3)
  entity._applyDiffAtStage(4, {
    override_stack_size: 2,
  })
  resetProp(assembly, entity, 4, "override_stack_size")
  expect(entity.hasStageDiff()).to.be(false)
  expect(entity.firstValue.override_stack_size).to.be(1)
  assertEntityCorrect(entity, false)
})

test("movePropDown", () => {
  const entity = setupEntity(3)
  entity._applyDiffAtStage(4, {
    override_stack_size: 2,
  })
  movePropDown(assembly, entity, 4, "override_stack_size")
  expect(entity.hasStageDiff()).to.be(false)
  expect(entity.firstValue.override_stack_size).to.be(2)
  assertEntityCorrect(entity, false)
})

test("resetAllProps", () => {
  const entity = setupEntity(3)
  entity._applyDiffAtStage(4, {
    override_stack_size: 2,
    filter_mode: "blacklist",
  })
  resetAllProps(assembly, entity, 4)
  expect(entity.hasStageDiff()).to.be(false)
  expect(entity.firstValue.override_stack_size).to.be(1)
  expect(entity.firstValue.filter_mode).to.be.nil() // whitelist is default
  assertEntityCorrect(entity, false)
})

test("moveAllPropsDown", () => {
  const entity = setupEntity(3)
  entity._applyDiffAtStage(4, {
    override_stack_size: 2,
    filter_mode: "blacklist",
  })
  moveAllPropsDown(assembly, entity, 4)
  expect(entity.hasStageDiff()).to.be(false)
  expect(entity.firstValue.override_stack_size).to.be(2)
  expect(entity.firstValue.filter_mode).to.be("blacklist")
  assertEntityCorrect(entity, false)
})

// with wire connections
function setupPole(stage: StageNumber, args: Partial<SurfaceCreateEntity> = {}) {
  return setupEntity(stage, { name: "medium-electric-pole", position: pos.minus(Pos(0, 1)), ...args })
}
function setupPole2(stage: StageNumber) {
  return setupPole(stage, {
    position: pos.minus(Pos(0, 2)),
  })
}

test("saves initial cable connections", () => {
  const pole1 = setupPole(3)
  const pole2 = setupPole2(3)
  expect(assembly.content.getCableConnections(pole1)?.has(pole2)).to.be(true)
  expect(assembly.content.getCableConnections(pole2)?.has(pole1)).to.be(true)
  assertEntityCorrect(pole1, false)
  assertEntityCorrect(pole2, false)
})

test("saves initial cable connections to a pole in higher stage", () => {
  const pole1 = setupPole(4)
  const pole2 = setupPole2(3) // should connect to pole1
  expect(assembly.content.getCableConnections(pole1)?.has(pole2)).to.be(true)
  expect(assembly.content.getCableConnections(pole2)?.has(pole1)).to.be(true)
  assertEntityCorrect(pole1, false)
  assertEntityCorrect(pole2, false)
})

test("disconnect and connect cables", () => {
  const pole1 = setupPole(3)
  const pole2 = setupPole2(3)
  pole1.getWorldEntity(3)!.disconnect_neighbour(pole2.getWorldEntity(3))
  updateWiresFromWorld(assembly, pole1, 3)

  expect(assembly.content.getCableConnections(pole1)?.has(pole2)).to.be.falsy()
  expect(assembly.content.getCableConnections(pole2)?.has(pole1)).to.be.falsy()
  assertEntityCorrect(pole1, false)
  assertEntityCorrect(pole2, false)

  pole1.getWorldEntity(3)!.connect_neighbour(pole2.getWorldEntity(3)!)
  updateWiresFromWorld(assembly, pole1, 3)

  expect(assembly.content.getCableConnections(pole1)?.has(pole2)).to.be(true)
  expect(assembly.content.getCableConnections(pole2)?.has(pole1)).to.be(true)
  assertEntityCorrect(pole1, false)
  assertEntityCorrect(pole2, false)
})

test("connect and disconnect circuit wires", () => {
  const inserter = setupEntity(3) // is filter inserter
  const pole = setupPole(3)
  pole.getWorldEntity(3)!.connect_neighbour({
    wire: defines.wire_type.red,
    target_entity: inserter.getWorldEntity(3)!,
  })
  updateWiresFromWorld(assembly, pole, 3)

  const expectedConnection = next(
    assembly.content.getCircuitConnections(inserter)!.get(pole)!,
  )[0] as AsmCircuitConnection
  expect(expectedConnection).to.be.any()
  expect(
    circuitConnectionEquals(
      {
        wire: defines.wire_type.red,
        fromEntity: pole,
        toEntity: inserter,
        fromId: 1,
        toId: 1,
      },
      expectedConnection,
    ),
  ).to.be(true)

  assertEntityCorrect(inserter, false)
  assertEntityCorrect(pole, false)
})

function assertTrainEntityCorrect(entity: RollingStockAssemblyEntity, expectedHasError: boolean) {
  let hasError = false
  for (const stage of $range(1, assembly.maxStage())) {
    const worldEntity = entity.getWorldOrPreviewEntity(stage)!
    if (stage != entity.firstStage) {
      expect(worldEntity).to.be.any()
      expect(isPreviewEntity(worldEntity)).to.be(true)
      expect(entity.getExtraEntity("errorOutline", stage)).to.be.nil()
    } else {
      expect(worldEntity).to.be.any()
      if (isPreviewEntity(worldEntity)) {
        hasError = true
        expect(worldEntity.name).to.be(Prototypes.PreviewEntityPrefix + entity.firstValue.name)
        expect(entity.getExtraEntity("errorOutline", entity.firstStage)).to.be.any()
        expect(worldEntity.direction).to.be(entity.getPreviewDirection())
      } else {
        expect(worldEntity.name).to.be(entity.firstValue.name)
        expect(entity.getExtraEntity("errorOutline", entity.firstStage)).to.be.nil()
        expect(worldEntity.orientation).to.be(entity.firstValue.orientation)
      }
      expect(worldEntity.position).to.equal(entity.position)
    }
  }
  expect(hasError).to.be(expectedHasError)
  expect(entity.hasAnyExtraEntities("errorElsewhereIndicator")).to.be(false)
  expect(entity.hasAnyExtraEntities("settingsRemnantHighlight")).to.be(false)
  expect(entity.hasAnyExtraEntities("configChangedHighlight")).to.be(false)
  expect(entity.hasAnyExtraEntities("configChangedLaterHighlight")).to.be(false)
}

test("create train entity", () => {
  const train = createRollingStock(surfaces[3 - 1])
  const entity = addNewEntity(assembly, train, 3)!
  expect(entity).to.be.any()
  assertTrainEntityCorrect(entity, false)
})
test("train entity error", () => {
  const train = createRollingStock(surfaces[3 - 1])
  const entity = addNewEntity(assembly, train, 3)!
  train.destroy()
  surfaces[3 - 1].find_entities().forEach((e) => e.destroy()) // destroys rails too, so train cannot be re-created

  refreshEntityAllStages(assembly, entity)
  assertTrainEntityCorrect(entity, true)
})

test("adding wire in higher stage sets empty control behavior", () => {
  const inserter = setupEntity(3) // is filter inserter
  const belt = setupEntity(2, { name: "transport-belt", position: pos.minus(Pos(0, 1)) })
  refreshWorldEntityAtStage(assembly, inserter, 4)
  refreshWorldEntityAtStage(assembly, belt, 4)
  const inserter4 = inserter.getWorldEntity(4)!
  const belt4 = belt.getWorldEntity(4)!

  inserter4.connect_neighbour({
    wire: defines.wire_type.red,
    target_entity: belt4,
  })
  updateWiresFromWorld(assembly, inserter, 4)

  const connections = assembly.content.getCircuitConnections(inserter)!
  expect(connections).to.be.any()
  const connection = next(connections.get(belt)!)[0] as AsmCircuitConnection
  expect(connection).to.be.any()
  expect(
    circuitConnectionEquals(connection, {
      wire: defines.wire_type.red,
      fromEntity: inserter,
      toEntity: belt,
      fromId: 1,
      toId: 1,
    }),
  ).to.be(true)

  expect(inserter.firstValue.control_behavior).to.be(emptyInserterControlBehavior)
  expect(belt.firstValue.control_behavior).to.be(emptyBeltControlBehavior)

  expect(inserter.getStageDiff(4)!.control_behavior).to.be.truthy()
  expect(belt.getStageDiff(4)!.control_behavior).to.be.truthy()

  assertEntityCorrect(inserter, false)
  assertEntityCorrect(belt, false)
})
