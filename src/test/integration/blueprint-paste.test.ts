// Copyright (c) 2022-2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { BlueprintEntity } from "factorio:runtime"
import expect from "tstl-expect"
import { Settings } from "../../constants"
import { assert, Events } from "../../lib"
import { BBox, Pos } from "../../lib/geometry"
import { setupEntityIntegrationTest, waitForPaste } from "./integration-test-util"
import direction = defines.direction

const ctx = setupEntityIntegrationTest()
const pos = Pos(10.5, 10.5)

describe.each([false, true])("blueprinting (using bplib %s)", (useBplib) => {
  before_each(() => {
    ctx.player.mod_settings[Settings.UseBplibForBlueprintPaste] = { value: useBplib }
  })

  after_each(() => {
    ctx.player.mod_settings[Settings.UseBplibForBlueprintPaste] = { value: false }
  })

  test.each([true, false])("can maybe upgrade entity via blueprint, with super force build %s", (superForce) => {
    const bpEntity: BlueprintEntity = {
      entity_number: 1,
      name: "fast-inserter",
      position: Pos(0.5, 0.5),
      direction: direction.west,
    }
    const entity = ctx.buildEntity(1, { name: "inserter", position: pos, direction: direction.west })
    const stack = ctx.player.cursor_stack!
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

    ctx.player.teleport([0, 0], ctx.surfaces[0])
    ctx.player.build_from_cursor({
      position: pos,
      build_mode: superForce ? defines.build_mode.superforced : defines.build_mode.forced,
    })

    waitForPaste(useBplib, () => {
      const expected = superForce ? "fast-inserter" : "inserter"
      expect(entity.firstValue).toMatchTable({ name: expected })
      expect(ctx.worldQueries.getWorldEntity(entity, 1)).toMatchTable({ name: expected })
    })
  })

  test("can upgrade entity to different quality with super-force build", () => {
    const entity = ctx.buildEntity(1, {
      name: "iron-chest",
      position: pos,
      direction: direction.east,
    })
    const stack = ctx.player.cursor_stack!
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

    ctx.player.teleport([0, 0], ctx.surfaces[0])
    ctx.player.build_from_cursor({
      position: pos,
      build_mode: defines.build_mode.superforced,
    })

    waitForPaste(useBplib, () => {
      expect(entity.firstValue).toMatchTable({ name: "iron-chest", quality: "legendary" })
      expect(ctx.worldQueries.getWorldEntity(entity, 1)).toMatchTable({
        name: "iron-chest",
        quality: { name: "legendary" },
      })
    })
  })

  test("can upgrade entity to different quality in higher stage with super-force build", () => {
    const entity = ctx.buildEntity(1, {
      name: "iron-chest",
      position: pos,
      direction: direction.east,
    })
    const stack = ctx.player.cursor_stack!
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

    ctx.player.teleport([0, 0], ctx.surfaces[1])
    ctx.player.build_from_cursor({
      position: pos,
      build_mode: defines.build_mode.superforced,
    })

    waitForPaste(useBplib, () => {
      expect(entity.firstValue).toEqual({ name: "iron-chest" })
      expect(entity.stageDiffs).toEqual({
        2: { quality: "legendary" },
      })
      expect(entity.getValueAtStage(2)).toEqual({ name: "iron-chest", quality: "legendary" })
      expect(ctx.worldQueries.getWorldEntity(entity, 2)).toMatchTable({
        name: "iron-chest",
        quality: { name: "legendary" },
      })
    })
  })

  test.skip("can upgrade entity with wires via blueprint", () => {
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
    const entity = ctx.buildEntity(1, { name: "inserter", position: pos, direction: direction.west })
    const stack = ctx.player.cursor_stack!
    stack.set_stack("blueprint")
    stack.blueprint_snap_to_grid = [1, 1]
    stack.blueprint_absolute_snapping = true
    stack.set_blueprint_entities([entity1, entity2])

    ctx.player.teleport([0, 0], ctx.surfaces[0])
    ctx.player.build_from_cursor({ position: pos, build_mode: defines.build_mode.superforced })

    waitForPaste(useBplib, () => {
      const expected = "fast-inserter"
      expect(entity.firstValue).toMatchTable({ name: expected })
      expect(ctx.worldQueries.getWorldEntity(entity, 1)).toMatchTable({ name: expected })
      expect(entity.wireConnections).not.toBeNil()
    })
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
        const stack = ctx.player.cursor_stack!
        stack.set_stack("blueprint")
        stack.blueprint_snap_to_grid = [2, 2]
        stack.blueprint_absolute_snapping = true
        stack.set_blueprint_entities([entity])

        const pos = Pos(5, 5)
        ctx.player.teleport([0, 0], ctx.surfaces[0])
        ctx.player.build_from_cursor({ position: pos, direction, build_mode: defines.build_mode.normal })

        waitForPaste(useBplib, () => {
          const rail = ctx.surfaces[0].find_entities_filtered({
            name: "straight-rail",
            area: BBox.around(pos, 4),
            limit: 1,
          })[0]
          expect(rail).not.toBeNil()
          const expected = (diag + direction) % 8
          expect(rail.direction).toEqual(expected)

          const projectEntity = ctx.project.content.findCompatibleWithLuaEntity(rail, nil, 1)

          expect(projectEntity).not.toBeNil()
          expect(ctx.worldQueries.getWorldEntity(projectEntity!, 1)).toEqual(rail)

          expect(projectEntity!.direction).toEqual(expected)
        })
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
    const stack = ctx.player.cursor_stack!
    stack.set_stack("blueprint")
    stack.set_blueprint_entities([entity])

    const pos = Pos(4, 4)
    ctx.player.teleport([0, 0], ctx.surfaces[0])

    ctx.player.build_from_cursor({
      position: pos,
      direction: defines.direction.north,
      build_mode: defines.build_mode.forced,
    })
    waitForPaste(useBplib, () => {
      const rail = ctx.surfaces[0].find_entities_filtered({
        name: "straight-rail",
        position: pos,
        radius: 0,
        direction: defines.direction.northeast,
      })[0]
      expect(rail).not.toBeNil()

      ctx.player.build_from_cursor({
        position: pos,
        direction: defines.direction.east,
        build_mode: defines.build_mode.forced,
      })
      waitForPaste(useBplib, () => {
        const rail2 = ctx.surfaces[0].find_entities_filtered({
          name: "straight-rail",
          position: pos,
          radius: 0,
          direction: defines.direction.southeast,
        })[0]
        expect(rail2).not.toBeNil()

        const entity1 = ctx.project.content.findCompatibleWithLuaEntity(rail, nil, 1)
        const entity2 = ctx.project.content.findCompatibleWithLuaEntity(rail2, nil, 1)
        expect(entity1).not.toBeNil()
        expect(entity2).not.toBeNil()

        expect(entity1!.direction).toEqual(defines.direction.northeast)
        expect(entity2!.direction).toEqual(defines.direction.southeast)

        expect(ctx.worldQueries.getWorldEntity(entity1!, 1)).toEqual(rail)
        expect(ctx.worldQueries.getWorldEntity(entity2!, 1)).toEqual(rail2)
      })
    })
  })

  describe.each([
    "straight-rail",
    "half-diagonal-rail",
    "curved-rail-a",
    "curved-rail-b",
    "storage-tank",
    "assembling-machine-2",
    "small-electric-pole",
    "boiler",
    "underground-belt",
  ])("can paste %s", (entityName) => {
    test.each<[defines.direction, defines.direction, defines.build_mode, string]>([
      [defines.direction.north, defines.direction.north, defines.build_mode.forced, "not rotated"],
      [defines.direction.east, defines.direction.north, defines.build_mode.forced, "entity rotated"],
      [defines.direction.north, defines.direction.east, defines.build_mode.forced, "pasted rotated"],
      [defines.direction.east, defines.direction.east, defines.build_mode.forced, "entity and paste rotated"],
      [defines.direction.east, defines.direction.east, defines.build_mode.superforced, "superforced mode"],
    ])("%s", (entityDirection, pasteDirection, buildMode) => {
      const bboxSize = BBox.size(prototypes.entity[entityName].collision_box)
      const pos = Pos(bboxSize.x % 2 == 0 ? 0 : 0.5, bboxSize.y % 2 == 0 ? 0 : 0.5)
      const entity: BlueprintEntity = {
        entity_number: 1,
        name: entityName,
        position: pos,
        direction: entityDirection,
      }
      const stack = ctx.player.cursor_stack!
      stack.set_stack("blueprint")
      stack.set_blueprint_entities([entity])
      ctx.player.teleport([0, 0], ctx.surfaces[0])
      ctx.player.build_from_cursor({
        position: Pos(0, 0),
        direction: pasteDirection,
        build_mode: buildMode,
      })
      const luaEntity = ctx.surfaces[0].find_entities_filtered({
        name: entityName,
        position: pos,
        radius: 2,
        limit: 1,
      })[0]
      expect(luaEntity).not.toBeNil()
      waitForPaste(useBplib, () => {
        const projEntity = ctx.project.content.findCompatibleWithLuaEntity(luaEntity, nil, 1)!
        expect(projEntity).not.toBeNil()
        expect(projEntity.position).toEqual(luaEntity.position)
        expect(projEntity.direction).toEqual(luaEntity.direction)
        expect(ctx.worldQueries.getWorldEntity(projEntity, 1)).toEqual(luaEntity)

        ctx.assertEntityCorrect(projEntity, false)
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
    const stack = ctx.player.cursor_stack!
    stack.set_stack("blueprint")
    stack.set_blueprint_entities([entity])

    const pos = Pos(5, 5)

    ctx.player.teleport([0, 0], ctx.surfaces[0])
    ctx.player.build_from_cursor({ position: pos, direction: 4, build_mode: defines.build_mode.forced })
    waitForPaste(useBplib, () => {
      const tank = ctx.surfaces[0].find_entity("storage-tank", pos)!
      expect(tank).not.toBeNil()

      expect(tank.direction).toBe(0)

      const entity1 = ctx.project.content.findCompatibleWithLuaEntity(tank, nil, 1)!
      expect(entity1).not.toBeNil()
      expect(entity1.direction).toEqual(0)
      expect(ctx.worldQueries.getWorldEntity(entity1, 1)).toEqual(tank)

      ctx.assertEntityCorrect(entity1, false)
    })
  })

  test("can paste a power pole at a lower stage to move", () => {
    const pole = ctx.buildEntity(3, { name: "medium-electric-pole", position: Pos(0.5, 0.5) })

    const entity: BlueprintEntity = {
      entity_number: 1,
      name: "medium-electric-pole",
      position: Pos(0.5, 0.5),
    }

    const stack = ctx.player.cursor_stack!
    stack.set_stack("blueprint")
    stack.set_blueprint_entities([entity])

    ctx.player.teleport([0, 0], ctx.surfaces[2 - 1])
    ctx.player.build_from_cursor({ position: Pos(0.5, 0.5), direction: 0, build_mode: defines.build_mode.forced })

    waitForPaste(useBplib, () => {
      const pole2 = ctx.surfaces[2 - 1].find_entity("medium-electric-pole", Pos(0.5, 0.5))!
      expect(pole2).not.toBeNil()

      expect(pole.firstStage).toBe(2)
      expect(ctx.worldQueries.getWorldEntity(pole, 2)).toEqual(pole2)

      ctx.assertEntityCorrect(pole, false)
    })
  })
})

test("mirroring an entity", () => {
  const chemPlant = ctx.buildEntity(1, {
    name: "chemical-plant",
    recipe: "light-oil-cracking",
  })
  const luaEntity = ctx.worldQueries.getWorldEntity(chemPlant, 1)
  assert(luaEntity)
  luaEntity.mirroring = true
  Events.raiseFakeEventNamed("on_player_flipped_entity", {
    entity: luaEntity,
    player_index: ctx.player.index,
    horizontal: true,
  })

  const luaEntity2 = ctx.worldQueries.getWorldEntity(chemPlant, 2)
  expect(luaEntity2?.mirroring).toBe(true)
})

describe.each([false, true])("mirroring an entity, via blueprint paste (using bplib %s)", (useBplib) => {
  before_each(() => {
    ctx.player.mod_settings[Settings.UseBplibForBlueprintPaste] = { value: useBplib }
  })

  after_each(() => {
    ctx.player.mod_settings[Settings.UseBplibForBlueprintPaste] = { value: false }
  })

  test("mirroring an entity, via blueprint paste", () => {
    const chemPlant = ctx.buildEntity(1, {
      name: "chemical-plant",
      recipe: "light-oil-cracking",
    })
    const worldEntity = ctx.worldQueries.getWorldEntity(chemPlant, 1)!
    worldEntity.mirroring = true
    Events.raiseFakeEventNamed("on_player_flipped_entity", {
      entity: worldEntity,
      player_index: ctx.player.index,
      horizontal: true,
    })

    const stack = ctx.player.cursor_stack!
    stack.clear()
    stack.set_stack("blueprint")

    stack.set_blueprint_entities([
      {
        entity_number: 1,
        position: [0, 0],
        name: "chemical-plant",
        recipe: "heavy-oil-cracking",
      },
    ])

    ctx.player.teleport([0, 0], ctx.surfaces[0])

    ctx.player.build_from_cursor({ position: chemPlant.position, mirror: false })
    waitForPaste(useBplib, () => {
      expect(ctx.worldQueries.getWorldEntity(chemPlant, 1)?.mirroring).toBe(false)
      expect(ctx.worldQueries.getWorldEntity(chemPlant, 2)?.mirroring).toBe(false)
    })
  })
})

describe.each([false, true])("paste a rotated assembler (using bplib %s)", (useBplib) => {
  before_each(() => {
    ctx.player.mod_settings[Settings.UseBplibForBlueprintPaste] = { value: useBplib }
  })

  after_each(() => {
    ctx.player.mod_settings[Settings.UseBplibForBlueprintPaste] = { value: false }
  })

  test("paste a rotated assembler", () => {
    ctx.player.cursor_stack!.set_stack("blueprint")
    ctx.player.cursor_stack!.set_blueprint_entities([
      {
        entity_number: 1,
        position: [0, 0],
        name: "assembling-machine-2",
        recipe: "concrete",
        direction: defines.direction.east,
      },
    ])

    ctx.player.teleport([0, 0], ctx.surfaces[0])
    ctx.player.build_from_cursor({ position: [0.5, 0.5] })

    waitForPaste(useBplib, () => {
      const asm2s = ctx.surfaces[1].find_entities_filtered({
        name: "assembling-machine-2",
        position: [0.5, 0.5],
      })
      expect(asm2s.length).toBe(1)
      const asm2 = asm2s[0]

      const projectAsm2 = ctx.project.content.findCompatibleWithLuaEntity(asm2, nil, 2)
      expect(projectAsm2).not.toBeNil()
      expect(projectAsm2?.direction).toBe(defines.direction.east)

      expect(asm2.direction).toBe(defines.direction.east)
    })
  })
})
