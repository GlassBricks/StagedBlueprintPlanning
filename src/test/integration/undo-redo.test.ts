// SPDX-FileCopyrightText: 2026 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import expect from "tstl-expect"
import { Prototypes } from "../../constants"
import { Events } from "../../lib"
import { Pos } from "../../lib/geometry"
import { getProjectPlayerData } from "../../project/player-project-data"
import { _simulateUndo } from "../../project/undo"
import { applyDiffViaWorld, setupEntityIntegrationTest } from "./integration-test-util"

const pos = Pos(10.5, 10.5)
const pos2 = Pos(12.5, 10.5)
const pos3 = Pos(14.5, 10.5)

describe("undo-redo", () => {
  const ctx = setupEntityIntegrationTest()

  describe("force delete undo", () => {
    test("restores entity after force delete", () => {
      const entity = ctx.buildEntity(3)
      applyDiffViaWorld(ctx.wp, entity, 4, (e) => {
        e.inserter_stack_size_override = 2
      })

      Events.raiseFakeEventNamed("on_player_selected_area", {
        player_index: ctx.player.index,
        item: Prototypes.ForceDeleteTool,
        entities: [ctx.wp.getWorldEntity(entity, 4)!],
        tiles: [],
        surface: ctx.surfaces[3],
        area: { left_top: pos, right_bottom: pos },
      })
      ctx.assertEntityNotPresent(entity)

      _simulateUndo(ctx.player)
      ctx.assertEntityCorrect(entity, false)
    })
  })

  describe("move entity to stage undo", () => {
    test("restores entity to original stage after bring-to-stage", () => {
      const entity = ctx.buildEntity(3)

      Events.raiseFakeEventNamed("on_player_reverse_selected_area", {
        player_index: ctx.player.index,
        item: Prototypes.StageMoveTool,
        entities: [ctx.wp.getWorldOrPreviewEntity(entity, 2)!],
        tiles: [],
        surface: ctx.surfaces[1],
        area: { left_top: pos, right_bottom: pos },
      })
      expect(entity.firstStage).toBe(2)

      _simulateUndo(ctx.player)
      expect(entity.firstStage).toBe(3)
      ctx.assertEntityCorrect(entity, false)
    })
  })

  describe("send to stage undo", () => {
    test("restores entity to original stage after send", () => {
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

      _simulateUndo(ctx.player)
      expect(entity.firstStage).toBe(2)
      ctx.assertEntityCorrect(entity, false)
    })
  })

  describe("bring to stage undo", () => {
    test("restores entity to original stage after bring", () => {
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

      _simulateUndo(ctx.player)
      expect(entity.firstStage).toBe(4)
      ctx.assertEntityCorrect(entity, false)
    })
  })

  describe("bring down to stage undo", () => {
    test("restores entity to original stage after bring down", () => {
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

      _simulateUndo(ctx.player)
      expect(entity.firstStage).toBe(4)
      ctx.assertEntityCorrect(entity, false)
    })
  })

  describe("last stage set undo", () => {
    test("removes last stage after undo", () => {
      const entity = ctx.buildEntity(1)

      Events.raiseFakeEventNamed("on_player_selected_area", {
        player_index: ctx.player.index,
        item: Prototypes.StageDeconstructTool,
        entities: [ctx.wp.getWorldEntity(entity, 3)!],
        tiles: [],
        surface: ctx.surfaces[2],
        area: { left_top: pos, right_bottom: pos },
      })
      expect(entity.lastStage).toBe(2)

      _simulateUndo(ctx.player)
      expect(entity.lastStage).toBe(nil)
      ctx.assertEntityCorrect(entity, false)
    })
  })

  describe("last stage cancel undo", () => {
    test("restores last stage after cancel undo", () => {
      const entity = ctx.buildEntity(1)

      Events.raiseFakeEventNamed("on_player_selected_area", {
        player_index: ctx.player.index,
        item: Prototypes.StageDeconstructTool,
        entities: [ctx.wp.getWorldEntity(entity, 4)!],
        tiles: [],
        surface: ctx.surfaces[3],
        area: { left_top: pos, right_bottom: pos },
      })
      expect(entity.lastStage).toBe(3)

      Events.raiseFakeEventNamed("on_player_alt_selected_area", {
        player_index: ctx.player.index,
        item: Prototypes.StageDeconstructTool,
        entities: [ctx.wp.getWorldEntity(entity, 3)!],
        tiles: [],
        surface: ctx.surfaces[2],
        area: { left_top: pos, right_bottom: pos },
      })
      expect(entity.lastStage).toBe(nil)

      _simulateUndo(ctx.player)
      expect(entity.lastStage).toBe(3)
      ctx.assertEntityCorrect(entity, false)
    })
  })

  describe("group undo", () => {
    test("restores all entities from single force delete selection", () => {
      const entity1 = ctx.buildEntity(3)
      const entity2 = ctx.buildEntity(3, { position: pos2 })
      const entity3 = ctx.buildEntity(3, { position: pos3 })

      Events.raiseFakeEventNamed("on_player_selected_area", {
        player_index: ctx.player.index,
        item: Prototypes.ForceDeleteTool,
        entities: [
          ctx.wp.getWorldEntity(entity1, 3)!,
          ctx.wp.getWorldEntity(entity2, 3)!,
          ctx.wp.getWorldEntity(entity3, 3)!,
        ],
        tiles: [],
        surface: ctx.surfaces[2],
        area: { left_top: pos, right_bottom: pos3 },
      })
      ctx.assertEntityNotPresent(entity1)
      ctx.assertEntityNotPresent(entity2)
      ctx.assertEntityNotPresent(entity3)

      _simulateUndo(ctx.player)
      ctx.assertEntityCorrect(entity1, false)
      ctx.assertEntityCorrect(entity2, false)
      ctx.assertEntityCorrect(entity3, false)
    })
  })
})
