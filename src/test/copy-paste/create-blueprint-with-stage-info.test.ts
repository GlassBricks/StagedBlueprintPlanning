/*
 * Copyright (c) 2024 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { LuaPlayer, SurfaceCreateEntity, SurfaceIndex } from "factorio:runtime"
import expect from "tstl-expect"
import { Prototypes } from "../../constants"
import { BpStagedInfo, BpStagedInfoTags } from "../../copy-paste/blueprint-stage-info"
import { createBlueprintWithStageInfo } from "../../copy-paste/create-blueprint-with-stage-info"
import { AssemblingMachineEntity, Entity } from "../../entity/Entity"
import { StageNumber } from "../../entity/ProjectEntity"
import { Pos } from "../../lib/geometry"
import { getPlayer } from "../../lib/test/misc"
import { UserProject } from "../../project/ProjectDef"
import { createUserProject } from "../../project/UserProject"
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

test("create blueprint of entity with stage diff", () => {
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
    },
    stageDiffs: {
      "3": {
        name: "assembling-machine-2",
        recipe: { __nil: true },
      },
    },
  } satisfies BpStagedInfo<AssemblingMachineEntity>)
})
test("does not clear stack if no entities selected", () => {
  player.cursor_stack?.set_stack(Prototypes.StagedCopyTool)
  createBlueprintWithStageInfo(player, project.getStage(3)!, {
    left_top: Pos(-1, -1),
    right_bottom: Pos(1, 1),
  })

  expect(player.cursor_stack?.name).toBe(Prototypes.StagedCopyTool)
})
