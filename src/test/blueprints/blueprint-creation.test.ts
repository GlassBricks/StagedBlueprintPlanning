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

import { BlueprintEntity, LuaEntity, LuaPlayer, MapPositionArray } from "factorio:runtime"
import expect from "tstl-expect"
import {
  exportBlueprintBookToFile,
  submitProjectBlueprintBookTask,
  takeStageBlueprint,
} from "../../blueprints/blueprint-creation"
import { ProjectEntity } from "../../entity/ProjectEntity"
import { Pos } from "../../lib/geometry"
import { cancelCurrentTask, isTaskRunning } from "../../lib/task"
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
  e5stage3.connect_neighbour({ wire: defines.wire_type.red, target_entity: e3 })
  checkForCircuitWireUpdates(e5stage3, nil)

  const includedEntities = [e1, e2, e3, e4, e5]

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

test("moduleOverrides: uses modules later stage if updated", () => {
  const stage1 = project.getStage(1)!
  const e1 = createEntity(stage1, nil, "assembling-machine-1")
  const projEntity = project.content.findCompatibleWithLuaEntity(e1, nil, 1) as ProjectEntity<BlueprintEntity>
  projEntity._applyDiffAtStage(2, {
    name: "assembling-machine-2",
    recipe: "iron-gear-wheel",
    items: {
      "productivity-module": 2,
    },
  })
  project.entityUpdates.refreshAllWorldEntities(projEntity)

  const stack = player.cursor_stack!
  const stageBlueprintSettings = stage1.stageBlueprintSettings
  stageBlueprintSettings.useModulePreloading.set(true)

  const ret = takeStageBlueprint(stage1, stack)

  expect(ret).toBe(true)

  const entities = stack.get_blueprint_entities()!
  expect(entities).toHaveLength(1)
  expect(entities[0]).toMatchTable({
    name: "assembling-machine-1",
    items: {
      ["productivity-module"]: 2,
    },
  })
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
