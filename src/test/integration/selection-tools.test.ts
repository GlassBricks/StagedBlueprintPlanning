// SPDX-FileCopyrightText: 2026 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import expect from "tstl-expect"
import { Prototypes } from "../../constants"
import { Events } from "../../lib"
import { Pos } from "../../lib/geometry"
import { getProjectPlayerData } from "../../project/player-project-data"
import { _simulateUndo } from "../../project/actions"
import { applyDiffViaWorld, setupEntityIntegrationTest } from "./integration-test-util"

const pos = Pos(10.5, 10.5)
const pos2 = Pos(12.5, 10.5)

describe("selection-tools", () => {
  const ctx = setupEntityIntegrationTest()

  describe("cleanup tool", () => {
    test("fixes error entity", () => {
      const blocker = ctx.createEntity(4, { name: "stone-wall" })
      const entity = ctx.buildEntity(3)
      ctx.assertEntityCorrect(entity, 4)

      blocker.destroy()
      Events.raiseFakeEventNamed("on_player_selected_area", {
        player_index: ctx.player.index,
        item: Prototypes.CleanupTool,
        entities: [ctx.wp.getWorldOrPreviewEntity(entity, 4)!],
        tiles: [],
        surface: ctx.surfaces[3],
        area: { left_top: pos, right_bottom: pos },
      })
      ctx.assertEntityCorrect(entity, false)
    })

    test("deletes settings remnant", () => {
      const entity = ctx.buildEntity(3)
      applyDiffViaWorld(ctx.wp, entity, 4, (e) => {
        e.inserter_stack_size_override = 2
      })

      const worldEntity = ctx.wp.getWorldEntity(entity, 3)!
      ctx.player.mine_entity(worldEntity, true)
      ctx.assertIsSettingsRemnant(entity)

      Events.raiseFakeEventNamed("on_player_selected_area", {
        player_index: ctx.player.index,
        item: Prototypes.CleanupTool,
        entities: [ctx.wp.getWorldOrPreviewEntity(entity, 3)!],
        tiles: [],
        surface: ctx.surfaces[2],
        area: { left_top: pos, right_bottom: pos },
      })
      ctx.assertEntityNotPresent(entity)
    })
  })

  describe("force delete tool", () => {
    test("deletes multiple entities with group undo", () => {
      const entity1 = ctx.buildEntity(3, { position: pos })
      const entity2 = ctx.buildEntity(3, { position: pos2 })

      Events.raiseFakeEventNamed("on_player_selected_area", {
        player_index: ctx.player.index,
        item: Prototypes.ForceDeleteTool,
        entities: [ctx.wp.getWorldEntity(entity1, 3)!, ctx.wp.getWorldEntity(entity2, 3)!],
        tiles: [],
        surface: ctx.surfaces[2],
        area: { left_top: pos, right_bottom: pos2 },
      })
      ctx.assertEntityNotPresent(entity1)
      ctx.assertEntityNotPresent(entity2)

      _simulateUndo(ctx.player)
      ctx.assertEntityCorrect(entity1, false)
      ctx.assertEntityCorrect(entity2, false)
    })
  })

  describe("stage move tool", () => {
    test("sends entity to target stage", () => {
      const entity = ctx.buildEntity(2)
      getProjectPlayerData(ctx.player.index, ctx.project)!.moveTargetStage = 4

      Events.raiseFakeEventNamed("on_player_selected_area", {
        player_index: ctx.player.index,
        item: Prototypes.StageMoveTool,
        entities: [ctx.wp.getWorldEntity(entity, 2)!],
        tiles: [],
        surface: ctx.surfaces[1],
        area: { left_top: pos, right_bottom: pos },
      })
      expect(entity.firstStage).toBe(4)
      ctx.assertEntityCorrect(entity, false)
    })

    test("normal select only sends if entity first stage matches current stage", () => {
      const entity = ctx.buildEntity(2)
      getProjectPlayerData(ctx.player.index, ctx.project)!.moveTargetStage = 4

      Events.raiseFakeEventNamed("on_player_selected_area", {
        player_index: ctx.player.index,
        item: Prototypes.StageMoveTool,
        entities: [ctx.wp.getWorldEntity(entity, 3)!],
        tiles: [],
        surface: ctx.surfaces[2],
        area: { left_top: pos, right_bottom: pos },
      })
      expect(entity.firstStage).toBe(2)
    })

    test("alt select sends regardless of first stage", () => {
      const entity = ctx.buildEntity(2)
      getProjectPlayerData(ctx.player.index, ctx.project)!.moveTargetStage = 4

      Events.raiseFakeEventNamed("on_player_alt_selected_area", {
        player_index: ctx.player.index,
        item: Prototypes.StageMoveTool,
        entities: [ctx.wp.getWorldEntity(entity, 3)!],
        tiles: [],
        surface: ctx.surfaces[2],
        area: { left_top: pos, right_bottom: pos },
      })
      expect(entity.firstStage).toBe(4)
      ctx.assertEntityCorrect(entity, false)
    })

    test("brings entity to stage via reverse select", () => {
      const entity = ctx.buildEntity(4)

      Events.raiseFakeEventNamed("on_player_reverse_selected_area", {
        player_index: ctx.player.index,
        item: Prototypes.StageMoveTool,
        entities: [ctx.wp.getWorldOrPreviewEntity(entity, 2)!],
        tiles: [],
        surface: ctx.surfaces[1],
        area: { left_top: pos, right_bottom: pos },
      })
      expect(entity.firstStage).toBe(2)
      ctx.assertEntityCorrect(entity, false)
    })

    test("brings entity down to stage via alt-reverse select", () => {
      const entity = ctx.buildEntity(4)

      Events.raiseFakeEventNamed("on_player_alt_reverse_selected_area", {
        player_index: ctx.player.index,
        item: Prototypes.StageMoveTool,
        entities: [ctx.wp.getWorldOrPreviewEntity(entity, 2)!],
        tiles: [],
        surface: ctx.surfaces[1],
        area: { left_top: pos, right_bottom: pos },
      })
      expect(entity.firstStage).toBe(2)
      ctx.assertEntityCorrect(entity, false)
    })
  })

  describe("stage deconstruct tool", () => {
    test("reverse select sets last stage", () => {
      const entity = ctx.buildEntity(1)

      Events.raiseFakeEventNamed("on_player_reverse_selected_area", {
        player_index: ctx.player.index,
        item: Prototypes.StageDeconstructTool,
        entities: [ctx.wp.getWorldEntity(entity, 3)!],
        tiles: [],
        surface: ctx.surfaces[2],
        area: { left_top: pos, right_bottom: pos },
      })
      expect(entity.lastStage).toBe(3)
      ctx.assertEntityCorrect(entity, false)
    })
  })
})
