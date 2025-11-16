// Copyright (c) 2024-2025 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { LuaPlayer, SurfaceCreateEntity, SurfaceIndex } from "factorio:runtime"
import expect from "tstl-expect"
import { Prototypes } from "../../constants"
import { AssemblingMachineEntity, Entity } from "../../entity/Entity"
import { StageNumber } from "../../entity/ProjectEntity"
import { StageInfoExport } from "../../import-export/entity"
import { Pos } from "../../lib/geometry"
import { getPlayer } from "../../lib/test/misc"
import { UserProject } from "../../project/ProjectDef"
import { createUserProject } from "../../project/UserProject"
import { BpStagedInfoTags, createBlueprintWithStageInfo } from "../../ui/create-blueprint-with-stage-info"
import { getNilPlaceholder } from "../../utils/diff-value"

let player: LuaPlayer
let project: UserProject
before_all(() => {
  player = getPlayer()
  player.teleport(Pos(0, 0), 1 as SurfaceIndex)
})
before_each(() => {
  player.cursor_stack!.clear()
  project = createUserProject("test", 3)
})

function addEntity<E extends Entity = Entity>(stage: StageNumber, args: SurfaceCreateEntity) {
  const entity = project.getSurface(stage)!.create_entity(args)!
  assert(entity)

  return assert(project.updates.addNewEntity<E>(entity, stage, nil))
}

test("create blueprint of simple entity", () => {
  const entity = addEntity(2, {
    name: "stone-furnace",
    position: Pos(0, 0),
    force: "player",
  })
  entity.setLastStageUnchecked(3)

  const stack = createBlueprintWithStageInfo(player, project.getStage(3)!, {
    left_top: Pos(-1, -1),
    right_bottom: Pos(1, 1),
  })!

  expect(stack).toBeAny()
  const entities = stack.get_blueprint_entities()!
  expect(entities).toHaveLength(1)
  expect(entities[0].name).toBe("stone-furnace")
  expect(entities[0].tags).toEqual({
    bp100: { firstStage: 2, lastStage: 3 },
  } satisfies BpStagedInfoTags)
})

test("create blueprint of entity with stage diff and unstaged value", () => {
  const entity = addEntity<AssemblingMachineEntity>(2, {
    name: "assembling-machine-1",
    position: Pos(0, 0),
    force: "player",
    recipe: "iron-gear-wheel",
  })
  entity._applyDiffAtStage(3, {
    name: "assembling-machine-2",
    recipe: getNilPlaceholder(),
  })
  entity.setUnstagedValue(2, {
    _forTest: "foo",
  })

  const stack = createBlueprintWithStageInfo(player, project.getStage(2)!, {
    left_top: Pos(-1, -1),
    right_bottom: Pos(1, 1),
  })!

  expect(stack).toBeAny()
  const entities = stack.get_blueprint_entities()!
  expect(entities).toHaveLength(1)
  expect(entities[0].tags?.bp100).toEqual({
    firstStage: 2,
    lastStage: nil,
    firstValue: {
      name: "assembling-machine-1",
      recipe: "iron-gear-wheel",
      recipe_quality: "normal",
    },
    stageDiffs: {
      "3": {
        name: "assembling-machine-2",
        recipe: { __nil: true },
      },
    },
    unstagedValue: {
      "2": {
        _forTest: "foo",
      },
    },
  } satisfies StageInfoExport<AssemblingMachineEntity>)
})

test("does not clear stack if no entities selected", () => {
  player.cursor_stack?.set_stack(Prototypes.StagedCopyTool)
  createBlueprintWithStageInfo(player, project.getStage(3)!, {
    left_top: Pos(-1, -1),
    right_bottom: Pos(1, 1),
  })

  expect(player.cursor_stack?.name).toBe(Prototypes.StagedCopyTool)
})
