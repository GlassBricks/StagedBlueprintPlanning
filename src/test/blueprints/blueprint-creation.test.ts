// Copyright (c) 2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { LuaEntity, LuaPlayer, MapPositionArray } from "factorio:runtime"
import expect from "tstl-expect"
import {
  exportBlueprintBookToFile,
  submitProjectBlueprintBookTask,
  takeStageBlueprint,
} from "../../blueprints/blueprint-creation"
import { createStageReference, getReferencedStage } from "../../blueprints/stage-reference"
import { addWireConnection } from "../../entity/ProjectEntity"
import { Pos } from "../../lib/geometry"
import { cancelCurrentTask, isTaskRunning, runEntireCurrentTask } from "../../lib/task"
import { checkForCircuitWireUpdates, checkForEntityUpdates } from "../../project/event-handlers"
import { Stage, UserProject } from "../../project/ProjectDef"
import { _deleteAllProjects, createUserProject } from "../../project/UserProject"
import { simpleInsertPlan } from "../entity/entity-util"

let project: UserProject
let player: LuaPlayer
before_each(() => {
  project = createUserProject("test", 4)
  player = game.players[1]
})

after_each(() => {
  _deleteAllProjects()
  player.cursor_stack?.clear()
})

function createEntity(stage: Stage, pos: MapPositionArray = [0.5, 0.5], name: string = "iron-chest"): LuaEntity {
  return assert(
    stage.surface.create_entity({
      name,
      position: pos,
      force: "player",
      raise_built: true,
    }),
  )
}

test("can take single blueprint using stage settings", () => {
  project.settings.defaultBlueprintSettings.snapToGrid.set(Pos(2, 3))
  project.settings.defaultBlueprintSettings.positionRelativeToGrid.set(Pos(4, 5))
  project.settings.defaultBlueprintSettings.appendStageNumbersToIcons.set(true)
  const stage = project.getStage(1)!
  stage.getSettings().stageBlueprintSettings.description.set("Test")

  const stack = player.cursor_stack!
  const ret = takeStageBlueprint(stage, stack)

  expect(ret).toBe(false)

  createEntity(stage)

  const ret2 = takeStageBlueprint(stage, stack)
  expect(ret2).toBe(true)

  expect(stack.blueprint_snap_to_grid).toEqual(Pos(2, 3))
  expect(stack.blueprint_position_relative_to_grid).toEqual(Pos(4, 5))
  expect(stack.label).toEqual(project.settings.getStageName(1))
  expect(stack.blueprint_description).toEqual("Test")

  const entities = stack.get_blueprint_entities()!
  expect(entities).toHaveLength(1)
  expect(entities[0].name).toBe("iron-chest")

  expect(stack.preview_icons).toMatchTable([{ index: 1, signal: { type: "virtual", name: "signal-1" } }])
})

describe("customBlueprintName()", () => {
  test("Respects customBlueprintName settings", () => {
    const stage = project.getStage(1)!
    createEntity(stage)

    const stack = player.cursor_stack!
    takeStageBlueprint(stage, stack)
    expect(stack.label).toEqual(project.settings.getStageName(1))

    stage.getSettings().blueprintOverrideSettings.customBlueprintName.set("")
    takeStageBlueprint(stage, stack)
    // Factorio treats empty string label as nil
    expect(stack.label).toBeNil()

    stage.getSettings().blueprintOverrideSettings.customBlueprintName.set("My Custom Name")
    takeStageBlueprint(stage, stack)
    expect(stack.label).toEqual("My Custom Name")
  })
})

test("includes only entities present in last x stages or in additionalWhitelist when stageLimit set", () => {
  const [stage1, stage2, stage3, stage4] = project.getAllStages()

  createEntity(stage1) // not included
  const e1 = createEntity(stage1, [1.5, 1.5]) // included, as has changed in stage 2
  const e1Proj = project.content.findCompatibleWithLuaEntity(e1, nil, 1)!
  const e1Stage2 = project.worldPresentation.getWorldEntity(e1Proj, 2)!
  e1Stage2.get_inventory(defines.inventory.chest)!.set_bar(3)
  checkForEntityUpdates(e1Stage2, nil)
  const e2 = createEntity(stage2, [2.5, 2.5]) // included
  const e3 = createEntity(stage3, [3.5, 3.5]) // included
  createEntity(stage4, [4.5, 4.5]) // not included

  const e4 = createEntity(stage1, [5.5, 5.5], "steel-chest") // included, in additional whitelist

  const e5 = createEntity(stage1, [6.5, 6.5], "iron-chest") // included, has wire-connection with e3
  const e5stage3 = project.worldPresentation.getWorldEntity(
    project.content.findCompatibleWithLuaEntity(e5, nil, 1)!,
    3,
  )!
  e5stage3
    .get_wire_connector(defines.wire_connector_id.circuit_red, true)
    .connect_to(e3.get_wire_connector(defines.wire_connector_id.circuit_red, true))
  checkForCircuitWireUpdates(e5stage3, nil)

  const pole1 = createEntity(stage3, [7.5, 7.5], "small-electric-pole") // included, is in stage 3
  const pole2 = createEntity(stage1, [8.5, 8.5], "small-electric-pole") // included, has connection with pole1
  const pole1Project = project.content.findCompatibleWithLuaEntity(pole1, nil, 1)!
  const pole2Project = project.content.findCompatibleWithLuaEntity(pole2, nil, 1)!
  addWireConnection({
    fromEntity: pole1Project,
    toEntity: pole2Project,
    fromId: defines.wire_connector_id.pole_copper,
    toId: defines.wire_connector_id.pole_copper,
  })

  createEntity(stage1, [20.5, 20.5], "small-electric-pole") // not included, no connections

  const includedEntities = [e1, e2, e3, e4, e5, pole1, pole2]

  const stack = player.cursor_stack!
  const overrideSettings = stage3.getSettings().blueprintOverrideSettings
  overrideSettings.stageLimit.set(2)
  overrideSettings.snapToGrid.set(Pos(2, 2))
  overrideSettings.positionOffset.set(Pos(0, 0))
  overrideSettings.additionalWhitelist.set(newLuaSet("steel-chest"))

  const ret = takeStageBlueprint(stage3, stack)
  expect(ret).toBe(true)

  const entities = stack.get_blueprint_entities()!
  expect(entities).toHaveLength(includedEntities.length)
  expect(entities.map((e) => e.position).sort((a, b) => a.x - b.x)).toEqual(
    includedEntities.map((e) => e.position).sort((a, b) => a.x - b.x),
  )
})

test("excludes entities from future blueprints when excludeFromFutureBlueprints is set", () => {
  const [stage1, stage2, stage3] = project.getAllStages()
  const e1 = createEntity(stage1) // should be excluded
  stage1.getSettings().blueprintOverrideSettings.excludeFromFutureBlueprints.set(true)
  const e2 = createEntity(stage2, [1.5, 1.5]) // should be included
  const e3 = createEntity(stage3, [2.5, 2.5]) // should be included

  const stack = player.cursor_stack!

  const ret = takeStageBlueprint(stage3, stack)
  expect(ret).toBe(true)

  const entities = stack.get_blueprint_entities()!
  expect(entities).toHaveLength(2)
  expect(entities.map((e) => e.position).sort((a, b) => a.x - b.x)).toEqual(
    [e2, e3].map((e) => e.position).sort((a, b) => a.x - b.x),
  )

  // should still ben in stage1 blueprint
  const ret2 = takeStageBlueprint(stage1, stack)
  expect(ret2).toBe(true)
  const entities2 = stack.get_blueprint_entities()!
  expect(entities2).toHaveLength(1)
  expect(entities2[0].position).toEqual(e1.position)
})

test("creates blueprint book with all stages", () => {
  for (const i of $range(1, project.settings.stageCount())) {
    createEntity(project.getStage(i)!, [i + 0.5, i + 0.5])
  }

  const stack = player.cursor_stack!
  submitProjectBlueprintBookTask(project, stack)
  on_tick(() => {
    if (isTaskRunning()) return

    expect(stack.is_blueprint_book).toBe(true)
    expect(stack.label).toBe(project.settings.projectName.get())
    const inventory = stack.get_inventory(defines.inventory.item_main)!
    expect(inventory).toHaveLength(4)
    for (const i of $range(1, project.settings.stageCount())) {
      expect(inventory[i - 1].is_blueprint).toBe(true)
      expect(inventory[i - 1].label).toBe(project.settings.getStageName(i))
      const entities = inventory[i - 1].get_blueprint_entities()!
      expect(entities).toHaveLength(i)
      expect(entities[0].name).toBe("iron-chest")
    }

    done()
  })
})

test("exports blueprint book to file", () => {
  const result = exportBlueprintBookToFile(project, player)
  expect(result).toEqual("staged-blueprints/test")

  cancelCurrentTask()
})

test("creates blueprint book using template", () => {
  for (const i of $range(1, project.settings.stageCount())) {
    createEntity(project.getStage(i)!, [i + 0.5, i + 0.5])
  }
  const templateInv = project.settings.blueprintBookTemplate
    .getOrCreate(project, project.settings.projectName.get())
    .get_inventory(defines.inventory.item_main)!
  const stageMapping = [3, 2, 1, 2, 3]
  for (let i = 0; i < stageMapping.length; i++) {
    if (i >= templateInv.length) templateInv.insert("blueprint")
    createStageReference(templateInv[i], project.getStage(stageMapping[i])!)
  }
  templateInv.insert("deconstruction-planner")

  const stack = player.cursor_stack!
  submitProjectBlueprintBookTask(project, stack)
  runEntireCurrentTask()

  // make sure template not changed
  expect(getReferencedStage(templateInv[0])).toBe(project.getStage(3))

  expect(stack.is_blueprint_book).toBe(true)
  expect(stack.label).toBe(project.settings.projectName.get())
  const inventory = stack.get_inventory(defines.inventory.item_main)!
  expect(inventory).toHaveLength(stageMapping.length + 1)
  for (const i of $range(1, stageMapping.length)) {
    const stageNum = stageMapping[i - 1]
    const stack = inventory[i - 1]
    expect(stack.is_blueprint).comment(`Stage ${i}`).toBe(true)
    expect(stack.label).toBe(project.settings.getStageName(stageNum))
    const entities = stack.get_blueprint_entities()!
    expect(entities).comment(`Stage ${i}`).toHaveLength(stageNum)
    expect(entities[0].name).toBe("iron-chest")
  }
  expect(inventory[stageMapping.length].is_deconstruction_item).toBe(true)
})

test("blueprint with unstaged values includes item requests", () => {
  const stage2 = project.getStage(2)!
  const entity = createEntity(stage2, [0.5, 0.5], "fast-inserter")

  // Find the project entity and add unstaged value with item requests
  const projectEntity = project.content.findCompatibleWithLuaEntity(entity, nil, 1)!
  const unstagedValue = {
    items: [simpleInsertPlan(defines.inventory.crafter_input, "iron-ore", 0, 10)],
  }
  projectEntity.setUnstagedValue(2, unstagedValue)

  const stack = player.cursor_stack!
  const ret = takeStageBlueprint(stage2, stack)

  expect(ret).toBe(true)

  const entities = stack.get_blueprint_entities()!
  expect(entities).toHaveLength(1)
  expect(entities[0].name).toBe("fast-inserter")

  // Check that item requests were added to the blueprint entity
  expect(entities[0].items).toBeAny()
  expect(entities[0].items![0].id.name).toBe("iron-ore")
})

test("does not error when taking empty blueprint", () => {
  const [stage1, stage2] = project.getAllStages()
  createEntity(stage1) // create entity only in stage 1
  stage1.getSettings().blueprintOverrideSettings.excludeFromFutureBlueprints.set(true)

  const stack = player.cursor_stack!
  stage2.getSettings().stageBlueprintSettings.description.set("Test description")

  const ret = takeStageBlueprint(stage2, stack)

  expect(stack.is_blueprint_setup()).toBe(false)
  expect(ret).toBe(false)
})
