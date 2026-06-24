// Copyright (c) 2022-2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { BlueprintEntity, LuaEntity, PlayerIndex, UndergroundBeltBlueprintEntity } from "factorio:runtime"
import expect from "tstl-expect"
import { Prototypes } from "../../constants"
import { UndergroundBeltEntity } from "../../entity/Entity"
import { ProjectEntity, UndergroundBeltProjectEntity } from "../../entity/ProjectEntity"
import { checkUndergroundPairFlippable } from "../../entity/save-load"
import { findUndergroundPair } from "../../entity/underground-belt"
import { assert, Events } from "../../lib"
import { BBox, Pos } from "../../lib/geometry"
import { setupEntityIntegrationTest } from "./integration-test-util"

const ctx = setupEntityIntegrationTest()
const pos = Pos(10.5, 10.5)

describe.each([true, false])("underground snapping, with flipped %s", (flipped) => {
  const expectedDirection = !flipped ? defines.direction.east : defines.direction.west
  const westType = !flipped ? "input" : "output"
  const eastType = !flipped ? "output" : "input"
  let westUnderground: ProjectEntity<UndergroundBeltBlueprintEntity>
  before_each(() => {
    westUnderground = ctx.buildEntity(4, {
      name: "underground-belt",
      direction: expectedDirection,
      type: westType,
      position: pos.minus(Pos(1, 0)),
    })
    ctx.assertEntityCorrect(westUnderground, false)
  })

  test("placing underground", () => {
    const placedUnderground = ctx.buildEntity<UndergroundBeltBlueprintEntity>(3, {
      name: "underground-belt",
      direction: defines.direction.west,
      type: "input",
    })
    expect(placedUnderground.direction).toBe(expectedDirection)
    expect(placedUnderground.firstValue.type).toBe(eastType)
    ctx.assertEntityCorrect(placedUnderground, false)
    expect(westUnderground.direction).toBe(expectedDirection)
    expect(westUnderground.firstValue.type).toBe(westType)

    expect(ctx.wp.getWorldEntity(westUnderground, 4)!.underground_belt_neighbour).toEqual(
      ctx.wp.getWorldEntity(placedUnderground, 4)!,
    )
  })
  test("pasting underground", () => {
    const stack = ctx.player.cursor_stack!
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
    ctx.player.teleport(pos, ctx.surfaces[3 - 1])

    ctx.player.build_from_cursor({
      position: pos,
      build_mode: defines.build_mode.forced,
    })

    const ghost = ctx.surfaces[3 - 1].find_entity("entity-ghost", pos)
    expect(ghost).toBeNil()

    const builtEntity = ctx.surfaces[3 - 1].find_entity("underground-belt", pos)!
    expect(builtEntity).toBeAny()
    expect(builtEntity.direction).toBe(expectedDirection)
    expect(builtEntity.belt_to_ground_type).toBe(eastType)

    const entity = ctx.project.content.findCompatibleWithLuaEntity(builtEntity, nil, 3) as UndergroundBeltProjectEntity
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
      leftUnderground = ctx.buildEntity(1, {
        name: "underground-belt",
        type: "input",
        direction: defines.direction.east,
        position: pos.add(-1, 0),
      }) as ProjectEntity<UndergroundBeltEntity>
      rightUnderground = ctx.buildEntity(1, {
        name: "underground-belt",
        type: "output",
        direction: defines.direction.east,
        position: pos.add(1, 0),
      })
      middleUnderground = ctx.buildEntity(2, {
        name: "underground-belt",
        type: "output",
        direction: defines.direction.east,
        position: pos,
      })
      const leftStage1 = ctx.wp.getWorldEntity(leftUnderground, 1)
      assert(leftStage1)
      expect(leftStage1.underground_belt_neighbour)
        .not.toBeNil()
        .and.toEqual(ctx.wp.getWorldEntity(rightUnderground, 1))
      expect(ctx.wp.getWorldEntity(leftUnderground, 2)?.underground_belt_neighbour)
        .not.toBeNil()
        .and.toEqual(ctx.wp.getWorldEntity(middleUnderground, 2))

      const leftStage2 = ctx.wp.getWorldEntity(leftUnderground, 2)
      assert(leftStage2)
      const middleStage2 = ctx.wp.getWorldEntity(middleUnderground, 2)
      assert(middleStage2)

      expect(leftStage2.underground_belt_neighbour).toEqual(middleStage2)
      expect(checkUndergroundPairFlippable(middleStage2)).toMatchTable([middleUnderground, false])

      expect(findUndergroundPair(ctx.project.content, leftUnderground, 1)).toBe(rightUnderground)
    })
    test("When flipping an left paired with multiple undergrounds, error is shown in stage where left flip failed", () => {
      const leftStage1 = ctx.wp.getWorldEntity(leftUnderground, 1)!
      leftStage1.rotate({ by_player: ctx.player })

      expect(leftUnderground).toMatchTable({
        firstValue: { type: "output" },
        direction: defines.direction.west,
      })
      expect(rightUnderground).toMatchTable({
        firstValue: { type: "input" },
        direction: defines.direction.west,
      })
      expect(middleUnderground).toMatchTable({
        firstValue: { type: "output" },
        direction: defines.direction.east,
      })

      expect(ctx.wp.getWorldEntity(leftUnderground, 1)).toMatchTable({
        direction: defines.direction.west,
        belt_to_ground_type: "output",
      })
      expect(ctx.wp.getWorldEntity(rightUnderground, 1)).toMatchTable({
        direction: defines.direction.west,
        belt_to_ground_type: "input",
      })
      expect(ctx.wp.getWorldEntity(leftUnderground, 2)).toMatchTable({
        direction: defines.direction.east,
        belt_to_ground_type: "input",
      })
      expect(ctx.wp.hasErrorAt(leftUnderground, 2)).toBe(true)

      ctx.assertEntityCorrect(leftUnderground, 2)
      ctx.assertEntityCorrect(rightUnderground, false)
      ctx.assertEntityCorrect(middleUnderground, false)
    })
    test("when flipping middle, middle succeeds, but error is shown in left where the flip failed", () => {
      const middle = ctx.wp.getWorldEntity(middleUnderground, 2)!
      middle.rotate({ by_player: ctx.player })

      expect(leftUnderground).toMatchTable({
        firstValue: { type: "output" },
        direction: defines.direction.west,
      })
      expect(middleUnderground).toMatchTable({
        firstValue: { type: "input" },
        direction: defines.direction.west,
      })
      expect(rightUnderground).toMatchTable({
        firstValue: { type: "output" },
        direction: defines.direction.east,
      })

      expect(ctx.wp.getWorldEntity(leftUnderground, 1)).toMatchTable({
        direction: defines.direction.east,
        belt_to_ground_type: "input",
      })
      expect(ctx.wp.hasErrorAt(leftUnderground, 1)).toBe(true)

      expect(ctx.wp.getWorldEntity(leftUnderground, 2)).toMatchTable({
        direction: defines.direction.west,
        belt_to_ground_type: "output",
      })

      ctx.assertEntityCorrect(leftUnderground, 1)
      ctx.assertEntityCorrect(rightUnderground, false)
      ctx.assertEntityCorrect(middleUnderground, false)
    })
    test("when flipping an underground to correct error, also flips its pair", () => {
      const leftStage1 = ctx.wp.getWorldEntity(leftUnderground, 1)!
      leftStage1.rotate({ by_player: ctx.player })

      const leftStage2 = ctx.wp.getWorldEntity(leftUnderground, 2)!
      expect(leftStage2).toMatchTable({
        direction: defines.direction.east,
        belt_to_ground_type: "input",
      })
      leftStage2.rotate({ by_player: ctx.player })

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

      expect(ctx.wp.getWorldEntity(leftUnderground, 1)).toMatchTable({
        direction: defines.direction.west,
        belt_to_ground_type: "output",
      })
      expect(ctx.wp.getWorldEntity(leftUnderground, 2)).toMatchTable({
        direction: defines.direction.west,
        belt_to_ground_type: "output",
      })
      expect(ctx.wp.getWorldEntity(middleUnderground, 2)).toMatchTable({
        direction: defines.direction.west,
        belt_to_ground_type: "input",
      })

      ctx.assertEntityCorrect(leftUnderground, false)
      ctx.assertEntityCorrect(rightUnderground, false)
      ctx.assertEntityCorrect(middleUnderground, false)
    })
    test("when deleting an underground causing old pair to flip, project.updates highlights on old pair", () => {
      middleUnderground._asMut().setFirstStage(1)
      ctx.wp.updateWorldEntities(middleUnderground, 1)

      ctx.wp.getWorldEntity(middleUnderground, 1)!.rotate({ by_player: ctx.player })
      expect(middleUnderground).toMatchTable({
        firstValue: { type: "input" },
        direction: defines.direction.west,
      })
      expect(leftUnderground).toMatchTable({
        firstValue: { type: "output" },
        direction: defines.direction.west,
      })
      ctx.assertEntityCorrect(middleUnderground, false)
      ctx.assertEntityCorrect(leftUnderground, false)

      ctx.player.mine_entity(ctx.wp.getWorldEntity(middleUnderground, 1)!, true)

      expect(ctx.project.content.hasEntity(middleUnderground)).toBe(false)

      expect(ctx.wp.hasErrorAt(leftUnderground, 1)).toBe(true)

      ctx.assertEntityCorrect(leftUnderground, 1)
      ctx.assertEntityCorrect(rightUnderground, false)
    })
  })
  describe.each([false, true])("left, middle %s, broken right", (hasMiddle) => {
    let leftUnderground: ProjectEntity<BlueprintEntity>
    let rightUnderground: ProjectEntity<UndergroundBeltEntity>
    let leftWorldEntity: LuaEntity
    before_each(() => {
      leftUnderground = ctx.buildEntity(1, {
        name: "underground-belt",
        type: "input",
        direction: defines.direction.east,
      })

      if (hasMiddle) {
        const middle = ctx.buildEntity(1, {
          name: "underground-belt",
          type: "output",
          direction: defines.direction.east,
          position: pos.add(1, 0),
        })
        ctx.wp.entityStorage.deleteAllOfType(middle, "worldOrPreviewEntity")
      }
      rightUnderground = ctx.buildEntity<UndergroundBeltBlueprintEntity>(1, {
        name: "underground-belt",
        type: "output",
        direction: defines.direction.east,
        position: pos.add(2, 0),
      }) as ProjectEntity<UndergroundBeltEntity>
      leftWorldEntity = ctx.wp.getWorldEntity(leftUnderground, 1)!
      expect(leftWorldEntity).toMatchTable({
        belt_to_ground_type: "input",
        direction: defines.direction.east,
        underground_belt_neighbour: ctx.wp.getWorldEntity(rightUnderground, 1)!,
      })
      const mut = rightUnderground._asMut()
      mut.setTypeProperty("input")
      mut.direction = defines.direction.west

      expect(ctx.wp.hasErrorAt(rightUnderground, 1)).toBe(true)
      expect(ctx.wp.hasErrorAt(rightUnderground, 2)).toBe(true)
      ctx.wp.updateAllHighlights(rightUnderground)
      ctx.assertEntityCorrect(rightUnderground, 1)
    })
    test("flipping an underground with a pair with error project.updates highlight on pair", () => {
      ctx.wp.getWorldEntity(leftUnderground, 1)!.rotate({ by_player: ctx.player })
      expect(leftUnderground).toMatchTable({
        firstValue: { type: "output" },
        direction: defines.direction.west,
      })
      expect(rightUnderground).toMatchTable({
        firstValue: { type: "input" },
        direction: defines.direction.west,
      })

      ctx.assertEntityCorrect(leftUnderground, false)
      ctx.assertEntityCorrect(rightUnderground, false)
    })
    test("flipping pair with broken underground at higher stage still disallows rotation", () => {
      const leftWorldEntity2 = ctx.wp.getWorldEntity(leftUnderground, 2)!
      leftWorldEntity2.rotate({ by_player: ctx.player })
      expect(leftUnderground).toMatchTable({
        firstValue: { type: "input" },
        direction: defines.direction.east,
      })
      expect(rightUnderground).toMatchTable({
        firstValue: { type: "input" },
        direction: defines.direction.west,
      })
      expect(ctx.wp.getWorldEntity(leftUnderground, 1)).toMatchTable({
        belt_to_ground_type: "input",
        direction: defines.direction.east,
      })
      expect(ctx.wp.getWorldEntity(leftUnderground, 2)).toMatchTable({
        belt_to_ground_type: "input",
        direction: defines.direction.east,
      })
      expect(ctx.wp.getWorldEntity(rightUnderground, 2)).toMatchTable({
        belt_to_ground_type: "output",
        direction: defines.direction.east,
      })
      expect(ctx.wp.hasErrorAt(rightUnderground, 1)).toBe(true)
      expect(ctx.wp.hasErrorAt(rightUnderground, 2)).toBe(true)

      ctx.assertEntityCorrect(leftUnderground, false)
      ctx.assertEntityCorrect(rightUnderground, 1)
    })
  })
  test("calling refresh entity on an broken underground fixes it", () => {
    const underground = ctx.buildEntity(1, {
      name: "underground-belt",
      type: "input",
      direction: defines.direction.east,
    })
    assert(ctx.wp.getWorldEntity(underground, 1)!.rotate())
    ctx.wp.refreshEntity(underground, 1)
    expect(underground).toMatchTable({
      firstValue: { type: "input" },
      direction: defines.direction.east,
    })
    ctx.assertEntityCorrect(underground, false)
  })
  test("using cleanup tool on an broken underground fixes it", () => {
    const underground = ctx.buildEntity(1, {
      name: "underground-belt",
      type: "input",
      direction: defines.direction.east,
    })
    assert(ctx.wp.getWorldEntity(underground, 1)!.rotate())
    Events.raiseFakeEventNamed("on_player_selected_area", {
      player_index: 1 as PlayerIndex,
      item: Prototypes.CleanupTool,
      surface: ctx.surfaces[0],
      area: BBox.around(pos, 10),
      entities: [ctx.wp.getWorldEntity(underground, 1)!],
      tiles: [],
    })
    expect(underground).toMatchTable({
      firstValue: { type: "input" },
      direction: defines.direction.east,
    })
    ctx.assertEntityCorrect(underground, false)
  })
  test("using cleanup tool on broken pair fixes it", () => {
    const left = ctx.buildEntity(1, {
      name: "underground-belt",
      type: "input",
      direction: defines.direction.east,
    })
    const right = ctx.buildEntity(1, {
      name: "underground-belt",
      type: "output",
      direction: defines.direction.east,
      position: pos.add(1, 0),
    })
    assert(ctx.wp.getWorldEntity(left, 1)!.rotate())
    expect(ctx.wp.hasErrorAt(right, 1)).toBe(true)

    Events.raiseFakeEventNamed("on_player_selected_area", {
      player_index: 1 as PlayerIndex,
      item: Prototypes.CleanupTool,
      surface: ctx.surfaces[0],
      area: BBox.around(pos, 10),
      entities: [ctx.wp.getWorldEntity(left, 1)!],
      tiles: [],
    })

    ctx.assertEntityCorrect(left, false)
    ctx.assertEntityCorrect(right, false)
  })

  describe("pasting an underground", () => {
    before_each(() => {
      const stack = ctx.player.cursor_stack!
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
      ctx.player.teleport(pos, ctx.surfaces[0])
    })
    test("pasting an underground belt works", () => {
      ctx.player.build_from_cursor({
        position: pos.add(2, 0),
      })

      const builtEntity = ctx.surfaces[0].find_entity("underground-belt", pos.add(2, 0))!
      expect(builtEntity).toBeAny()

      const projEntity = ctx.project.content.findCompatibleWithLuaEntity(
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
      ctx.buildEntity(1, {
        name: "underground-belt",
        type: "input",
        direction: defines.direction.east,
      })
      if (hasMiddle) {
        const entity = ctx.buildEntity(1, {
          name: "underground-belt",
          type: "output",
          direction: defines.direction.east,
          position: pos.add(1, 0),
        })
        ctx.wp.entityStorage.deleteAllOfType(entity, "worldOrPreviewEntity")
      }
      ctx.player.build_from_cursor({
        position: pos.add(2, 0),
      })

      const builtEntity = ctx.surfaces[0].find_entity("underground-belt", pos.add(2, 0))!
      expect(builtEntity).toBeAny()

      const projEntity = ctx.project.content.findCompatibleWithLuaEntity(
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
      underground = ctx.buildEntity(1, {
        name: "underground-belt",
        type: "input",
        direction: defines.direction.east,
      }) as UndergroundBeltProjectEntity
      const stack = ctx.player.cursor_stack!
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
      ctx.player.teleport(pos, ctx.surfaces[0])
    })
    test("can upgrade underground belt via paste", () => {
      ctx.player.build_from_cursor({ position: pos, build_mode: defines.build_mode.superforced })
      expect(underground).toMatchTable({
        firstValue: { name: "fast-underground-belt", type: "input" },
        direction: defines.direction.east,
      })
      expect(ctx.wp.getWorldEntity(underground, 1)).toMatchTable({
        name: "fast-underground-belt",
        belt_to_ground_type: "input",
        direction: defines.direction.east,
      })
    })
    test("can upgrade underground in flipped direction", () => {
      ctx.wp.getWorldEntity(underground, 1)!.rotate({ by_player: ctx.player })
      ctx.player.build_from_cursor({ position: pos, build_mode: defines.build_mode.superforced })

      expect(underground).toMatchTable({
        firstValue: { name: "fast-underground-belt", type: "input" },
        direction: defines.direction.east,
      })
    })
    test("does not upgrade underground belt in wrong direction", () => {
      underground._asMut().setTypeProperty("output")
      ctx.wp.refreshAllEntities(underground)
      ctx.player.build_from_cursor({ position: pos, build_mode: defines.build_mode.superforced })

      expect(underground).toMatchTable({
        firstValue: { name: "underground-belt", type: "output" },
        direction: defines.direction.east,
      })
    })
  })
})

// A real (tracked) underground belt and an entity-ghost underground belt can pair with each other
// in the world. The ghost is not tracked by the mod (excludedTypes). These tests cover what happens
// when either member of such a mixed pair is flipped (rotated).
describe("flipping an underground paired with a ghost", () => {
  const east = defines.direction.east
  const west = defines.direction.west
  // real output(east) at pos, ghost input(east) one tile west -> they pair (tunnel runs east).
  const ghostPos = pos.add(-1, 0)
  let realEntity: UndergroundBeltProjectEntity
  let ghost: LuaEntity
  before_each(() => {
    realEntity = ctx.buildEntity(1, {
      name: "underground-belt",
      type: "output",
      direction: east,
      position: pos,
    }) as UndergroundBeltProjectEntity
    ghost = ctx.surfaces[0].create_entity({
      name: "entity-ghost",
      inner_name: "underground-belt",
      type: "input",
      direction: east,
      position: ghostPos,
      force: "player",
    })!
    expect(ghost).toBeAny()
    expect(ghost.type).toBe("entity-ghost")
    // they pair in the world, both ways
    const realWorld = ctx.wp.getWorldEntity(realEntity, 1)!
    expect(realWorld.underground_belt_neighbour).toEqual(ghost)
    expect(ghost.underground_belt_neighbour).toEqual(realWorld)
  })

  test("flipping the ghost also flips the real pair, and the mod registers it", () => {
    ghost.rotate({ by_player: ctx.player })

    const realWorld = ctx.wp.getWorldEntity(realEntity, 1)!
    // the game flipped the real underground along with the ghost
    expect(realWorld).toMatchTable({
      belt_to_ground_type: "input",
      direction: west,
    })
    // the mod must record the flip on the real underground's project entity
    expect(realEntity).toMatchTable({
      firstValue: { type: "input" },
      direction: west,
    })
    ctx.assertEntityCorrect(realEntity, false)
  })

  test("flipping the real underground leaves the ghost a ghost", () => {
    ctx.wp.getWorldEntity(realEntity, 1)!.rotate({ by_player: ctx.player })

    // the ghost must remain a ghost, not be revived/registered as a project entity
    const stillGhost = ctx.surfaces[0].find_entity("entity-ghost", ghostPos)
    expect(stillGhost).toBeAny()
    expect(ctx.project.content.findCompatibleEntity("underground-belt", ghostPos, nil, 1)).toBeNil()

    ctx.assertEntityCorrect(realEntity, false)
  })
})
