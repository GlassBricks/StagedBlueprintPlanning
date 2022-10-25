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

import { Assembly } from "../../assembly/AssemblyDef"
import { AssemblyUpdater } from "../../assembly/AssemblyUpdater"
import { Prototypes } from "../../constants"
import { AsmCircuitConnection, circuitConnectionEquals } from "../../entity/AsmCircuitConnection"
import { AssemblyEntity, RollingStockAssemblyEntity, StageNumber } from "../../entity/AssemblyEntity"
import { isPreviewEntity } from "../../entity/entity-info"
import { EntityHandler } from "../../entity/EntityHandler"
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
  if (proto.type === "inserter") {
    entity.inserter_stack_size_override = 1
    entity.inserter_filter_mode = "whitelist"
  }
  return entity
}

function assertEntityCorrect(entity: AssemblyEntity, expectedHasMissing: boolean) {
  assert.falsy(entity.isSettingsRemnant, "should not be settingsRemnant")
  const found = assembly.content.findCompatibleByName(entity.firstValue.name, entity.position, entity.direction)
  assert.equal(entity, found, "found in content")

  let hasMissing = false
  for (const stage of $range(1, assembly.numStages())) {
    const worldEntity = entity.getWorldOrPreviewEntity(stage)!
    assert(worldEntity, `entity exists at stage ${stage}`)
    const isPreview = isPreviewEntity(worldEntity)
    const value = entity.getValueAtStage(stage)
    if (value === nil) {
      assert(isPreview, `entity must be preview at stage ${stage}`)
    } else if (isPreview) {
      hasMissing = true
    } else {
      const [savedValue, dir] = EntityHandler.saveEntity(worldEntity)
      assert.equal(entity.getDirection(), dir, `direction is correct at stage ${stage}`)
      assert.same(value, savedValue, `value is correct at stage ${stage}`)
    }
    if (isPreview) {
      assert.equal(
        Prototypes.PreviewEntityPrefix + (value ?? entity.firstValue).name,
        worldEntity.name,
        `preview is correct at stage ${stage}`,
      )
    }
    assert.same(entity.position, worldEntity.position, `position is correct at stage ${stage}`)
    assert.same(entity.getDirection(), worldEntity.direction, `direction is correct at stage ${stage}`)

    assert.nil(
      entity.getExtraEntity("settingsRemnantHighlight", stage),
      `settingsRemnantHighlight does not exist at stage ${stage}`,
    )
  }

  assert.equal(expectedHasMissing, hasMissing, "hasMissing is correct")

  assertErrorHighlightsCorrect(entity, 6)
  assertConfigChangedHighlightsCorrect(entity, 6)

  // cables
  const cableConnections = assembly.content.getCableConnections(entity)
  const isElectricPole = game.entity_prototypes[entity.firstValue.name].type === "electric-pole"
  if (!cableConnections) {
    if (isElectricPole) {
      for (const stage of $range(entity.firstStage, assembly.numStages())) {
        const pole = entity.getWorldEntity(stage)
        if (!pole) continue
        const cableNeighbors = (pole.neighbours as Record<"copper", LuaEntity[]>).copper
        assert.same([], cableNeighbors, `no cable neighbors at stage ${stage}`)
      }
    }
    // else, ok
  } else {
    assert.true(isElectricPole, "cableConnections only for electric poles")
    const otherNeighbors = Object.keys(cableConnections)
    for (const stage of $range(entity.firstStage, assembly.numStages())) {
      const expectedNeighbors = otherNeighbors
        .map((o) => o.getWorldEntity(stage))
        .filter((o) => o)
        .map((o) => o?.unit_number)
        .sort()
      const actualNeighbors = (entity.getWorldEntity(stage)?.neighbours as Record<"copper", LuaEntity[]>).copper
        .map((o) => o.unit_number)
        .sort()
      assert.same(expectedNeighbors, actualNeighbors, `cable neighbors at stage ${stage}`)
    }
  }

  // circuit wires
  const wireConnections = assembly.content.getCircuitConnections(entity)
  if (!wireConnections) {
    for (const stage of $range(entity.firstStage, assembly.numStages())) {
      const worldEntity = entity.getWorldEntity(stage)
      if (!worldEntity) continue
      const wireNeighbors = worldEntity.circuit_connection_definitions
      if (!wireNeighbors) continue
      assert.same(
        [],
        wireNeighbors.filter((x) => x.wire !== defines.wire_type.copper),
        `no circuit neighbors at stage ${stage}`,
      )
    }
  } else {
    for (const stage of $range(entity.firstStage, assembly.numStages())) {
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
      assert.not_nil(actualNeighbors, `expected circuit neighbors at stage ${stage}`)
      const actualNeighborsSet = actualNeighbors?.map((x) => ({
        wire: x.wire,
        entities: newLuaSet(x.target_entity.unit_number!, thisWorldEntity.unit_number!),
      }))
      assert.same(expectedNeighbors, actualNeighborsSet, `circuit neighbors at stage ${stage}`)
    }
  }
}

function assertEntityNotPresent(entity: AssemblyEntity) {
  const found = assembly.content.findCompatibleByName(entity.firstValue.name, entity.position, entity.direction)
  assert.nil(found, "not found in content")

  for (const stage of $range(1, assembly.numStages())) {
    assert.nil(entity.getWorldOrPreviewEntity(stage), `entity should be deleted at stage ${stage}`)
  }
  assert.false(entity.hasAnyExtraEntities("errorOutline"), "no errorOutline")
  assert.false(entity.hasAnyExtraEntities("errorElsewhereIndicator"), "no errorElsewhereIndicator")
}

function assertIsSettingsRemnant(entity: AssemblyEntity) {
  assert.true(entity.isSettingsRemnant, "should be settingsRemnant")
  for (const stage of $range(1, assembly.numStages())) {
    const preview = entity.getWorldOrPreviewEntity(stage)!
    assert.not_nil(preview, `entity exists at stage ${stage}`)
    assert.true(isPreviewEntity(preview), `entity is preview at stage ${stage}`)
    assert.not_nil(
      entity.getExtraEntity("settingsRemnantHighlight", stage),
      `settingsRemnantHighlight exists at stage ${stage}`,
    )
  }
  assert.false(entity.hasAnyExtraEntities("errorOutline"), "no errorOutline")
  assert.false(entity.hasAnyExtraEntities("errorElsewhereIndicator"), "no errorElsewhereIndicator")
}

function setupEntity(stage: StageNumber, args?: Partial<SurfaceCreateEntity>): AssemblyEntity<BlueprintEntity> {
  const luaEntity = createEntity(stage, args)
  const entity = AssemblyUpdater.addNewEntity<BlueprintEntity>(assembly, luaEntity, stage)!
  assert(entity)
  assert.equal(stage, entity.firstStage)
  return assert(entity)
}

test("creating an entity", () => {
  const entity = setupEntity(3)
  assertEntityCorrect(entity, false)
})

test("clear entity at stage", () => {
  const entity = setupEntity(3)
  AssemblyUpdater.clearEntityAtStage(assembly, entity, 4)
  assertEntityCorrect(entity, true)
})

test("entity can not be placed at stage", () => {
  createEntity(4, { name: "stone-wall" }) // blocker
  const entity = setupEntity(3)
  assert.true(isPreviewEntity(entity.getWorldOrPreviewEntity(4)!), "entity is preview")
  assertEntityCorrect(entity, true)
})

test("refresh missing entity", () => {
  const blocker = createEntity(4, { name: "stone-wall" })
  const entity = setupEntity(3)
  AssemblyUpdater.clearEntityAtStage(assembly, entity, 4)
  blocker.destroy()
  AssemblyUpdater.refreshEntityAtStage(assembly, entity, 4)
  assertEntityCorrect(entity, false)
})

test("replacing missing entity matches", () => {
  const entity = setupEntity(3)
  const newEntity = createEntity(4, { name: "inserter", direction: defines.direction.south })
  entity.replaceWorldEntity(4, newEntity)

  AssemblyUpdater.refreshEntityAtStage(assembly, entity, 4)
  assertEntityCorrect(entity, false)
})

test("move via preview replace", () => {
  const entity = setupEntity(3)
  const placedEntity = createEntity(2, { name: "inserter", direction: defines.direction.south })
  entity.replaceWorldEntity(2, placedEntity)
  AssemblyUpdater.moveEntityOnPreviewReplace(assembly, entity, 2)
  assert.equal(2, entity.firstStage)
  assertEntityCorrect(entity, false)
})

test("disallowing entity deletion", () => {
  const entity = setupEntity(3)
  const worldEntity = entity.getWorldEntity(4)!
  AssemblyUpdater.forbidEntityDeletion(assembly, entity, 4)
  assert.false(worldEntity.valid) // replaced
  assertEntityCorrect(entity, false)
})

test("delete entity", () => {
  const entity = setupEntity(3)
  AssemblyUpdater.deleteEntityOrCreateSettingsRemnant(assembly, entity)
  assertEntityNotPresent(entity)
})

test("delete to create settings remnant", () => {
  const entity = setupEntity(3)
  entity._applyDiffAtStage(4, {
    override_stack_size: 2,
  })
  AssemblyUpdater.deleteEntityOrCreateSettingsRemnant(assembly, entity)
  assertIsSettingsRemnant(entity)
})
describe("revive integration test", () => {
  test.each([1, 2, 3, 4, 5, 6])("settings remnant 1->3->5, revive at stage %d", (reviveStage) => {
    const entity = setupEntity(1)
    entity._applyDiffAtStage(3, { override_stack_size: 2 })
    entity._applyDiffAtStage(5, { override_stack_size: 3 })
    AssemblyUpdater.deleteEntityOrCreateSettingsRemnant(assembly, entity)
    assertIsSettingsRemnant(entity)

    AssemblyUpdater.reviveSettingsRemnant(assembly, entity, reviveStage)
    assert.falsy(entity.isSettingsRemnant)
    assert.equal(entity.firstStage, reviveStage)

    if (reviveStage >= 5) {
      assert.equal(3, entity.firstValue.override_stack_size)
      assert.false(entity.hasStageDiff())
    } else if (reviveStage >= 3) {
      assert.equal(2, entity.firstValue.override_stack_size)
      assert.same({ 5: { override_stack_size: 3 } }, entity.getStageDiffs())
    } else {
      assert.equal(1, entity.firstValue.override_stack_size)
      assert.same({ 3: { override_stack_size: 2 }, 5: { override_stack_size: 3 } }, entity.getStageDiffs())
    }

    assertEntityCorrect(entity, false)
  })

  test("settings remnant 2->3, revive at stage 1", () => {
    const entity = setupEntity(2)
    entity._applyDiffAtStage(3, { override_stack_size: 3 })
    AssemblyUpdater.deleteEntityOrCreateSettingsRemnant(assembly, entity)
    assertIsSettingsRemnant(entity)

    AssemblyUpdater.reviveSettingsRemnant(assembly, entity, 1)
    assert.falsy(entity.isSettingsRemnant)
    assert.equal(entity.firstStage, 1)

    assert.equal(1, entity.firstValue.override_stack_size)
    assert.same({ 3: { override_stack_size: 3 } }, entity.getStageDiffs())

    assertEntityCorrect(entity, false)
  })
})

test("force deleting entity", () => {
  const entity = setupEntity(3)
  entity._applyDiffAtStage(4, {
    override_stack_size: 2,
  })
  AssemblyUpdater.forceDeleteEntity(assembly, entity)
  assertEntityNotPresent(entity)
})

test("updating first value from world", () => {
  const entity = setupEntity(3)
  const worldEntity = entity.getWorldEntity(3)!
  worldEntity.inserter_stack_size_override = 2
  const ret = AssemblyUpdater.tryUpdateEntityFromWorld(assembly, entity, 3)
  assert.equal("updated", ret)
  assert.equal(2, entity.firstValue.override_stack_size)
  assertEntityCorrect(entity, false)
})

test("updating higher value from world", () => {
  const entity = setupEntity(3)
  const worldEntity = entity.getWorldEntity(4)!
  worldEntity.inserter_stack_size_override = 2
  const ret = AssemblyUpdater.tryUpdateEntityFromWorld(assembly, entity, 4)
  assert.equal("updated", ret)
  assert.equal(1, entity.firstValue.override_stack_size)
  assert.true(entity.hasStageDiff(4))
  assert.same({ override_stack_size: 2 }, entity.getStageDiff(4))

  assertEntityCorrect(entity, false)
})

test("rotating first value from world via update", () => {
  const entity = setupEntity(3)
  const worldEntity = entity.getWorldEntity(3)!
  worldEntity.direction = defines.direction.south
  const ret = AssemblyUpdater.tryUpdateEntityFromWorld(assembly, entity, 3)
  assert.equal("updated", ret)
  assert.equal(defines.direction.south, entity.getDirection())
  assertEntityCorrect(entity, false)
})

test("rotating first value from world via rotate", () => {
  const entity = setupEntity(3)
  const worldEntity = entity.getWorldEntity(3)!
  worldEntity.direction = defines.direction.south
  AssemblyUpdater.tryRotateEntityToMatchWorld(assembly, entity, 3)
  assert.equal(defines.direction.south, entity.getDirection())
  assertEntityCorrect(entity, false)
})

test("rotation forbidden at higher stage", () => {
  const entity = setupEntity(3)
  const worldEntity = entity.getWorldEntity(4)!
  worldEntity.direction = defines.direction.south
  const ret = AssemblyUpdater.tryUpdateEntityFromWorld(assembly, entity, 4)
  assert.equal("cannot-rotate", ret)
  assert.equal(defines.direction.east, entity.getDirection())
  assertEntityCorrect(entity, false)
})

test("rotation forbidden at higher stage via rotate", () => {
  const entity = setupEntity(3)
  const worldEntity = entity.getWorldEntity(4)!
  worldEntity.direction = defines.direction.south
  AssemblyUpdater.tryRotateEntityToMatchWorld(assembly, entity, 4)
  assert.equal(defines.direction.east, entity.getDirection())
  assertEntityCorrect(entity, false)
})

test("creating upgrade via fast replace", () => {
  const entity = setupEntity(3)
  const replacedEntity = createEntity(4, { name: "stack-filter-inserter" })
  entity.replaceWorldEntity(4, replacedEntity)
  AssemblyUpdater.tryUpdateEntityFromWorld(assembly, entity, 4)
  assert.equal("filter-inserter", entity.firstValue.name)
  assert.same({ name: "stack-filter-inserter" }, entity.getStageDiff(4))

  assertEntityCorrect(entity, false)
})

test("update with upgrade", () => {
  const entity = setupEntity(3)
  entity._applyDiffAtStage(4, { name: "stack-filter-inserter" })
  AssemblyUpdater.refreshEntityAllStages(assembly, entity)
  assertEntityCorrect(entity, false)
})

test("update with upgrade and blocker", () => {
  createEntity(5, { name: "stone-wall" })
  const entity = setupEntity(3)

  let preview = entity.getWorldOrPreviewEntity(5)!
  assert.true(isPreviewEntity(preview))
  assert.equal(Prototypes.PreviewEntityPrefix + "filter-inserter", preview.name)

  assertEntityCorrect(entity, true)

  entity._applyDiffAtStage(4, { name: "stack-filter-inserter" })
  AssemblyUpdater.refreshEntityAllStages(assembly, entity)

  preview = entity.getWorldOrPreviewEntity(5)!
  assert.true(isPreviewEntity(preview))
  assert.equal(Prototypes.PreviewEntityPrefix + "stack-filter-inserter", preview.name)

  assertEntityCorrect(entity, true)
})

test("creating upgrade via apply upgrade target", () => {
  const entity = setupEntity(3)
  const worldEntity = entity.getWorldEntity(4)!
  worldEntity.order_upgrade({
    force: worldEntity.force,
    target: "stack-filter-inserter",
  })
  AssemblyUpdater.tryApplyUpgradeTarget(assembly, entity, 4)
  assert.equal("filter-inserter", entity.firstValue.name)
  assert.same({ name: "stack-filter-inserter" }, entity.getStageDiff(4))

  assertEntityCorrect(entity, false)
})

test("moving entity up", () => {
  const entity = setupEntity(3)
  AssemblyUpdater.moveEntityToStage(assembly, entity, 4)
  assert.equal(4, entity.firstStage)
  assertEntityCorrect(entity, false)
})

test("moving entity down", () => {
  const entity = setupEntity(3)
  AssemblyUpdater.moveEntityToStage(assembly, entity, 2)
  assert.equal(2, entity.firstStage)
  assertEntityCorrect(entity, false)
})

test("dolly entity", () => {
  const entity = setupEntity(3)
  const worldEntity = entity.getWorldEntity(3)!
  assert.true(worldEntity.teleport(1, 0))
  const newPosition = worldEntity.position
  const ret = AssemblyUpdater.tryDollyEntity(assembly, entity, 3)
  assert.equal("success", ret)
  assert.same(newPosition, entity.position)
  assertEntityCorrect(entity, false)
})

test("resetProp", () => {
  const entity = setupEntity(3)
  entity._applyDiffAtStage(4, {
    override_stack_size: 2,
  })
  AssemblyUpdater.resetProp(assembly, entity, 4, "override_stack_size")
  assert.false(entity.hasStageDiff())
  assert.equal(1, entity.firstValue.override_stack_size)
  assertEntityCorrect(entity, false)
})

test("movePropDown", () => {
  const entity = setupEntity(3)
  entity._applyDiffAtStage(4, {
    override_stack_size: 2,
  })
  AssemblyUpdater.movePropDown(assembly, entity, 4, "override_stack_size")
  assert.false(entity.hasStageDiff())
  assert.equal(2, entity.firstValue.override_stack_size)
  assertEntityCorrect(entity, false)
})

test("resetAllProps", () => {
  const entity = setupEntity(3)
  entity._applyDiffAtStage(4, {
    override_stack_size: 2,
    filter_mode: "blacklist",
  })
  AssemblyUpdater.resetAllProps(assembly, entity, 4)
  assert.false(entity.hasStageDiff())
  assert.equal(1, entity.firstValue.override_stack_size)
  assert.nil(entity.firstValue.filter_mode) // whitelist is default
  assertEntityCorrect(entity, false)
})

test("moveAllPropsDown", () => {
  const entity = setupEntity(3)
  entity._applyDiffAtStage(4, {
    override_stack_size: 2,
    filter_mode: "blacklist",
  })
  AssemblyUpdater.moveAllPropsDown(assembly, entity, 4)
  assert.false(entity.hasStageDiff())
  assert.equal(2, entity.firstValue.override_stack_size)
  assert.equal("blacklist", entity.firstValue.filter_mode)
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
  assert.true(assembly.content.getCableConnections(pole1)?.has(pole2))
  assert.true(assembly.content.getCableConnections(pole2)?.has(pole1))
  assertEntityCorrect(pole1, false)
  assertEntityCorrect(pole2, false)
})

test("saves initial cable connections to a pole in higher stage", () => {
  const pole1 = setupPole(4)
  const pole2 = setupPole2(3) // should connect to pole1
  assert.true(assembly.content.getCableConnections(pole1)?.has(pole2))
  assert.true(assembly.content.getCableConnections(pole2)?.has(pole1))
  assertEntityCorrect(pole1, false)
  assertEntityCorrect(pole2, false)
})

test("disconnect and connect cables", () => {
  const pole1 = setupPole(3)
  const pole2 = setupPole2(3)
  pole1.getWorldEntity(3)!.disconnect_neighbour(pole2.getWorldEntity(3))
  AssemblyUpdater.updateWiresFromWorld(assembly, pole1, 3)

  assert.falsy(assembly.content.getCableConnections(pole1)?.has(pole2))
  assert.falsy(assembly.content.getCableConnections(pole2)?.has(pole1))
  assertEntityCorrect(pole1, false)
  assertEntityCorrect(pole2, false)

  pole1.getWorldEntity(3)!.connect_neighbour(pole2.getWorldEntity(3)!)
  AssemblyUpdater.updateWiresFromWorld(assembly, pole1, 3)

  assert.true(assembly.content.getCableConnections(pole1)?.has(pole2))
  assert.true(assembly.content.getCableConnections(pole2)?.has(pole1))
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
  AssemblyUpdater.updateWiresFromWorld(assembly, pole, 3)

  const expectedConnection = next(
    assembly.content.getCircuitConnections(inserter)!.get(pole)!,
  )[0] as AsmCircuitConnection
  assert.not_nil(expectedConnection)
  assert.true(
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
  )

  assertEntityCorrect(inserter, false)
  assertEntityCorrect(pole, false)
})

function assertTrainEntityCorrect(entity: RollingStockAssemblyEntity, expectedHasError: boolean) {
  let hasError = false
  for (const stage of $range(1, assembly.numStages())) {
    const worldEntity = entity.getWorldOrPreviewEntity(stage)
    if (stage === entity.firstStage) {
      assert.not_nil(worldEntity)
      if (isPreviewEntity(worldEntity!)) {
        hasError = true
        assert.equal(Prototypes.PreviewEntityPrefix + entity.firstValue.name, worldEntity!.name)
        assert.not_nil(entity.getExtraEntity("errorOutline", entity.firstStage))
        assert.equal(entity.getApparentDirection(), worldEntity!.direction, "direction")
      } else {
        assert.equal(entity.firstValue.name, worldEntity!.name)
        assert.nil(entity.getExtraEntity("errorOutline", entity.firstStage))
        assert.equal(entity.firstValue.orientation, worldEntity!.orientation)
      }
      assert.same(entity.position, worldEntity!.position)
    } else {
      assert.nil(worldEntity, "train should only be present in first stage")
      assert.nil(entity.getExtraEntity("errorOutline", stage))
    }
  }
  assert.equal(expectedHasError, hasError, "hasError")
  assert.false(entity.hasAnyExtraEntities("errorElsewhereIndicator"))
  assert.false(entity.hasAnyExtraEntities("settingsRemnantHighlight"))
  assert.false(entity.hasAnyExtraEntities("configChangedHighlight"))
  assert.false(entity.hasAnyExtraEntities("configChangedLaterHighlight"))
}

test("create train entity", () => {
  const train = createRollingStock(surfaces[3 - 1])
  const entity = AssemblyUpdater.addNewEntity(assembly, train, 3)!
  assert.not_nil(entity)
  assertTrainEntityCorrect(entity, false)
})
test("train entity error", () => {
  const train = createRollingStock(surfaces[3 - 1])
  const entity = AssemblyUpdater.addNewEntity(assembly, train, 3)!
  train.destroy()
  surfaces[3 - 1].find_entities().forEach((e) => e.destroy()) // destroys rails too, so train cannot be re-created

  AssemblyUpdater.refreshEntityAllStages(assembly, entity)
  assertTrainEntityCorrect(entity, true)
})
