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

import {
  BlueprintEntity,
  InserterBlueprintEntity,
  LuaEntity,
  LuaPlayer,
  LuaSurface,
  PlayerIndex,
  SurfaceCreateEntity,
  UndergroundBeltBlueprintEntity,
  UnitNumber,
} from "factorio:runtime"
import expect from "tstl-expect"
import { oppositedirection } from "util"
import { Prototypes } from "../../constants"
import { LuaEntityInfo, UndergroundBeltEntity } from "../../entity/Entity"
import {
  ProjectEntity,
  RollingStockProjectEntity,
  StageNumber,
  UndergroundBeltProjectEntity,
} from "../../entity/ProjectEntity"
import { isPreviewEntity } from "../../entity/prototype-info"
import { canBeAnyDirection, checkUndergroundPairFlippable, saveEntity } from "../../entity/save-load"
import { findUndergroundPair } from "../../entity/underground-belt"
import { ProjectWireConnection, wireConnectionEquals } from "../../entity/wire-connection"
import { assert, Events, Mutable } from "../../lib"
import { BBox, Pos } from "../../lib/geometry"
import { runEntireCurrentTask } from "../../lib/task"
import { checkForEntityUpdates } from "../../project/event-handlers"
import { syncMapGenSettings } from "../../project/map-gen"
import { EntityUpdateResult, StageMoveResult } from "../../project/project-updates"

import { UserProject } from "../../project/ProjectDef"
import { _simulateUndo } from "../../project/undo"
import { _deleteAllProjects, createUserProject } from "../../project/UserProject"

import { debugPrint } from "../../lib/test/misc"
import { createRollingStock } from "../entity/createRollingStock"
import {
  assertConfigChangedHighlightsCorrect,
  assertErrorHighlightsCorrect,
  assertLastStageHighlightCorrect,
  assertNoHighlightsAfterLastStage,
} from "./entity-highlight-test-util"
import direction = defines.direction

let project: UserProject
let surfaces: LuaSurface[]
let player: LuaPlayer
before_each(() => {
  project = createUserProject("test", 6)
  surfaces = project.getAllStages().map((stage) => stage.surface)
  player = game.players[1]
})
after_each(() => {
  player.cursor_stack?.clear()
  surfaces.forEach((surface) => surface.find_entities().forEach((e) => e.destroy()))
  _deleteAllProjects()
})

const pos = Pos(10.5, 10.5)

function assertEntityCorrect(entity: ProjectEntity, expectError: number | false) {
  expect(entity.isSettingsRemnant).toBeFalsy()
  const found = project.content.findCompatibleEntity(entity.firstValue.name, entity.position, entity.direction, 1)
  expect(found).toBe(entity)

  let hasError: number | false = false
  for (const stage of $range(1, project.lastStageFor(entity))) {
    const worldEntity = entity.getWorldOrPreviewEntity(stage)!
    assert(worldEntity, `entity does not exist at stage ${stage}`)
    const isPreview = isPreviewEntity(worldEntity)
    const value = entity.getValueAtStage(stage)
    if (value == nil) {
      assert(isPreview, `entity must be preview at stage ${stage}`)
    } else if (isPreview) {
      assert(entity.hasErrorAt(stage), `entity must have error at stage ${stage} to be preview`)
      hasError ||= stage
    } else if (entity.hasErrorAt(stage)) {
      assert(
        worldEntity.type == "underground-belt",
        "Only underground belt currently can have error with existing entity",
      )
      assert(entity.isUndergroundBelt())
      hasError ||= stage
      const type = worldEntity.belt_to_ground_type
      const oppositeType = type == "input" ? "output" : "input"
      expect(entity.direction).toBe(oppositedirection(worldEntity.direction))
      expect(entity.firstValue.type).toBe(oppositeType)
    } else {
      const [savedValue, savedUnstagedValue] = saveEntity(worldEntity)
      expect(savedValue).toEqual(value)
      if (!canBeAnyDirection(worldEntity)) {
        expect(worldEntity.direction).toBe(entity.direction)
      }
    }
    if (isPreview) {
      expect(worldEntity.name).toBe(Prototypes.PreviewEntityPrefix + (value ?? entity.firstValue).name)
    }
    expect(worldEntity.position).comment(`preview at stage ${stage}`).toEqual(entity.position)
    if (isPreview) {
      expect(worldEntity.direction).toEqual(entity.getPreviewDirection())
    } else if (entity.isUndergroundBelt() && entity.hasErrorAt(stage)) {
      expect(worldEntity.direction).toEqual(oppositedirection(entity.direction))
    } else if (!canBeAnyDirection(worldEntity)) {
      expect(worldEntity.direction).toEqual(entity.direction)
    }

    expect(entity.getExtraEntity("settingsRemnantHighlight", stage)).toBeNil()
  }

  expect(hasError).toBe(expectError)

  // nothing after the last stage
  for (const stage of $range(project.lastStageFor(entity) + 1, project.numStages())) {
    expect(entity.getWorldOrPreviewEntity(stage)).toBeNil()
  }

  assertErrorHighlightsCorrect(entity, project.lastStageFor(entity))
  assertConfigChangedHighlightsCorrect(entity, project.lastStageFor(entity))
  assertLastStageHighlightCorrect(entity)
  assertNoHighlightsAfterLastStage(entity, project.numStages())

  // circuit wires
  const wireConnections = entity.wireConnections
  if (!wireConnections) {
    for (const stage of $range(entity.firstStage, project.lastStageFor(entity))) {
      const worldEntity = entity.getWorldEntity(stage)
      if (!worldEntity) continue
      // const wireNeighbors: CircuitOrPowerSwitchConnection[] | nil = worldEntity.circuit_connection_definitions
      // if (!wireNeighbors) continue
      // expect(wireNeighbors).toEqual([])
      for (const [, connectionPoint] of pairs(worldEntity.get_wire_connectors(false))) {
        expect(connectionPoint.connection_count).toBe(0)
      }
    }
  } else {
    for (const stage of $range(entity.firstStage, project.lastStageFor(entity))) {
      const thisWorldEntity = entity.getWorldEntity(stage)
      if (!thisWorldEntity) continue

      const expectedConnections = Object.entries(wireConnections).flatMap(([entity, connections]) => {
        const otherWorldEntity = entity.getWorldEntity(stage)
        if (!otherWorldEntity) return []
        return Object.keys(connections).map((connection) => ({
          toId: connection.toId,
          entities: newLuaSet(thisWorldEntity.unit_number!, otherWorldEntity.unit_number!),
        }))
      })

      const actualConnections: {
        toId: defines.wire_connector_id
        entities: LuaSet<UnitNumber>
      }[] = []
      for (const [, connectionPoint] of pairs(thisWorldEntity.get_wire_connectors(false))) {
        for (const connection of connectionPoint.connections) {
          actualConnections.push({
            toId: connection.target.wire_connector_id,
            entities: newLuaSet(thisWorldEntity.unit_number!, connection.target.owner.unit_number!),
          })
        }
      }
      expectedConnections.sort((a, b) => a.toId - b.toId)
      actualConnections.sort((a, b) => a.toId - b.toId)

      expect(actualConnections).toEqual(expectedConnections)
    }
  }
}

function assertEntityNotPresent(entity: ProjectEntity) {
  const found = project.content.findCompatibleEntity(entity.firstValue.name, entity.position, entity.direction, 1)
  expect(found).toBeNil()

  for (const stage of $range(1, project.lastStageFor(entity))) {
    expect(entity.getWorldOrPreviewEntity(stage)).toBeNil()
  }
  expect(entity.hasAnyExtraEntities("errorOutline")).toBe(false)
  expect(entity.hasAnyExtraEntities("errorElsewhereIndicator")).toBe(false)
}

function assertIsSettingsRemnant(entity: ProjectEntity) {
  expect(entity.isSettingsRemnant).toBe(true)
  for (const stage of $range(1, project.lastStageFor(entity))) {
    const preview = entity.getWorldOrPreviewEntity(stage)!
    expect(preview).toBeAny()
    expect(isPreviewEntity(preview)).toBe(true)
    expect(entity.getExtraEntity("settingsRemnantHighlight", stage)).toBeAny()
  }
  expect(entity.hasAnyExtraEntities("errorOutline")).toBe(false)
  expect(entity.hasAnyExtraEntities("errorElsewhereIndicator")).toBe(false)
}
let defaultName = "inserter"
before_each(() => {
  defaultName = "inserter"
})

function createEntity(stage: StageNumber, args?: Partial<SurfaceCreateEntity>) {
  const params = {
    name: defaultName ?? error("defaultName not set"),
    position: pos,
    force: "player",
    direction: defines.direction.east,
    ...args,
  }
  const entity = surfaces[stage - 1].create_entity(params)
  assert(entity, "created entity")
  const proto = prototypes.entity[params.name as string]
  if (proto.type == "inserter") {
    entity.inserter_stack_size_override = 1
    entity.inserter_filter_mode = "whitelist"
  }
  return entity
}
function buildEntity<T extends BlueprintEntity = BlueprintEntity>(
  stage: StageNumber,
  args?: Partial<SurfaceCreateEntity>,
): ProjectEntity<T> {
  const luaEntity = createEntity(stage, args)
  const saved = recordEntity(luaEntity)
  project.actions.onEntityCreated(luaEntity, stage, player.index)
  const entity = project.content.findCompatibleWithLuaEntity(saved, nil, stage)! as ProjectEntity<T>
  assert(entity)
  expect(entity.firstStage).toBe(stage)
  return entity
}

function recordEntity(luaEntity: LuaEntity): LuaEntityInfo {
  return {
    name: luaEntity.name,
    type: luaEntity.type,
    position: luaEntity.position,
    direction: luaEntity.direction,
    belt_to_ground_type: luaEntity.type == "underground-belt" ? luaEntity.belt_to_ground_type : nil,
    surface: luaEntity.surface,
  }
}

describe.each([
  ["transport-belt", "fast-transport-belt", false, false],
  ["underground-belt", "fast-underground-belt", false, false],
  [
    "fast-inserter",
    "bulk-inserter",
    { override_stack_size: 2 },
    (e: LuaEntity): any => (e.inserter_stack_size_override = 2),
  ],
  [
    "assembling-machine-1",
    "assembling-machine-2",
    {
      recipe: "iron-gear-wheel",
      // using any here to get around QualityID problem
      recipe_quality: "normal" as any,
    },
    (e: LuaEntity) => e.set_recipe("iron-gear-wheel"),
  ],
  [
    "wooden-chest",
    "iron-chest",
    { bar: 5 },
    (e: LuaEntity) => e.get_inventory(defines.inventory.chest)!.set_bar(5 + 1),
  ],
])("using %s, upgrade to %s", (name, upgradeName, diff, applyToEntity) => {
  before_each(() => {
    defaultName = name
  })
  test("can add a new entity", () => {
    const entity = buildEntity(3)
    assertEntityCorrect(entity, false)
  })

  test("is correct when entity dies", () => {
    const entity = buildEntity(3)
    const worldEntity = entity.getWorldEntity(4)!
    worldEntity.destructible = true
    worldEntity.die()
    assertEntityCorrect(entity, 4)
  })

  test("has error when entity cannot be placed at some stage", () => {
    createEntity(4, { name: "stone-wall" }) // blocker
    const entity = buildEntity(3)
    expect(isPreviewEntity(entity.getWorldOrPreviewEntity(4)!)).toBe(true)
    assertEntityCorrect(entity, 4)
  })

  test("can fix missing entity via onTryFixEntity", () => {
    const blocker = createEntity(4, { name: "stone-wall" })
    const entity = buildEntity(3)
    blocker.destroy()
    project.actions.onTryFixEntity(entity.getWorldOrPreviewEntity(4)!, 4)
    assertEntityCorrect(entity, false)
  })

  test("refreshWorldEntityAtStage will fix incorrect direction", () => {
    const entity = buildEntity(3)
    entity.getWorldOrPreviewEntity(4)!.direction = direction.north

    project.worldUpdates.refreshWorldEntityAtStage(entity, 4)
    assertEntityCorrect(entity, false)
  })

  test("can move entity by replacing preview", () => {
    const entity = buildEntity(3)
    const newEntity = buildEntity(2)
    expect(newEntity).toBe(entity)
    expect(entity.firstStage).toBe(2)
    assertEntityCorrect(entity, false)
  })

  test("will disallow entity deletion at a higher stage", () => {
    const entity = buildEntity(3)
    const worldEntity = entity.getWorldEntity(4)!
    worldEntity.mine({
      force: true,
      ignore_minable: true,
      raise_destroyed: true,
    })
    expect(worldEntity.valid).toBe(false)
    assertEntityCorrect(entity, false)
  })

  test("can delete entity at first stage", () => {
    const entity = buildEntity(3)
    const worldEntity = entity.getWorldEntity(3)!
    player.mine_entity(worldEntity, true)
    expect(worldEntity.valid).toBe(false)
    assertEntityNotPresent(entity)
  })

  test("deleting entity may create settings remnant", () => {
    const entity = buildEntity(3)
    entity._applyDiffAtStage(4, { override_stack_size: 2 })
    const worldEntity = entity.getWorldEntity(3)!
    player.mine_entity(worldEntity, true)
    expect(worldEntity.valid).toBe(false)
    assertIsSettingsRemnant(entity)
  })

  if (name.includes("inserter")) {
    describe("reviving settings remnants", () => {
      test.each([1, 2, 3, 4, 5, 6])("settings remnant 1->3->5, revive at stage %d", (reviveStage) => {
        const entity = buildEntity<InserterBlueprintEntity>(1)
        entity._applyDiffAtStage(3, { override_stack_size: 2 })
        entity._applyDiffAtStage(5, { override_stack_size: 3 })
        project.updates.deleteEntityOrCreateSettingsRemnant(entity)
        assertIsSettingsRemnant(entity)

        assert(project.updates.tryReviveSettingsRemnant(entity, reviveStage))
        expect(entity.isSettingsRemnant).toBeFalsy()
        expect(reviveStage).toBe(entity.firstStage)

        if (reviveStage >= 5) {
          expect(entity.firstValue.override_stack_size).toBe(3)
          expect(entity.hasStageDiff()).toBe(false)
        } else if (reviveStage >= 3) {
          expect(entity.firstValue.override_stack_size).toBe(2)
          expect(entity.stageDiffs).toEqual({ 5: { override_stack_size: 3 } })
        } else {
          expect(entity.firstValue.override_stack_size).toBe(1)
          expect(entity.stageDiffs).toEqual({ 3: { override_stack_size: 2 }, 5: { override_stack_size: 3 } })
        }

        assertEntityCorrect(entity, false)
      })

      test("settings remnant 2->3, revive at stage 1", () => {
        const entity = buildEntity<InserterBlueprintEntity>(2)
        entity._applyDiffAtStage(3, { override_stack_size: 3 })
        project.updates.deleteEntityOrCreateSettingsRemnant(entity)
        assertIsSettingsRemnant(entity)

        project.updates.tryReviveSettingsRemnant(entity, 1)
        expect(entity.isSettingsRemnant).toBeFalsy()
        expect(1).toBe(entity.firstStage)

        expect(entity.firstValue.override_stack_size).toBe(1)
        expect(entity.stageDiffs).toEqual({ 3: { override_stack_size: 3 } })

        assertEntityCorrect(entity, false)
      })
    })
  }

  test("can force delete an entity at any stage", () => {
    const entity = buildEntity(3)
    entity._applyDiffAtStage(4, { override_stack_size: 2 })
    project.actions.onEntityForceDeleteUsed(entity.getWorldEntity(4)!, 4, player.index)
    assertEntityNotPresent(entity)
  })

  test("can rotate in the first stage", () => {
    const entity = buildEntity(3)
    const worldEntity = entity.getWorldEntity(3)!
    if (
      worldEntity.type == "underground-belt" ||
      !worldEntity.supports_direction ||
      worldEntity.direction == direction.north
    )
      return
    assert(worldEntity.rotate({ by_player: player }))

    if (!canBeAnyDirection(worldEntity)) {
      expect(entity.direction).toBe(defines.direction.south)
    }
    assertEntityCorrect(entity, false)
  })

  test("rotation forbidden at higher stage", () => {
    const entity = buildEntity(3)
    const worldEntity = entity.getWorldEntity(4)!
    if (!worldEntity.supports_direction || worldEntity.direction == direction.north) return // skip
    worldEntity.rotatable = true
    worldEntity.rotate({ by_player: player })
    expect(entity.direction).toBe(direction.east)
    assertEntityCorrect(entity, false)
  })

  test("can upgrade at first stage via fast replace", () => {
    const dir = direction.east
    const entity = buildEntity(3)
    player.teleport(player.position, project.getSurface(3))
    player.cursor_stack!.set_stack(upgradeName)
    player.build_from_cursor({ position: pos, direction: dir })

    expect(entity.firstValue.name).toBe(upgradeName)
    expect(entity.hasStageDiff()).toBe(false)

    assertEntityCorrect(entity, false)
  })

  test("can create upgrade", () => {
    const entity = buildEntity(3)
    const worldEntity = entity.getWorldEntity(4)!
    worldEntity.order_upgrade({
      force: worldEntity.force,
      target: upgradeName,
      player,
    })

    expect(entity.firstValue.name).toBe(name)
    expect(entity.getStageDiff(4)).toEqual({ name: upgradeName })
    expect(entity.getWorldEntity(4)!.name).toBe(upgradeName)
    expect(entity.getWorldEntity(5)!.name).toBe(upgradeName)
    assertEntityCorrect(entity, false)
  })

  test("upgrading entities still updates error entity previews", () => {
    createEntity(5, { name: "stone-wall" })
    const entity = buildEntity(3)

    let preview = entity.getWorldOrPreviewEntity(5)!
    expect(isPreviewEntity(preview)).toBe(true)
    expect(preview.name).toBe(Prototypes.PreviewEntityPrefix + name)

    assertEntityCorrect(entity, 5)

    entity.getWorldOrPreviewEntity(4)!.order_upgrade({
      force: "player",
      target: upgradeName,
      player,
    })

    preview = entity.getWorldOrPreviewEntity(5)!
    expect(isPreviewEntity(preview)).toBe(true)
    expect(preview.name).toBe(Prototypes.PreviewEntityPrefix + upgradeName)

    assertEntityCorrect(entity, 5)
  })

  test("can move entity up", () => {
    const entity = buildEntity(3)
    project.actions.onMoveEntityToStageCustomInput(entity.getWorldOrPreviewEntity(4)!, 4, player.index)
    expect(entity.firstStage).toBe(4)
    assertEntityCorrect(entity, false)
  })

  test("can move entity down", () => {
    const entity = buildEntity(3)
    project.actions.onMoveEntityToStageCustomInput(entity.getWorldOrPreviewEntity(2)!, 2, player.index)
    expect(entity.firstStage).toBe(2)
    assertEntityCorrect(entity, false)
  })

  if (diff) {
    if (!applyToEntity) error("applyToEntity not set")
    const keys = Object.keys(diff)

    test("can update value at first stage from world", () => {
      const entity = buildEntity(3)
      const worldEntity = entity.getWorldEntity(3)!
      applyToEntity(worldEntity)
      const ret = project.updates.tryUpdateEntityFromWorld(entity, 3)
      expect(ret).toBe(EntityUpdateResult.Updated)
      expect(entity.firstValue).toMatchTable(diff)
      assertEntityCorrect(entity, false)
    })

    test("updating higher value from world", () => {
      const entity = buildEntity(3)
      const worldEntity = entity.getWorldEntity(4)!
      applyToEntity(worldEntity)
      const ret = project.updates.tryUpdateEntityFromWorld(entity, 4)
      expect(ret).toBe(EntityUpdateResult.Updated)
      expect(entity.firstValue).not.toMatchTable(diff)
      expect(entity.hasStageDiff(4)).toBe(true)
      expect(entity.getStageDiff(4)).toEqual(diff)

      assertEntityCorrect(entity, false)
    })

    test("refreshing and rebuilding an entity with diffs", () => {
      const entity = buildEntity(2)
      entity._applyDiffAtStage(5, { name: upgradeName })
      entity._applyDiffAtStage(3, diff)
      project.worldUpdates.refreshAllWorldEntities(entity)
      for (const stage of $range(1, 6)) {
        project.worldUpdates.refreshWorldEntityAtStage(entity, stage)
        assertEntityCorrect(entity, false)
      }
      for (const stage of $range(1, 6)) {
        project.worldUpdates.rebuildWorldEntityAtStage(entity, stage)
        assertEntityCorrect(entity, false)
      }
      for (const stage of $range(1, 6)) {
        project.worldUpdates.rebuildStage(stage)
        assertEntityCorrect(entity, false)
      }
      project.worldUpdates.rebuildAllStages()
      runEntireCurrentTask()
      assertEntityCorrect(entity, false)
    })

    test("resetProp", () => {
      const entity = buildEntity(3)
      entity._applyDiffAtStage(4, diff)
      for (const key of keys) {
        project.updates.resetProp(entity, 4, key as keyof BlueprintEntity)
      }
      expect(entity.hasStageDiff()).toBe(false)
      expect(entity.firstValue).not.toMatchTable(diff)
      expect(entity.hasStageDiff()).toBe(false)
      assertEntityCorrect(entity, false)
    })

    test("movePropDown", () => {
      const entity = buildEntity(3)
      entity._applyDiffAtStage(4, diff)
      for (const key of keys) {
        project.updates.movePropDown(entity, 4, key as keyof BlueprintEntity)
      }
      expect(entity.hasStageDiff()).toBe(false)
      expect(entity.firstValue).toMatchTable(diff)
      assertEntityCorrect(entity, false)
    })

    test("resetAllProps", () => {
      const entity = buildEntity(3)
      entity._applyDiffAtStage(4, diff)
      project.updates.resetAllProps(entity, 4)
      expect(entity.hasStageDiff()).toBe(false)
      expect(entity.firstValue).not.toMatchTable(diff)
      assertEntityCorrect(entity, false)
    })

    test("moveAllPropsDown", () => {
      const entity = buildEntity(3)
      entity._applyDiffAtStage(4, diff)
      project.updates.moveAllPropsDown(entity, 4)
      expect(entity.hasStageDiff()).toBe(false)
      expect(entity.firstValue).toMatchTable(diff)
      assertEntityCorrect(entity, false)
    })
  }

  test("using stage delete tool", () => {
    const entity = buildEntity(1, { name: "inserter", position: pos, direction: direction.west })
    Events.raiseFakeEventNamed("on_player_selected_area", {
      player_index: player.index,
      item: Prototypes.StageDeconstructTool,
      entities: [entity.getWorldEntity(3)!],
      tiles: [],
      surface: surfaces[2],
      area: { left_top: pos, right_bottom: pos },
    })

    expect(entity.lastStage).toBe(2)
    assertEntityCorrect(entity, false)
  })

  test("using stage delete tool alt select", () => {
    const entity = buildEntity(1, { name: "inserter", position: pos, direction: direction.west })
    project.actions.userSetLastStageWithUndo(entity, 3, player.index)

    Events.raiseFakeEventNamed("on_player_alt_selected_area", {
      player_index: player.index,
      item: Prototypes.StageDeconstructTool,
      entities: [entity.getWorldEntity(3)!],
      tiles: [],
      surface: surfaces[2],
      area: { left_top: pos, right_bottom: pos },
    })

    expect(entity.lastStage).toBe(nil)
    assertEntityCorrect(entity, false)

    _simulateUndo(player)

    expect(entity.lastStage).toBe(3)
  })
})

test.each([
  "straight-rail",
  "half-diagonal-rail",
  "curved-rail-a",
  "curved-rail-b",
  "legacy-curved-rail",
  "legacy-straight-rail",
])("can create %s with correct previews", (name) => {
  const pos = Pos(10.5, 10.5)
  const entity = buildEntity(3, { name, position: pos })
  const worldEntity = entity.getWorldEntity(3)!
  expect(entity.position).toEqual(worldEntity.position)
  assertEntityCorrect(entity, false)
})

describe.each([true, false])("underground snapping, with flipped %s", (flipped) => {
  const expectedDirection = !flipped ? defines.direction.east : defines.direction.west
  const westType = !flipped ? "input" : "output"
  const eastType = !flipped ? "output" : "input"
  let westUnderground: ProjectEntity<UndergroundBeltBlueprintEntity>
  before_each(() => {
    westUnderground = buildEntity(4, {
      name: "underground-belt",
      direction: expectedDirection,
      type: westType,
      position: pos.minus(Pos(1, 0)),
    })
    assertEntityCorrect(westUnderground, false)
  })

  test("placing underground", () => {
    // place underground belt facing west (input), should snap to east output
    const placedUnderground = buildEntity<UndergroundBeltBlueprintEntity>(3, {
      name: "underground-belt",
      direction: defines.direction.west,
      type: "input",
    })
    expect(placedUnderground.direction).toBe(expectedDirection)
    expect(placedUnderground.firstValue.type).toBe(eastType)
    assertEntityCorrect(placedUnderground, false)
    // type defaults to input
    expect(westUnderground.direction).toBe(expectedDirection)
    expect(westUnderground.firstValue.type).toBe(westType)

    expect(westUnderground.getWorldEntity(4)!.neighbours).toEqual(placedUnderground.getWorldEntity(4)!)
  })
  test("pasting underground", () => {
    const stack = player.cursor_stack!
    stack.set_stack("blueprint")
    stack.set_blueprint_entities([
      {
        name: "underground-belt",
        direction: defines.direction.west,
        type: "input",
        entity_number: 1,
        position: Pos(0.5, 0.5),
      },
    ])
    player.teleport(pos, surfaces[3 - 1])

    player.build_from_cursor({
      position: pos,
      build_mode: defines.build_mode.forced,
    })
    const ghost = surfaces[3 - 1].find_entity("entity-ghost", pos)
    expect(ghost).toBeNil()

    const builtEntity = surfaces[3 - 1].find_entity("underground-belt", pos)!
    expect(builtEntity).toBeAny()
    expect(builtEntity.direction).toBe(expectedDirection)
    expect(builtEntity.belt_to_ground_type).toBe(eastType)

    const entity = project.content.findCompatibleWithLuaEntity(builtEntity, nil, 3) as UndergroundBeltProjectEntity
    expect(entity).toBeAny()
    expect(entity.isUndergroundBelt()).toBe(true)
    expect(entity.direction).toBe(expectedDirection)
    expect(entity.firstValue.type).toBe(eastType)
  })
})

describe("underground belt inconsistencies", () => {
  describe("left, high middle, right", () => {
    let leftUnderground: ProjectEntity<UndergroundBeltEntity>
    let rightUnderground: ProjectEntity<BlueprintEntity>
    let middleUnderground: ProjectEntity<BlueprintEntity>
    before_each(() => {
      leftUnderground = buildEntity(1, {
        name: "underground-belt",
        type: "input",
        direction: defines.direction.east,
        position: pos.add(-1, 0),
      }) as UndergroundBeltProjectEntity
      rightUnderground = buildEntity(1, {
        name: "underground-belt",
        type: "output",
        direction: defines.direction.east,
        position: pos.add(1, 0),
      })
      middleUnderground = buildEntity(2, {
        name: "underground-belt",
        type: "output",
        direction: defines.direction.east,
        position: pos,
      })
      const leftStage1 = leftUnderground.getWorldEntity(1)
      assert(leftStage1)
      expect(leftStage1.neighbours).not.toBeNil().and.toEqual(rightUnderground.getWorldEntity(1))
      expect(leftUnderground.getWorldEntity(2)?.neighbours)
        .not.toBeNil()
        .and.toEqual(middleUnderground.getWorldEntity(2))

      const leftStage2 = leftUnderground.getWorldEntity(2)
      assert(leftStage2)
      const middleStage2 = middleUnderground.getWorldEntity(2)
      assert(middleStage2)

      expect(leftStage2.neighbours).toEqual(middleStage2)
      expect(checkUndergroundPairFlippable(middleStage2)).toMatchTable([middleUnderground, false])

      expect(findUndergroundPair(project.content, leftUnderground, 1)).toBe(rightUnderground)
    })
    test("When flipping an left paired with multiple undergrounds, error is shown in stage where left flip failed", () => {
      // stage 1: < >
      // stage 2: <i>
      // flipping in stage 1 will flip both < and >, but in stage 2 because of "i", it fails to flip
      // error should be shown in 2 for <
      const leftStage1 = leftUnderground.getWorldEntity(1)!
      const rightStage1 = rightUnderground.getWorldEntity(1)!
      const leftStage2 = leftUnderground.getWorldEntity(2)!

      leftStage1.rotate({ by_player: player })

      expect(leftUnderground).toMatchTable({
        firstValue: { type: "output" },
        direction: defines.direction.west,
      })
      expect(rightUnderground).toMatchTable({
        firstValue: { type: "input" },
        direction: defines.direction.west,
      })
      // middle unchanged
      expect(middleUnderground).toMatchTable({
        firstValue: { type: "output" },
        direction: defines.direction.east,
      })

      expect(leftStage1).toMatchTable({
        direction: defines.direction.west,
        belt_to_ground_type: "output",
      })
      expect(rightStage1).toMatchTable({
        direction: defines.direction.west,
        belt_to_ground_type: "input",
      })
      // stage 2 should not have changed
      expect(leftStage2).toMatchTable({
        direction: defines.direction.east,
        belt_to_ground_type: "input",
      })
      expect(leftUnderground.hasErrorAt(2)).toBe(true)

      assertEntityCorrect(leftUnderground, 2)
      assertEntityCorrect(rightUnderground, false)
      assertEntityCorrect(middleUnderground, false)
    })
    test("when flipping middle, middle succeeds, but error is shown in left where the flip failed", () => {
      const middle = middleUnderground.getWorldEntity(2)!
      const leftStage1 = leftUnderground.getWorldEntity(1)!
      const leftStage2 = leftUnderground.getWorldEntity(2)!

      middle.rotate({ by_player: player })

      // left and middle should have flipped
      expect(leftUnderground).toMatchTable({
        firstValue: { type: "output" },
        direction: defines.direction.west,
      })
      expect(middleUnderground).toMatchTable({
        firstValue: { type: "input" },
        direction: defines.direction.west,
      })
      // right unchanged
      expect(rightUnderground).toMatchTable({
        firstValue: { type: "output" },
        direction: defines.direction.east,
      })

      // error in left stage 1
      expect(leftStage1).toMatchTable({
        direction: defines.direction.east,
        belt_to_ground_type: "input",
      })
      expect(leftUnderground.hasErrorAt(1)).toBe(true)

      // fine in stage 2
      expect(leftStage2).toMatchTable({
        direction: defines.direction.west,
        belt_to_ground_type: "output",
      })

      assertEntityCorrect(leftUnderground, 1)
      assertEntityCorrect(rightUnderground, false)
      assertEntityCorrect(middleUnderground, false)
    })
    test("when flipping an underground to correct error, also flips its pair", () => {
      const leftStage1 = leftUnderground.getWorldEntity(1)!
      leftStage1.rotate({ by_player: player })
      // see first test for current state

      // now rotate the broken case (left in stage 2)
      const leftStage2 = leftUnderground.getWorldEntity(2)!
      expect(leftStage2).toMatchTable({
        direction: defines.direction.east,
        belt_to_ground_type: "input",
      })
      leftStage2.rotate({ by_player: player })

      // now all 3 should be rotated
      expect(leftUnderground).toMatchTable({
        firstValue: { type: "output" },
        direction: defines.direction.west,
      })
      expect(rightUnderground).toMatchTable({
        firstValue: { type: "input" },
        direction: defines.direction.west,
      })
      expect(middleUnderground).toMatchTable({
        firstValue: { type: "input" },
        direction: defines.direction.west,
      })

      const middle = middleUnderground.getWorldEntity(2)!

      expect(leftStage1).toMatchTable({
        direction: defines.direction.west,
        belt_to_ground_type: "output",
      })
      expect(leftStage2).toMatchTable({
        direction: defines.direction.west,
        belt_to_ground_type: "output",
      })
      expect(middle).toMatchTable({
        direction: defines.direction.west,
        belt_to_ground_type: "input",
      })

      assertEntityCorrect(leftUnderground, false)
      assertEntityCorrect(rightUnderground, false)
      assertEntityCorrect(middleUnderground, false)
    })
    test("when deleting an underground causing old pair to flip, project.updates highlights on old pair", () => {
      middleUnderground.setFirstStageUnchecked(1)
      project.worldUpdates.updateWorldEntities(middleUnderground, 1)

      middleUnderground.getWorldEntity(1)!.rotate({ by_player: player })
      expect(middleUnderground).toMatchTable({
        firstValue: { type: "input" },
        direction: defines.direction.west,
      })
      expect(leftUnderground).toMatchTable({
        firstValue: { type: "output" },
        direction: defines.direction.west,
      })
      assertEntityCorrect(middleUnderground, false)
      assertEntityCorrect(leftUnderground, false)

      player.mine_entity(middleUnderground.getWorldEntity(1)!, true)

      expect(project.content.hasEntity(middleUnderground)).toBe(false)

      expect(leftUnderground.hasErrorAt(1)).toBe(true)

      assertEntityCorrect(leftUnderground, 1)
      assertEntityCorrect(rightUnderground, false)
    })
  })
  describe.each([false, true])("left, middle %s, broken right", (hasMiddle) => {
    let leftUnderground: ProjectEntity<BlueprintEntity>
    let rightUnderground: ProjectEntity<UndergroundBeltEntity>
    let leftWorldEntity: LuaEntity
    before_each(() => {
      leftUnderground = buildEntity(1, {
        name: "underground-belt",
        type: "input",
        direction: defines.direction.east,
      })

      if (hasMiddle) {
        // make an error entity in the middle
        const middle = buildEntity(1, {
          name: "underground-belt",
          type: "output",
          direction: defines.direction.east,
          position: pos.add(1, 0),
        })
        middle.destroyAllWorldOrPreviewEntities()
      }
      rightUnderground = buildEntity<UndergroundBeltBlueprintEntity>(1, {
        name: "underground-belt",
        type: "output",
        direction: defines.direction.east,
        position: pos.add(2, 0),
      })
      leftWorldEntity = leftUnderground.getWorldEntity(1)!
      expect(leftWorldEntity).toMatchTable({
        belt_to_ground_type: "input",
        direction: defines.direction.east,
        neighbours: rightUnderground.getWorldEntity(1)!,
      })
      // manually break right underground
      rightUnderground.setTypeProperty("input")
      rightUnderground.direction = defines.direction.west

      expect(rightUnderground.hasErrorAt(1)).toBe(true)
      expect(rightUnderground.hasErrorAt(2)).toBe(true)
      project.worldUpdates.updateAllHighlights(rightUnderground)
      assertEntityCorrect(rightUnderground, 1)
    })
    test("flipping an underground with a pair with error project.updates highlight on pair", () => {
      // rotate left
      leftWorldEntity.rotate({ by_player: player })
      expect(leftUnderground).toMatchTable({
        firstValue: { type: "output" },
        direction: defines.direction.west,
      })
      expect(rightUnderground).toMatchTable({
        firstValue: { type: "input" },
        direction: defines.direction.west,
      })

      assertEntityCorrect(leftUnderground, false)
      assertEntityCorrect(rightUnderground, false)
    })
    test("flipping pair with broken underground at higher stage still disallows rotation", () => {
      const leftWorldEntity2 = leftUnderground.getWorldEntity(2)!
      leftWorldEntity2.rotate({ by_player: player })
      expect(leftUnderground).toMatchTable({
        firstValue: { type: "input" },
        direction: defines.direction.east,
      })
      expect(rightUnderground).toMatchTable({
        firstValue: { type: "input" },
        direction: defines.direction.west,
      })
      expect(leftWorldEntity).toMatchTable({
        belt_to_ground_type: "input",
        direction: defines.direction.east,
      })
      // not changed
      expect(leftUnderground.getWorldEntity(2)).toMatchTable({
        belt_to_ground_type: "input",
        direction: defines.direction.east,
      })
      // still broken
      expect(rightUnderground.getWorldEntity(2)).toMatchTable({
        belt_to_ground_type: "output",
        direction: defines.direction.east,
      })
      expect(rightUnderground.hasErrorAt(1)).toBe(true)
      expect(rightUnderground.hasErrorAt(2)).toBe(true)

      assertEntityCorrect(leftUnderground, false)
      assertEntityCorrect(rightUnderground, 1)
    })
  })
  test("calling refresh entity on an broken underground fixes it", () => {
    const underground = buildEntity(1, {
      name: "underground-belt",
      type: "input",
      direction: defines.direction.east,
    })
    assert(underground.getWorldEntity(1)!.rotate())
    project.worldUpdates.refreshWorldEntityAtStage(underground, 1)
    expect(underground).toMatchTable({
      firstValue: { type: "input" },
      direction: defines.direction.east,
    })
    assertEntityCorrect(underground, false)
  })
  test("using cleanup tool on an broken underground fixes it", () => {
    const underground = buildEntity(1, {
      name: "underground-belt",
      type: "input",
      direction: defines.direction.east,
    })
    assert(underground.getWorldEntity(1)!.rotate())
    Events.raiseFakeEventNamed("on_player_selected_area", {
      player_index: 1 as PlayerIndex,
      item: Prototypes.CleanupTool,
      surface: surfaces[0],
      area: BBox.around(pos, 10),
      entities: [underground.getWorldEntity(1)!],
      tiles: [],
    })
    expect(underground).toMatchTable({
      firstValue: { type: "input" },
      direction: defines.direction.east,
    })
    assertEntityCorrect(underground, false)
  })
  test("using cleanup tool on broken pair fixes it", () => {
    const left = buildEntity(1, {
      name: "underground-belt",
      type: "input",
      direction: defines.direction.east,
    })
    const right = buildEntity(1, {
      name: "underground-belt",
      type: "output",
      direction: defines.direction.east,
      position: pos.add(1, 0),
    })
    assert(left.getWorldEntity(1)!.rotate())
    expect(right.hasErrorAt(1)).toBe(true)

    Events.raiseFakeEventNamed("on_player_selected_area", {
      player_index: 1 as PlayerIndex,
      item: Prototypes.CleanupTool,
      surface: surfaces[0],
      area: BBox.around(pos, 10),
      entities: [left.getWorldEntity(1)!],
      tiles: [],
    })

    assertEntityCorrect(left, false)
    assertEntityCorrect(right, false)
  })

  describe("pasting an underground", () => {
    before_each(() => {
      const stack = player.cursor_stack!
      stack.set_stack("blueprint")
      stack.set_blueprint_entities([
        {
          name: "underground-belt",
          type: "input",
          direction: defines.direction.west,
          entity_number: 1,
          position: Pos(0.5, 0.5),
        },
      ])
      player.teleport(pos, surfaces[0])
    })
    test("pasting an underground belt works", () => {
      player.build_from_cursor({
        position: pos.add(2, 0),
      })

      const builtEntity = surfaces[0].find_entity("underground-belt", pos.add(2, 0))!
      expect(builtEntity).toBeAny()

      const projEntity = project.content.findCompatibleWithLuaEntity(
        builtEntity,
        nil,
        1,
      ) as UndergroundBeltProjectEntity
      expect(projEntity).toBeAny()
      expect(projEntity).toMatchTable({
        firstValue: { type: "input" },
        direction: defines.direction.west,
      })
    })

    test.each([false, true])("pasting an underground belt that gets flipped works, with middle %s", (hasMiddle) => {
      buildEntity(1, {
        name: "underground-belt",
        type: "input",
        direction: defines.direction.east,
      })
      if (hasMiddle) {
        const entity = buildEntity(1, {
          name: "underground-belt",
          type: "output",
          direction: defines.direction.east,
          position: pos.add(1, 0),
        })
        entity.destroyAllWorldOrPreviewEntities()
      }
      player.build_from_cursor({
        position: pos.add(2, 0),
      })

      const builtEntity = surfaces[0].find_entity("underground-belt", pos.add(2, 0))!
      expect(builtEntity).toBeAny()

      // should be flipped
      const projEntity = project.content.findCompatibleWithLuaEntity(
        builtEntity,
        nil,
        1,
      ) as UndergroundBeltProjectEntity
      expect(projEntity).toBeAny()
      expect(projEntity).toMatchTable({
        firstValue: { type: "output" },
        direction: defines.direction.east,
      })
    })
  })

  describe("upgrading underground via blueprint paste", () => {
    let underground: UndergroundBeltProjectEntity
    before_each(() => {
      underground = buildEntity(1, {
        name: "underground-belt",
        type: "input",
        direction: defines.direction.east,
      }) as UndergroundBeltProjectEntity
      const stack = player.cursor_stack!
      stack.set_stack("blueprint")
      stack.set_blueprint_entities([
        {
          name: "fast-underground-belt",
          type: "input",
          direction: defines.direction.east,
          entity_number: 1,
          position: Pos(0.5, 0.5),
        },
        {
          name: "small-electric-pole",
          entity_number: 2,
          position: Pos(1.5, 1.5),
        },
      ])
      stack.blueprint_snap_to_grid = [1, 1]
      stack.blueprint_absolute_snapping = true
      player.teleport(pos, surfaces[0])
    })
    test("can upgrade underground belt via paste", () => {
      player.build_from_cursor({ position: pos, build_mode: defines.build_mode.superforced })
      expect(underground).toMatchTable({
        firstValue: { name: "fast-underground-belt", type: "input" },
        direction: defines.direction.east,
      })
      expect(underground.getWorldEntity(1)).toMatchTable({
        name: "fast-underground-belt",
        belt_to_ground_type: "input",
        direction: defines.direction.east,
      })
    })
    test("can upgrade underground in flipped direction", () => {
      underground.getWorldEntity(1)!.rotate({ by_player: player })
      player.build_from_cursor({ position: pos, build_mode: defines.build_mode.superforced })

      expect(underground).toMatchTable({
        firstValue: { name: "fast-underground-belt", type: "input" },
        direction: defines.direction.east,
      })
    })
    test("does not upgrade underground belt in wrong direction", () => {
      underground.setTypeProperty("output")
      project.worldUpdates.refreshAllWorldEntities(underground)
      player.build_from_cursor({ position: pos, build_mode: defines.build_mode.superforced })

      expect(underground).toMatchTable({
        firstValue: { name: "underground-belt", type: "output" },
        direction: defines.direction.east,
      })
    })
  })
})

describe("poles and wire connections", () => {
  function setupPole(stage: StageNumber, args: Partial<SurfaceCreateEntity> = {}) {
    return buildEntity(stage, { name: "medium-electric-pole", position: pos.minus(Pos(0, 1)), ...args })
  }
  function setupPole2(stage: StageNumber) {
    return setupPole(stage, {
      position: pos.minus(Pos(0, 2)),
    })
  }

  test("saves initial cable connections", () => {
    const pole1 = setupPole(3)
    const pole2 = setupPole2(3)
    expect(pole1.wireConnections?.get(pole2)).toBeAny()
    expect(pole2.wireConnections?.get(pole1)).toBeAny()
    assertEntityCorrect(pole1, false)
    assertEntityCorrect(pole2, false)
  })

  test("saves initial cable connections to a pole in higher stage", () => {
    const pole1 = setupPole(4)
    const pole2 = setupPole2(3) // should connect to pole1
    expect(pole1.wireConnections?.get(pole2)).toBeAny()
    expect(pole2.wireConnections?.get(pole1)).toBeAny()
    assertEntityCorrect(pole1, false)
    assertEntityCorrect(pole2, false)
  })

  function disconnectPole(pole1: LuaEntity, pole2: LuaEntity) {
    pole1
      .get_wire_connector(defines.wire_connector_id.pole_copper, false)
      .disconnect_from(pole2.get_wire_connector(defines.wire_connector_id.pole_copper, false))
  }
  function connectPole(pole1: LuaEntity, pole2: LuaEntity) {
    pole1
      .get_wire_connector(defines.wire_connector_id.pole_copper, true)
      .connect_to(pole2.get_wire_connector(defines.wire_connector_id.pole_copper, true))
  }

  test("disconnect and connect cables", () => {
    const pole1 = setupPole(3)
    const pole2 = setupPole2(3)
    // pole1.getWorldEntity(3)!.disconnect_neighbour(pole2.getWorldEntity(3))
    disconnectPole(pole1.getWorldEntity(3)!, pole2.getWorldEntity(3)!)
    project.updates.updateWiresFromWorld(pole1, 3)

    expect(pole1.wireConnections?.get(pole2)).toBeNil()
    expect(pole2.wireConnections?.get(pole1)).toBeNil()
    assertEntityCorrect(pole1, false)
    assertEntityCorrect(pole2, false)

    // pole1.getWorldEntity(3)!.connect_neighbour(pole2.getWorldEntity(3)!)
    connectPole(pole1.getWorldEntity(3)!, pole2.getWorldEntity(3)!)
    project.updates.updateWiresFromWorld(pole1, 3)

    // expect(pole1.cableConnections?.has(pole2)).toBe(true)
    // expect(pole2.cableConnections?.has(pole1)).toBe(true)
    expect(pole1.wireConnections?.get(pole2)).toBeAny()
    expect(pole2.wireConnections?.get(pole1)).toBeAny()
    assertEntityCorrect(pole1, false)
    assertEntityCorrect(pole2, false)
  })

  test("connect and disconnect circuit wires", () => {
    const inserter = buildEntity(3)
    const pole = setupPole(3)
    const poleConnector = pole.getWorldEntity(3)!.get_wire_connector(defines.wire_connector_id.circuit_red, true)
    const inserterConnector = inserter
      .getWorldEntity(3)!
      .get_wire_connector(defines.wire_connector_id.circuit_red, true)
    poleConnector.connect_to(inserterConnector)
    project.updates.updateWiresFromWorld(pole, 3)

    const expectedConnection = next(inserter.wireConnections!.get(pole)!)[0] as ProjectWireConnection
    expect(expectedConnection).toBeAny()
    expect(
      wireConnectionEquals(
        {
          fromEntity: pole,
          toEntity: inserter,
          fromId: defines.wire_connector_id.circuit_red,
          toId: defines.wire_connector_id.circuit_red,
        },
        expectedConnection,
      ),
    ).toBe(true)

    // weird bug: simply connecting an inserter sets control behavior
    // workaround
    const worldEntity = inserter.getWorldEntity(3)!
    const inserterValue = saveEntity(worldEntity)[0]! as Mutable<InserterBlueprintEntity>
    if (inserterValue.control_behavior) {
      inserter._applyDiffAtStage(3, {
        control_behavior: inserterValue.control_behavior,
      })
    } else {
      debugPrint("Workaround no longer needed")
    }

    assertEntityCorrect(inserter, false)
    assertEntityCorrect(pole, false)
  })
})

describe("train entities", () => {
  function assertTrainEntityCorrect(entity: RollingStockProjectEntity, expectedHasError: number | false) {
    expect(entity.lastStage).toBe(entity.firstStage)
    assertEntityCorrect(entity, expectedHasError)
  }

  test("create train entity", () => {
    const train = createRollingStock(surfaces[3 - 1])
    const entity = project.updates.addNewEntity(train, 3)!
    expect(entity).toBeAny()
    assertTrainEntityCorrect(entity, false)
  })
  test("train entity error", () => {
    const train = createRollingStock(surfaces[3 - 1])
    const entity = project.updates.addNewEntity(train, 3)!
    train.destroy()
    surfaces[3 - 1].find_entities().forEach((e) => e.destroy()) // destroys rails too, so train cannot be re-created

    project.worldUpdates.refreshAllWorldEntities(entity)
    assertTrainEntityCorrect(entity, 3)
  })
})

describe("circuit connections", () => {
  test.each([1, 2])("paste a chain of circuit wires over existing power poles, stage %s", (stage) => {
    const pole1 = buildEntity(stage, { name: "small-electric-pole", position: pos })
    const pole2 = buildEntity(stage, { name: "small-electric-pole", position: pos.plus(Pos(4, 0)) })
    const pole3 = buildEntity(stage, { name: "small-electric-pole", position: pos.plus(Pos(8, 0)) })

    const bpEntities: BlueprintEntity[] = [
      {
        entity_number: 1,
        name: "small-electric-pole",
        position: pos,
        // connections: { "1": { red: [{ entity_id: 2 }] } },
        wires: [[1, defines.wire_connector_id.circuit_red, 2, defines.wire_connector_id.circuit_red]],
      },
      {
        entity_number: 2,
        name: "small-electric-pole",
        position: pos.plus(Pos(4, 0)),
        // connections: { "1": { red: [{ entity_id: 1 }, { entity_id: 3 }] } },
        wires: [
          [1, defines.wire_connector_id.circuit_red, 1, defines.wire_connector_id.circuit_red],
          [1, defines.wire_connector_id.circuit_red, 3, defines.wire_connector_id.circuit_red],
        ],
      },
      {
        entity_number: 3,
        name: "small-electric-pole",
        position: pos.plus(Pos(8, 0)),
        // connections: { "1": { red: [{ entity_id: 2 }] } },
        wires: [[1, defines.wire_connector_id.circuit_red, 2, defines.wire_connector_id.circuit_red]],
      },
    ]
    const stack = player.cursor_stack!
    stack.set_stack("blueprint")
    stack.set_blueprint_entities(bpEntities)

    player.teleport([0, 0], surfaces[stage - 1])
    player.build_from_cursor({ position: pos.plus(Pos(4, 0)) })

    // should have 2 cable connections

    const connection1 = pole1.wireConnections?.get(pole2)
    expect(connection1).not.toBeNil()
    const connection21 = pole2.wireConnections?.get(pole1)
    expect(connection21).not.toBeNil()
    const connection23 = pole2.wireConnections?.get(pole3)
    expect(connection23).not.toBeNil()
    const connection3 = pole3.wireConnections?.get(pole2)
    expect(connection3).not.toBeNil()

    assertEntityCorrect(pole1, false)
    assertEntityCorrect(pole2, false)
    assertEntityCorrect(pole3, false)
  })
})
describe("blueprinting", () => {
  test("can build a entity using known value", () => {
    const luaEntity = createEntity(1, { name: "transport-belt", position: pos, direction: defines.direction.east })
    const entity = project.updates.addNewEntity(luaEntity, 1, {
      entity_number: 1,
      name: "transport-belt",
      position: pos,
      direction: defines.direction.east,
      override_stack_size: 1,
    })!
    expect(entity).toMatchTable({
      firstStage: 1,
      firstValue: {
        name: "transport-belt",
        override_stack_size: 1,
      },
    })
  })

  test.each([true, false])("can maybe upgrade entity via blueprint, with super force build %s", (superForce) => {
    const bpEntity: BlueprintEntity = {
      entity_number: 1,
      name: "fast-inserter",
      position: Pos(0.5, 0.5),
      direction: direction.west,
    }
    const entity = buildEntity(1, { name: "inserter", position: pos, direction: direction.west })
    const stack = player.cursor_stack!
    stack.set_stack("blueprint")
    stack.blueprint_snap_to_grid = [1, 1]
    stack.blueprint_absolute_snapping = true
    stack.set_blueprint_entities([
      bpEntity,
      {
        entity_number: 2,
        name: "transport-belt",
        position: Pos(0, 2),
        direction: direction.south,
      },
    ])

    player.teleport([0, 0], surfaces[0])
    player.build_from_cursor({
      position: pos,
      build_mode: superForce ? defines.build_mode.superforced : defines.build_mode.forced,
    })

    const expected = superForce ? "fast-inserter" : "inserter"
    expect(entity.firstValue).toMatchTable({ name: expected })
    expect(entity.getWorldEntity(1)).toMatchTable({ name: expected })
  })

  test("can upgrade entity to different quality with super-force build", () => {
    const entity = buildEntity(1, {
      name: "iron-chest",
      position: pos,
      direction: direction.east,
    })
    const stack = player.cursor_stack!
    stack.set_stack("blueprint")
    stack.blueprint_snap_to_grid = [1, 1]
    stack.blueprint_absolute_snapping = true
    stack.set_blueprint_entities([
      {
        entity_number: 1,
        name: "iron-chest",
        quality: "legendary",
        position: Pos(0.5, 0.5),
        direction: direction.east,
      },
    ])

    player.teleport([0, 0], surfaces[0])
    player.build_from_cursor({
      position: pos,
      build_mode: defines.build_mode.superforced,
    })

    expect(entity.firstValue).toMatchTable({ name: "iron-chest", quality: "legendary" })
    expect(entity.getWorldEntity(1)).toMatchTable({ name: "iron-chest", quality: { name: "legendary" } })
  })

  test("can upgrade entity to different quality in higher stage with super-force build", () => {
    const entity = buildEntity(1, {
      name: "iron-chest",
      position: pos,
      direction: direction.east,
    })
    const stack = player.cursor_stack!
    stack.set_stack("blueprint")
    stack.blueprint_snap_to_grid = [1, 1]
    stack.blueprint_absolute_snapping = true
    stack.set_blueprint_entities([
      {
        entity_number: 1,
        name: "iron-chest",
        quality: "legendary",
        position: Pos(0.5, 0.5),
        direction: direction.east,
      },
    ])

    player.teleport([0, 0], surfaces[1])
    player.build_from_cursor({
      position: pos,
      build_mode: defines.build_mode.superforced,
    })

    expect(entity.firstValue).toEqual({ name: "iron-chest" })
    expect(entity.stageDiffs).toEqual({
      2: { quality: "legendary" },
    })
    expect(entity.getValueAtStage(2)).toEqual({ name: "iron-chest", quality: "legendary" })
    expect(entity.getWorldEntity(2)).toMatchTable({ name: "iron-chest", quality: { name: "legendary" } })
  })

  test("can upgrade entity with wires via blueprint", () => {
    const entity1: BlueprintEntity = {
      entity_number: 1,
      name: "fast-inserter",
      position: Pos(0.5, 0.5),
      direction: direction.west,
      wires: [[1, defines.wire_connector_id.circuit_red, 2, defines.wire_connector_id.circuit_red]],
    }
    const entity2: BlueprintEntity = {
      entity_number: 2,
      name: "transport-belt",
      position: Pos(0, 2),
      direction: direction.south,
      wires: [[2, defines.wire_connector_id.circuit_red, 1, defines.wire_connector_id.circuit_red]],
    }
    const entity = buildEntity(1, { name: "inserter", position: pos, direction: direction.west })
    const stack = player.cursor_stack!
    stack.set_stack("blueprint")
    stack.blueprint_snap_to_grid = [1, 1]
    stack.blueprint_absolute_snapping = true
    stack.set_blueprint_entities([entity1, entity2])

    player.teleport([0, 0], surfaces[0])
    player.build_from_cursor({ position: pos, build_mode: defines.build_mode.superforced })

    const expected = "fast-inserter"
    expect(entity.firstValue).toMatchTable({ name: expected })
    expect(entity.getWorldEntity(1)).toMatchTable({ name: expected })
    expect(entity.wireConnections).not.toBeNil()
  })

  describe.each([defines.direction.north, defines.direction.northeast])("with rail direction %d", (diag) => {
    test.each([defines.direction.east, defines.direction.south])(
      "can paste a straight rail in blueprint direction %s",
      (direction) => {
        const entity: BlueprintEntity = {
          entity_number: 1,
          name: "straight-rail",
          position: Pos(1, 1),
          direction: diag,
        }
        const stack = player.cursor_stack!
        stack.set_stack("blueprint")
        stack.blueprint_snap_to_grid = [2, 2]
        stack.blueprint_absolute_snapping = true
        stack.set_blueprint_entities([entity])

        const pos = Pos(5, 5)
        player.teleport([0, 0], surfaces[0])
        player.build_from_cursor({ position: pos, direction, build_mode: defines.build_mode.normal })

        const rail = surfaces[0].find_entities_filtered({
          name: "straight-rail",
          area: BBox.around(pos, 4),
          limit: 1,
        })[0]
        expect(rail).not.toBeNil()
        const expected = (diag + direction) % 8
        expect(rail.direction).toEqual(expected)

        const projectEntity = project.content.findCompatibleWithLuaEntity(rail, nil, 1)

        expect(projectEntity).not.toBeNil()
        expect(projectEntity!.getWorldEntity(1)).toEqual(rail)

        expect(projectEntity!.direction).toEqual(expected)
      },
    )
  })

  test("pasting diagonal rail at same position but different direction", () => {
    const entity: BlueprintEntity = {
      entity_number: 1,
      name: "straight-rail",
      position: Pos(1, 1),
      direction: defines.direction.northeast,
    }
    const stack = player.cursor_stack!
    stack.set_stack("blueprint")
    // stack.blueprint_snap_to_grid = [2, 2]
    // stack.blueprint_absolute_snapping = true
    stack.set_blueprint_entities([entity])

    const pos = Pos(4, 4)
    player.teleport([0, 0], surfaces[0])

    player.build_from_cursor({
      position: pos,
      direction: defines.direction.north,
      build_mode: defines.build_mode.forced,
    })
    const rail = surfaces[0].find_entities_filtered({
      name: "straight-rail",
      position: pos,
      radius: 0,
      direction: defines.direction.northeast,
    })[0]
    expect(rail).not.toBeNil()

    player.build_from_cursor({
      position: pos,
      direction: defines.direction.east,
      build_mode: defines.build_mode.forced,
    })
    const rail2 = surfaces[0].find_entities_filtered({
      name: "straight-rail",
      position: pos,
      radius: 0,
      direction: defines.direction.southeast,
    })[0]
    expect(rail2).not.toBeNil()

    const entity1 = project.content.findCompatibleWithLuaEntity(rail, nil, 1)
    const entity2 = project.content.findCompatibleWithLuaEntity(rail2, nil, 1)
    expect(entity1).not.toBeNil()
    expect(entity2).not.toBeNil()

    expect(entity1!.direction).toEqual(defines.direction.northeast)
    expect(entity2!.direction).toEqual(defines.direction.southeast)

    expect(entity1!.getWorldEntity(1)).toEqual(rail)
    expect(entity2!.getWorldEntity(1)).toEqual(rail2)
  })

  describe.each([
    "straight-rail",
    "stone-furnace",
    "storage-tank",
    "assembling-machine-1",
    "small-electric-pole",
    "boiler",
    "underground-belt",
  ])("can paste %s", (entityName) => {
    describe.each([defines.direction.east, defines.direction.south])("at direction %d", (entityDirection) => {
      test.each([defines.direction.north, defines.direction.west])("pasted at direction %d", (pasteDirection) => {
        const bboxSize = BBox.size(prototypes.entity[entityName].collision_box)
        const pos = Pos(bboxSize.x % 2 == 0 ? 0 : 0.5, bboxSize.y % 2 == 0 ? 0 : 0.5)

        const entity: BlueprintEntity = {
          entity_number: 1,
          name: entityName,
          position: pos,
          direction: entityDirection,
        }
        const stack = player.cursor_stack!
        stack.set_stack("blueprint")
        stack.set_blueprint_entities([entity])
        player.teleport([0, 0], surfaces[0])
        player.build_from_cursor({
          position: Pos(0, 0),
          direction: pasteDirection,
          build_mode: defines.build_mode.forced,
        })
        const luaEntity = surfaces[0].find_entity(entityName, pos)!
        expect(luaEntity).not.toBeNil()

        const entity1 = project.content.findCompatibleWithLuaEntity(luaEntity, nil, 1)!
        expect(entity1).not.toBeNil()
        expect(entity1.direction).toEqual(luaEntity.direction)
        expect(entity1.getWorldEntity(1)).toEqual(luaEntity)

        assertEntityCorrect(entity1, false)
      })
    })
  })

  test("pasting rotate blueprint with a rotated fluid tank", () => {
    const entity: BlueprintEntity = {
      entity_number: 1,
      name: "storage-tank",
      position: Pos(0, 0),
      direction: 4,
    }
    const stack = player.cursor_stack!
    stack.set_stack("blueprint")
    stack.set_blueprint_entities([entity])

    const pos = Pos(5, 5)

    player.teleport([0, 0], surfaces[0])
    player.build_from_cursor({ position: pos, direction: 4, build_mode: defines.build_mode.forced })
    const tank = surfaces[0].find_entity("storage-tank", pos)!
    expect(tank).not.toBeNil()

    expect(tank.direction).toBe(0)

    const entity1 = project.content.findCompatibleWithLuaEntity(tank, nil, 1)!
    expect(entity1).not.toBeNil()
    expect(entity1.direction).toEqual(0)
    expect(entity1.getWorldEntity(1)).toEqual(tank)

    assertEntityCorrect(entity1, false)
  })

  test("can paste a power pole at a lower stage to move", () => {
    const pole = buildEntity(3, { name: "medium-electric-pole", position: Pos(0.5, 0.5) })

    const entity: BlueprintEntity = {
      entity_number: 1,
      name: "medium-electric-pole",
      position: Pos(0.5, 0.5),
    }

    const stack = player.cursor_stack!
    stack.set_stack("blueprint")
    stack.set_blueprint_entities([entity])

    player.teleport([0, 0], surfaces[2 - 1])
    player.build_from_cursor({ position: Pos(0.5, 0.5), direction: 0, build_mode: defines.build_mode.forced })
    // should move to stage 2

    const pole2 = surfaces[2 - 1].find_entity("medium-electric-pole", Pos(0.5, 0.5))!
    expect(pole2).not.toBeNil()

    expect(pole.firstStage).toBe(2)
    expect(pole.getWorldEntity(2)).toEqual(pole2)

    assertEntityCorrect(pole, false)
  })
})

test("rebuildStage", () => {
  const entityPresent = buildEntity(2, { name: "inserter", position: pos.add(1, 0), direction: direction.west })
  const entityPreview = buildEntity(3, { name: "inserter", position: pos.add(2, 0), direction: direction.west })
  const entityPastLastStage = buildEntity(1, { name: "inserter", position: pos.add(3, 0), direction: direction.west })
  expect(project.updates.trySetLastStage(entityPastLastStage, 1)).toEqual(StageMoveResult.Updated)
  entityPresent._applyDiffAtStage(4, { name: "bulk-inserter" })
  project.worldUpdates.refreshAllWorldEntities(entityPresent)
  assertEntityCorrect(entityPresent, false)

  for (const stage of $range(1, 6)) {
    project.worldUpdates.rebuildStage(stage)

    assertEntityCorrect(entityPresent, false)
    assertEntityCorrect(entityPreview, false)
    assertEntityCorrect(entityPastLastStage, false)
  }
})

test("Can update an infinity accumulator", () => {
  assert("EditorExtensions" in script.active_mods)
  const entity = buildEntity(1, { name: "ee-infinity-accumulator-primary-input", position: pos })
  expect(entity.getWorldOrPreviewEntity(2)?.name).toEqual("ee-infinity-accumulator-primary-input")

  const oldLuaEntity = entity.getWorldEntity(1)!
  const newLuaEntity = createEntity(1, {
    name: "ee-infinity-accumulator-primary-output",
    position: pos,
  })
  oldLuaEntity.destroy()
  checkForEntityUpdates(newLuaEntity, nil)

  expect(entity).toMatchTable({
    firstValue: { name: "ee-infinity-accumulator-primary-output" },
  })
  expect(entity.getWorldOrPreviewEntity(1)?.name).toEqual("ee-infinity-accumulator-primary-output")
  expect(entity.getWorldOrPreviewEntity(2)?.name).toEqual("ee-infinity-accumulator-primary-output")
})

describe("map gen settings", () => {
  after_each(() => {
    surfaces.forEach((s) => {
      s.generate_with_lab_tiles = true
      s.clear()
    })
  })
  test.skip("rebuild stage after sync map gen settings", () => {
    // skip due to hanging process for some reason
    const entity = buildEntity(1, { name: "inserter", position: pos, direction: direction.west })
    assertEntityCorrect(entity, false)
    surfaces[0].generate_with_lab_tiles = false
    player.teleport(pos, surfaces[0])
    syncMapGenSettings(project.getStage(1)!)
    after_ticks(60, () => {
      assertEntityCorrect(entity, false)
    })
  })
  test("adding a new stage gets the same map settings as previous stage", () => {
    surfaces[2].map_gen_settings = {
      ...surfaces[2].map_gen_settings,
      seed: 42,
    }
    surfaces[2].generate_with_lab_tiles = false
    project.insertStage(4)
    expect(project.getSurface(4)).toMatchTable({
      map_gen_settings: { seed: 42 },
      generate_with_lab_tiles: false,
    })
  })
})

test("deleting train by removing rail under it", () => {
  const trainEntity = createRollingStock(surfaces[0], nil, true)
  let train: ProjectEntity | nil
  for (const entity of project.content.allEntities()) {
    if (entity.firstValue.name == "locomotive") {
      train = entity
      break
    }
  }
  assert(train)
  assert(trainEntity.destroy({ raise_destroy: false }))
  expect(trainEntity.valid).toBe(false)
  after_ticks(1, () => {
    expect(project.content.hasEntity(train)).toBe(false)
  })
})

test("rebuilding stage does not delete train", () => {
  const trainEntity = createRollingStock(surfaces[0], nil, true)
  let train: ProjectEntity | nil
  for (const entity of project.content.allEntities()) {
    if (entity.firstValue.name == "locomotive") {
      train = entity
      break
    }
  }
  assert(train)
  project.worldUpdates.rebuildStage(1)
  expect(trainEntity.valid).toBe(false)
  expect(project.content.hasEntity(train)).toBe(true)
  const newTrain = surfaces[0].find_entities_filtered({ name: "locomotive" })[0]
  expect(newTrain).not.toBeNil()
})

test("rebuilding stage places wagon and elevated rails correctly", () => {
  const bp =
    "0eNqVk+FugyAUhd+F39oIilZfZVkM6p0jQzCAdk3ju++iXdt0Ltl+kQsn3zlcLhfSqAlGK7Un1YU4LcbYm7i3sgv1J6loFpEzqbIlIqJxRk0e4iAbpe5J5e0EERmNk14aHVtQwssZnhjHFcEQIVujHale0Er2Wqgg0GIAUhErpCJBojsIvkv0iyh20zga6x/EbHmNCGiPKWDDr8W51tPQgEVa9E1ohe1NfBK90eSe/Bq0ONCSp5TxNTA90IIXRyyXQBeNglqZXjovW1ef3iXWg5nXRrwJ5bATxkp0FhsyObAsSZIckVlRHHmZlUVSJBtf6hmVxqKPnpQKt33KzG6ZQcEsPHRxO9kZl7UL4mf8fIuNaTtpod1OKNthp/9m02QPnu+ws2j3tX4Q09tUPADTHSD/I5DuEnmYDedN+1Hj8Olt+zqDYTfcCRXSw4AO9+8QkRms2xA5w7crOWc8Txldli/P6xAi"
  const stack = player.cursor_stack!
  stack.set_stack("blueprint")
  stack.import_stack(bp)

  const wagon = surfaces[0].find_entities_filtered({ name: "cargo-wagon" })[0]
  expect(wagon).toBeNil()

  player.teleport([0, 0], surfaces[0])
  player.build_from_cursor({ position: pos, direction: 0, build_mode: defines.build_mode.forced })

  project.worldUpdates.rebuildAllStages()

  const rail = surfaces[0].find_entities_filtered({ name: "elevated-curved-rail-a" })[0]
  expect(rail).not.toBeNil()

  const wagon2 = surfaces[0].find_entities_filtered({ name: "cargo-wagon" })[0]
  expect(wagon2).not.toBeNil()
})

test("newly created train does not get set to automatic", () => {
  const bp =
    "0eNqtlNtuwyAMht/F16QqTUiavMpURTRlKRqBCkgPqvLugyRtt7WVfLE7bOzvx4B9ha3qxcFK7aG6gmyMdlB9XMHJVnMVfZp3AiqwXCoYCEi9E2eo6LAhILSXXoopYzQute67rbAhgNwyfUjVifPmAAQOxoUUoyM5YJKCwCXSCOykFc20RVcEnOeTAefGch2knyRWdwkXNdq9T8ZTvlNJf6tkL5ApGsmwyAyNTLFIhkZSLDK/I5VpTGe8PIpn3nJRpsWjcqH5VolamVY6LxtXn/Yy2J05St1C9cmVEwSMlUFsfs3lomAv5AtsReiC1lgi+tZLLBH9Nejyjmy4bU1y4m2IfQIW/3DtKxZ79xhcxgaO7pV6dSKKLRLdUhTdpiUaiW5T+ua/hOHlmr3Y9WqeXo9fH+38x34khUxjd/Nk/DuYNsOI86b5qsP81JPKLTh4x+7a8rigy1jO7I3PP7nzSJBedIH6GMgEjsK6UYvlqzIrS8YYXWd5NgzfVMfqjA=="
  const stack = player.cursor_stack!
  stack.set_stack("blueprint")
  stack.import_stack(bp)

  player.teleport([0, 0], surfaces[0])
  player.build_from_cursor({ position: pos, direction: 0 })

  const train = surfaces[0].find_entities_filtered({ name: "locomotive" })[0]
  train.train!.manual_mode = false
  expect(train).toBeAny()
  after_ticks(2, () => {
    expect(train.train?.manual_mode).toBe(true)
    expect(train.train?.speed).toBe(0)
  })
})

test("mirroring an entity", () => {
  const chemPlant = buildEntity(1, {
    name: "chemical-plant",
    recipe: "light-oil-cracking",
  })
  const luaEntity = chemPlant.getWorldEntity(1)
  assert(luaEntity)
  luaEntity.mirroring = true
  Events.raiseFakeEventNamed("on_player_flipped_entity", {
    entity: luaEntity,
    player_index: player.index,
    horizontal: true,
  })

  const luaEntity2 = chemPlant.getWorldEntity(2)
  expect(luaEntity2?.mirroring).toBe(true)
})

test("mirroring an entity by pasting mirrored", () => {
  const chemPlant = buildEntity(1, {
    name: "chemical-plant",
    recipe: "light-oil-cracking",
  })
  const stack = player.cursor_stack!
  stack.clear()
  stack.set_stack("blueprint")

  stack.set_blueprint_entities([
    {
      entity_number: 1,
      position: [0, 0],
      name: "chemical-plant",
      recipe: "sulfuric-acid",
    },
  ])

  player.teleport([0, 0], surfaces[0])

  player.build_from_cursor({ position: chemPlant.position, mirror: false })
  expect(chemPlant.getWorldEntity(1)?.mirroring).toBe(false)
  expect(chemPlant.getWorldEntity(2)?.mirroring).toBe(false)

  player.build_from_cursor({ position: chemPlant.position, mirror: true })
  expect(chemPlant.getWorldEntity(1)?.mirroring).toBe(true)
  expect(chemPlant.getWorldEntity(2)?.mirroring).toBe(true)
})

test("paste a rotated assembler", () => {
  player.cursor_stack!.set_stack("blueprint")
  player.cursor_stack!.set_blueprint_entities([
    {
      entity_number: 1,
      position: [0, 0],
      name: "assembling-machine-2",
      recipe: "concrete",
      direction: defines.direction.east,
    },
  ])

  player.teleport([0, 0], surfaces[0])
  player.build_from_cursor({ position: [0.5, 0.5] })

  const asm2s = surfaces[1].find_entities_filtered({
    name: "assembling-machine-2",
    position: [0.5, 0.5],
  })
  expect(asm2s.length).toBe(1)
  const asm2 = asm2s[0]

  const projectAsm2 = project.content.findCompatibleWithLuaEntity(asm2, nil, 2)
  expect(projectAsm2).not.toBeNil()
  expect(projectAsm2?.direction).toBe(defines.direction.east)

  expect(asm2.direction).toBe(defines.direction.east)
})
