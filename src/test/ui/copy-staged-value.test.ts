// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { LuaEntity, LuaPlayer, LuaSurface } from "factorio:runtime"
import expect from "tstl-expect"
import { Settings } from "../../constants"
import { Events } from "../../lib"
import { BBox } from "../../lib/geometry"
import { Stage, UserProject } from "../../project/ProjectDef"
import { _deleteAllProjects, createUserProject } from "../../project/UserProject"
import { simpleInsertPlan } from "../entity/entity-util"

let project: UserProject
let player: LuaPlayer
let surface: LuaSurface
let stage: Stage

before_each(() => {
  project = createUserProject("test", 2)
  player = game.players[1]
  stage = project.getStage(1)!
  surface = stage.getSurface()
  player.mod_settings[Settings.CopyItemRequests] = { value: true } as any
})

after_each(() => {
  _deleteAllProjects()
  player.cursor_stack?.clear()
})

function createEntity(name: string = "iron-chest"): LuaEntity {
  return assert(
    surface.create_entity({
      name,
      position: [0.5, 0.5],
      force: "player",
      raise_built: true,
    }),
  )
}

describe("copy item requests when creating blueprint", () => {
  test("adds multiple entities with different item requests", () => {
    const chest1 = createEntity("iron-chest")
    const chest2 = surface.create_entity({
      name: "steel-chest",
      position: [2.5, 2.5],
      force: "player",
      raise_built: true,
    })!

    const projectEntity1 = project.content.findCompatibleWithLuaEntity(chest1, nil, 1)!
    const projectEntity2 = project.content.findCompatibleWithLuaEntity(chest2, nil, 1)!

    const itemRequest1 = simpleInsertPlan(defines.inventory.chest, "iron-plate", 1, 50)
    const itemRequest2 = simpleInsertPlan(defines.inventory.chest, "copper-plate", 2, 100)

    projectEntity1._asMut().setUnstagedValue(1, { items: [itemRequest1] })
    projectEntity2._asMut().setUnstagedValue(1, { items: [itemRequest2] })

    const stack = player.cursor_stack!
    stack.set_stack("blueprint")
    stack.set_blueprint_entities([
      {
        entity_number: 1,
        name: chest1.name,
        position: chest1.position,
      },
      {
        entity_number: 2,
        name: chest2.name,
        position: chest2.position,
      },
    ])

    const mapping = {
      get: () => ({
        1: chest1,
        2: chest2,
      }),
    }

    Events.raiseFakeEventNamed("on_player_setup_blueprint", {
      player_index: player.index,
      surface,
      area: BBox.around(chest1.position, 5),
      item: "blueprint",
      stack,
      alt: false,
      mapping: mapping as any,
    })

    const bpEntities = stack.get_blueprint_entities()!
    expect(bpEntities).toHaveLength(2)
    expect(bpEntities[0].items).toEqual([itemRequest1])
    expect(bpEntities[1].items).toEqual([itemRequest2])
  })

  test("filters out requests for inventories already in blueprint", () => {
    const chest = createEntity("iron-chest")
    const projectEntity = project.content.findCompatibleWithLuaEntity(chest, nil, 1)!

    const itemRequest1 = simpleInsertPlan(defines.inventory.chest, "iron-plate", 1, 50)
    const itemRequest2 = simpleInsertPlan(defines.inventory.chest, "copper-plate", 2, 100)

    projectEntity._asMut().setUnstagedValue(1, { items: [itemRequest1, itemRequest2] })

    const stack = player.cursor_stack!
    stack.set_stack("blueprint")
    stack.set_blueprint_entities([
      {
        entity_number: 1,
        name: chest.name,
        position: chest.position,
        // Blueprint already has some item requests for the chest inventory
        items: [itemRequest1],
      },
    ])

    const mapping = {
      get: () => ({ 1: chest }),
    }

    Events.raiseFakeEventNamed("on_player_setup_blueprint", {
      player_index: player.index,
      surface,
      area: BBox.around(chest.position, 1),
      item: "blueprint",
      stack,
      alt: false,
      mapping: mapping as any,
    })

    const bpEntities = stack.get_blueprint_entities()!
    expect(bpEntities[0].items).toBeAny()
    // Since chest inventory is already in blueprint, no new requests should be added
    expect(bpEntities[0].items!).toHaveLength(1)
  })
})
