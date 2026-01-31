// Copyright (c) 2022-2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { BlueprintEntity, LuaEntity, PlayerIndex, UndergroundBeltBlueprintEntity } from "factorio:runtime"
import expect from "tstl-expect"
import { Prototypes, Settings } from "../../constants"
import { UndergroundBeltEntity } from "../../entity/Entity"
import { ProjectEntity, UndergroundBeltProjectEntity } from "../../entity/ProjectEntity"
import { checkUndergroundPairFlippable } from "../../entity/save-load"
import { findUndergroundPair } from "../../entity/underground-belt"
import { assert, Events } from "../../lib"
import { BBox, Pos } from "../../lib/geometry"
import { setupEntityIntegrationTest, waitForPaste } from "./integration-test-util"

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

    expect(ctx.worldQueries.getWorldEntity(westUnderground, 4)!.neighbours).toEqual(
      ctx.worldQueries.getWorldEntity(placedUnderground, 4)!,
    )
  })
  describe.each<[boolean, string]>([
    [false, "entity markers"],
    [true, "bplib"],
  ])("pasting underground (using %s)", (useBplib) => {
    before_each(() => {
      ctx.player.mod_settings[Settings.UseBplibForBlueprintPaste] = { value: useBplib }
    })

    after_each(() => {
      ctx.player.mod_settings[Settings.UseBplibForBlueprintPaste] = { value: false }
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

      waitForPaste(useBplib, () => {
        const ghost = ctx.surfaces[3 - 1].find_entity("entity-ghost", pos)
        expect(ghost).toBeNil()

        const builtEntity = ctx.surfaces[3 - 1].find_entity("underground-belt", pos)!
        expect(builtEntity).toBeAny()
        expect(builtEntity.direction).toBe(expectedDirection)
        expect(builtEntity.belt_to_ground_type).toBe(eastType)

        const entity = ctx.project.content.findCompatibleWithLuaEntity(
          builtEntity,
          nil,
          3,
        ) as UndergroundBeltProjectEntity
        expect(entity).toBeAny()
        expect(entity.isUndergroundBelt()).toBe(true)
        expect(entity.direction).toBe(expectedDirection)
        expect(entity.firstValue.type).toBe(eastType)
      })
    })
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
      const leftStage1 = ctx.worldQueries.getWorldEntity(leftUnderground, 1)
      assert(leftStage1)
      expect(leftStage1.neighbours).not.toBeNil().and.toEqual(ctx.worldQueries.getWorldEntity(rightUnderground, 1))
      expect(ctx.worldQueries.getWorldEntity(leftUnderground, 2)?.neighbours)
        .not.toBeNil()
        .and.toEqual(ctx.worldQueries.getWorldEntity(middleUnderground, 2))

      const leftStage2 = ctx.worldQueries.getWorldEntity(leftUnderground, 2)
      assert(leftStage2)
      const middleStage2 = ctx.worldQueries.getWorldEntity(middleUnderground, 2)
      assert(middleStage2)

      expect(leftStage2.neighbours).toEqual(middleStage2)
      expect(checkUndergroundPairFlippable(middleStage2)).toMatchTable([middleUnderground, false])

      expect(findUndergroundPair(ctx.project.content, leftUnderground, 1)).toBe(rightUnderground)
    })
    test("When flipping an left paired with multiple undergrounds, error is shown in stage where left flip failed", () => {
      const leftStage1 = ctx.worldQueries.getWorldEntity(leftUnderground, 1)!
      const rightStage1 = ctx.worldQueries.getWorldEntity(rightUnderground, 1)!
      const leftStage2 = ctx.worldQueries.getWorldEntity(leftUnderground, 2)!

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

      expect(leftStage1).toMatchTable({
        direction: defines.direction.west,
        belt_to_ground_type: "output",
      })
      expect(rightStage1).toMatchTable({
        direction: defines.direction.west,
        belt_to_ground_type: "input",
      })
      expect(leftStage2).toMatchTable({
        direction: defines.direction.east,
        belt_to_ground_type: "input",
      })
      expect(ctx.worldQueries.hasErrorAt(leftUnderground, 2)).toBe(true)

      ctx.assertEntityCorrect(leftUnderground, 2)
      ctx.assertEntityCorrect(rightUnderground, false)
      ctx.assertEntityCorrect(middleUnderground, false)
    })
    test("when flipping middle, middle succeeds, but error is shown in left where the flip failed", () => {
      const middle = ctx.worldQueries.getWorldEntity(middleUnderground, 2)!
      const leftStage1 = ctx.worldQueries.getWorldEntity(leftUnderground, 1)!
      const leftStage2 = ctx.worldQueries.getWorldEntity(leftUnderground, 2)!

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

      expect(leftStage1).toMatchTable({
        direction: defines.direction.east,
        belt_to_ground_type: "input",
      })
      expect(ctx.worldQueries.hasErrorAt(leftUnderground, 1)).toBe(true)

      expect(leftStage2).toMatchTable({
        direction: defines.direction.west,
        belt_to_ground_type: "output",
      })

      ctx.assertEntityCorrect(leftUnderground, 1)
      ctx.assertEntityCorrect(rightUnderground, false)
      ctx.assertEntityCorrect(middleUnderground, false)
    })
    test("when flipping an underground to correct error, also flips its pair", () => {
      const leftStage1 = ctx.worldQueries.getWorldEntity(leftUnderground, 1)!
      leftStage1.rotate({ by_player: ctx.player })

      const leftStage2 = ctx.worldQueries.getWorldEntity(leftUnderground, 2)!
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

      const middle = ctx.worldQueries.getWorldEntity(middleUnderground, 2)!

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

      ctx.assertEntityCorrect(leftUnderground, false)
      ctx.assertEntityCorrect(rightUnderground, false)
      ctx.assertEntityCorrect(middleUnderground, false)
    })
    test("when deleting an underground causing old pair to flip, project.updates highlights on old pair", () => {
      middleUnderground.setFirstStageUnchecked(1)
      ctx.worldOps.updateWorldEntities(middleUnderground, 1)

      ctx.worldQueries.getWorldEntity(middleUnderground, 1)!.rotate({ by_player: ctx.player })
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

      ctx.player.mine_entity(ctx.worldQueries.getWorldEntity(middleUnderground, 1)!, true)

      expect(ctx.project.content.hasEntity(middleUnderground)).toBe(false)

      expect(ctx.worldQueries.hasErrorAt(leftUnderground, 1)).toBe(true)

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
        ctx.project.worldPresentation.destroyAllWorldOrPreviewEntities(middle)
      }
      rightUnderground = ctx.buildEntity<UndergroundBeltBlueprintEntity>(1, {
        name: "underground-belt",
        type: "output",
        direction: defines.direction.east,
        position: pos.add(2, 0),
      }) as ProjectEntity<UndergroundBeltEntity>
      leftWorldEntity = ctx.worldQueries.getWorldEntity(leftUnderground, 1)!
      expect(leftWorldEntity).toMatchTable({
        belt_to_ground_type: "input",
        direction: defines.direction.east,
        neighbours: ctx.worldQueries.getWorldEntity(rightUnderground, 1)!,
      })
      rightUnderground.setTypeProperty("input")
      rightUnderground.direction = defines.direction.west

      expect(ctx.worldQueries.hasErrorAt(rightUnderground, 1)).toBe(true)
      expect(ctx.worldQueries.hasErrorAt(rightUnderground, 2)).toBe(true)
      ctx.worldOps.updateAllHighlights(rightUnderground)
      ctx.assertEntityCorrect(rightUnderground, 1)
    })
    test("flipping an underground with a pair with error project.updates highlight on pair", () => {
      leftWorldEntity.rotate({ by_player: ctx.player })
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
      const leftWorldEntity2 = ctx.worldQueries.getWorldEntity(leftUnderground, 2)!
      leftWorldEntity2.rotate({ by_player: ctx.player })
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
      expect(ctx.worldQueries.getWorldEntity(leftUnderground, 2)).toMatchTable({
        belt_to_ground_type: "input",
        direction: defines.direction.east,
      })
      expect(ctx.worldQueries.getWorldEntity(rightUnderground, 2)).toMatchTable({
        belt_to_ground_type: "output",
        direction: defines.direction.east,
      })
      expect(ctx.worldQueries.hasErrorAt(rightUnderground, 1)).toBe(true)
      expect(ctx.worldQueries.hasErrorAt(rightUnderground, 2)).toBe(true)

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
    assert(ctx.worldQueries.getWorldEntity(underground, 1)!.rotate())
    ctx.worldOps.refreshEntity(underground, 1)
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
    assert(ctx.worldQueries.getWorldEntity(underground, 1)!.rotate())
    Events.raiseFakeEventNamed("on_player_selected_area", {
      player_index: 1 as PlayerIndex,
      item: Prototypes.CleanupTool,
      surface: ctx.surfaces[0],
      area: BBox.around(pos, 10),
      entities: [ctx.worldQueries.getWorldEntity(underground, 1)!],
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
    assert(ctx.worldQueries.getWorldEntity(left, 1)!.rotate())
    expect(ctx.worldQueries.hasErrorAt(right, 1)).toBe(true)

    Events.raiseFakeEventNamed("on_player_selected_area", {
      player_index: 1 as PlayerIndex,
      item: Prototypes.CleanupTool,
      surface: ctx.surfaces[0],
      area: BBox.around(pos, 10),
      entities: [ctx.worldQueries.getWorldEntity(left, 1)!],
      tiles: [],
    })

    ctx.assertEntityCorrect(left, false)
    ctx.assertEntityCorrect(right, false)
  })

  describe.each<[boolean, string]>([
    [false, "entity markers"],
    [true, "bplib"],
  ])("pasting an underground (using %s)", (useBplib) => {
    before_each(() => {
      ctx.player.mod_settings[Settings.UseBplibForBlueprintPaste] = { value: useBplib }
    })

    after_each(() => {
      ctx.player.mod_settings[Settings.UseBplibForBlueprintPaste] = { value: false }
    })

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

      waitForPaste(useBplib, () => {
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
        ctx.project.worldPresentation.destroyAllWorldOrPreviewEntities(entity)
      }
      ctx.player.build_from_cursor({
        position: pos.add(2, 0),
      })

      waitForPaste(useBplib, () => {
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
  })

  describe.each<[boolean, string]>([
    [false, "entity markers"],
    [true, "bplib"],
  ])("upgrading underground via blueprint paste (using %s)", (useBplib) => {
    before_each(() => {
      ctx.player.mod_settings[Settings.UseBplibForBlueprintPaste] = { value: useBplib }
    })

    after_each(() => {
      ctx.player.mod_settings[Settings.UseBplibForBlueprintPaste] = { value: false }
    })

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
      waitForPaste(useBplib, () => {
        expect(underground).toMatchTable({
          firstValue: { name: "fast-underground-belt", type: "input" },
          direction: defines.direction.east,
        })
        expect(ctx.worldQueries.getWorldEntity(underground, 1)).toMatchTable({
          name: "fast-underground-belt",
          belt_to_ground_type: "input",
          direction: defines.direction.east,
        })
      })
    })
    test("can upgrade underground in flipped direction", () => {
      ctx.worldQueries.getWorldEntity(underground, 1)!.rotate({ by_player: ctx.player })
      ctx.player.build_from_cursor({ position: pos, build_mode: defines.build_mode.superforced })

      waitForPaste(useBplib, () => {
        expect(underground).toMatchTable({
          firstValue: { name: "fast-underground-belt", type: "input" },
          direction: defines.direction.east,
        })
      })
    })
    test("does not upgrade underground belt in wrong direction", () => {
      underground.setTypeProperty("output")
      ctx.worldOps.refreshAllEntities(underground)
      ctx.player.build_from_cursor({ position: pos, build_mode: defines.build_mode.superforced })

      waitForPaste(useBplib, () => {
        expect(underground).toMatchTable({
          firstValue: { name: "underground-belt", type: "output" },
          direction: defines.direction.east,
        })
      })
    })
  })
})
