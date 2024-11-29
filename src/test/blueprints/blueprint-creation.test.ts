/*
 * Copyright (c) 2023 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

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
import * as _setTiles from "../../project/set-tiles"
import { _deleteAllProjects, createUserProject } from "../../project/UserProject"
import { moduleMock } from "../module-mock"

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
  project.defaultBlueprintSettings.snapToGrid.set(Pos(2, 3))
  project.defaultBlueprintSettings.positionRelativeToGrid.set(Pos(4, 5))
  project.defaultBlueprintSettings.appendStageNumbersToIcons.set(true)

  const stage = project.getStage(1)!
  const stack = player.cursor_stack!

  const ret = takeStageBlueprint(stage, stack)
  expect(ret).toBe(false)

  createEntity(stage)

  const ret2 = takeStageBlueprint(stage, stack)
  expect(ret2).toBe(true)

  expect(stack.blueprint_snap_to_grid).toEqual(Pos(2, 3))
  expect(stack.blueprint_position_relative_to_grid).toEqual(Pos(4, 5))

  expect(stack.label).toEqual(stage.name.get())

  const entities = stack.get_blueprint_entities()!
  expect(entities).toHaveLength(1)
  expect(entities[0].name).toBe("iron-chest")

  expect(stack.preview_icons).toMatchTable([{ index: 1, signal: { type: "virtual", name: "signal-1" } }])
})

describe("set tiles", () => {
  const setTiles = moduleMock(_setTiles, true)
  test("calls setTiles if autoLandfill is true", () => {
    const stage = project.getStage(1)!

    const stack = player.cursor_stack!
    createEntity(stage)

    let ret = takeStageBlueprint(stage, stack)
    expect(ret).toBe(true)
    expect(setTiles.setTilesAndCheckerboardForStage).not.toHaveBeenCalled()

    stage.stageBlueprintSettings.autoLandfill.set(true)

    ret = takeStageBlueprint(stage, stack)
    expect(ret).toBe(true)
    expect(setTiles.setTilesAndCheckerboardForStage).toHaveBeenCalledWith(stage)
  })
})

test.each([false, true])("can use next stage tiles, with next staging having grid %s", (stage2HasGrid) => {
  const stage2 = project.getStage(2)!
  const stage1 = project.getStage(1)!

  stage1.stageBlueprintSettings.positionOffset.set(Pos(1, 1))
  stage1.stageBlueprintSettings.snapToGrid.set(Pos(2, 2))
  stage1.stageBlueprintSettings.useNextStageTiles.set(true)

  if (stage2HasGrid) {
    stage1.stageBlueprintSettings.snapToGrid.set(Pos(1, 5))
    stage2.stageBlueprintSettings.positionOffset.set(Pos(2, 3))
  }

  stage2.surface.set_tiles([{ name: "landfill", position: [4, 5] }])

  const stack = player.cursor_stack!
  createEntity(stage1)

  const ret = takeStageBlueprint(stage1, stack)
  expect(ret).toBe(true)

  const tiles = stack.get_blueprint_tiles()!
  expect(tiles).toMatchTable([
    {
      name: "landfill",
      position: Pos(4, 5).plus(Pos(1, 1)),
    },
  ])
})

test("stageLimit: only entities present in last x stages or in additionalWhitelist", () => {
  const [stage1, stage2, stage3, stage4] = project.getAllStages()

  createEntity(stage1) // not included
  const e1 = createEntity(stage1, [1.5, 1.5]) // included, as has changed in stage 2
  const e1Stage2 = project.content.findCompatibleWithLuaEntity(e1, nil, 1)!.getWorldEntity(2)!
  e1Stage2.get_inventory(defines.inventory.chest)!.set_bar(3)
  checkForEntityUpdates(e1Stage2, nil)
  const e2 = createEntity(stage2, [2.5, 2.5]) // included
  const e3 = createEntity(stage3, [3.5, 3.5]) // included
  createEntity(stage4, [4.5, 4.5]) // not included

  const e4 = createEntity(stage1, [5.5, 5.5], "steel-chest") // included, in additional whitelist

  const e5 = createEntity(stage1, [6.5, 6.5], "iron-chest") // included, has wire-connection with e3
  const e5stage3 = project.content.findCompatibleWithLuaEntity(e5, nil, 1)!.getWorldEntity(3)!
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
  const stageBlueprintSettings = stage3.stageBlueprintSettings
  stageBlueprintSettings.stageLimit.set(2)
  stageBlueprintSettings.snapToGrid.set(Pos(2, 2))
  stageBlueprintSettings.positionOffset.set(Pos(0, 0))
  stageBlueprintSettings.additionalWhitelist.set(newLuaSet("steel-chest"))

  const ret = takeStageBlueprint(stage3, stack)
  expect(ret).toBe(true)

  const entities = stack.get_blueprint_entities()!
  expect(entities).toHaveLength(includedEntities.length)
  expect(entities.map((e) => e.position).sort((a, b) => a.x - b.x)).toEqual(
    includedEntities.map((e) => e.position).sort((a, b) => a.x - b.x),
  )
})

test("excludeFromFutureBlueprints: entities are not included in future blueprints", () => {
  const [stage1, stage2, stage3] = project.getAllStages()
  const e1 = createEntity(stage1) // should be excluded
  stage1.stageBlueprintSettings.excludeFromFutureBlueprints.set(true)
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

test("make blueprint book", () => {
  for (const i of $range(1, project.numStages())) {
    createEntity(project.getStage(i)!, [i + 0.5, i + 0.5])
  }

  const stack = player.cursor_stack!
  submitProjectBlueprintBookTask(project, stack)
  on_tick(() => {
    if (isTaskRunning()) return

    expect(stack.is_blueprint_book).toBe(true)
    expect(stack.label).toBe(project.name.get())
    const inventory = stack.get_inventory(defines.inventory.item_main)!
    expect(inventory).toHaveLength(4)
    for (const i of $range(1, project.numStages())) {
      expect(inventory[i - 1].is_blueprint).toBe(true)
      expect(inventory[i - 1].label).toBe(project.getStage(i)!.name.get())
      const entities = inventory[i - 1].get_blueprint_entities()!
      expect(entities).toHaveLength(i)
      expect(entities[0].name).toBe("iron-chest")
    }

    done()
  })
})

test("export blueprint book to file", () => {
  const result = exportBlueprintBookToFile(project, player)
  expect(result).toEqual("staged-blueprints/test")

  cancelCurrentTask()
})

test("make blueprint book using template", () => {
  for (const i of $range(1, project.numStages())) {
    createEntity(project.getStage(i)!, [i + 0.5, i + 0.5])
  }
  const templateInv = project.getOrCreateBlueprintBookTemplate().get_inventory(defines.inventory.item_main)!
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
  expect(stack.label).toBe(project.name.get())
  const inventory = stack.get_inventory(defines.inventory.item_main)!
  expect(inventory).toHaveLength(stageMapping.length + 1)
  for (const i of $range(1, stageMapping.length)) {
    const stageNum = stageMapping[i - 1]
    const stage = project.getStage(stageNum)!
    const stack = inventory[i - 1]
    expect(stack.is_blueprint).comment(`Stage ${i}`).toBe(true)
    expect(stack.label).toBe(stage.name.get())
    const entities = stack.get_blueprint_entities()!
    expect(entities).comment(`Stage ${i}`).toHaveLength(stageNum)
    expect(entities[0].name).toBe("iron-chest")
  }
  expect(inventory[stageMapping.length].is_deconstruction_item).toBe(true)
})
