import { CustomEventId } from "factorio:runtime"
import expect from "tstl-expect"
import { BobInserterChangedPositionEvent } from "../../../declarations/mods"
import { Events } from "../../../lib"
import { Pos } from "../../../lib/geometry"
import { pos, setupEventHandlerTests } from "./_test-setup"

const ctx = setupEventHandlerTests()

if (remote.interfaces.bobinserters && remote.interfaces.bobinserters.get_changed_position_event_id) {
  test("when inserter changed position, calls onEntityPossiblyUpdated", () => {
    const eventId = remote.call(
      "bobinserters",
      "get_changed_position_event_id",
    ) as CustomEventId<BobInserterChangedPositionEvent>
    const entity = ctx.getSurface().create_entity({
      name: "inserter",
      position: pos,
      force: "player",
    })!
    entity.teleport(Pos(1.5, 0))
    Events.raiseFakeEvent(eventId, { entity })

    expect(ctx.getProject().actions.onEntityPossiblyUpdated).toHaveBeenCalledWith(entity, 1, nil, nil, nil)
  })
}

test("calls onSurfaceCleared", () => {
  Events.raiseFakeEventNamed("on_surface_cleared", { surface_index: ctx.getSurface().index })
  after_ticks(5, () => {
    expect(ctx.getProject().actions.onSurfaceCleared).toHaveBeenCalledWith(1)
  })
})

describe("tiles", () => {
  const tilePos = Pos(1, 2)
  describe("if tiles enabled", () => {
    before_each(() => {
      ctx.getProject().settings.stagedTilesEnabled.set(true)
    })
    after_each(() => {
      ctx.getProject().settings.stagedTilesEnabled.set(false)
    })

    test("player built tile", () => {
      Events.raiseFakeEventNamed("on_player_built_tile", {
        tile: prototypes.tile["stone-path"],
        item: nil!,
        tiles: [
          {
            position: tilePos,
            old_tile: nil!,
          },
        ],
        player_index: ctx.getPlayer().index,
        surface_index: ctx.getSurface().index,
      })

      expect(ctx.getProject().actions.onTileBuilt).toHaveBeenCalledWith(tilePos, "stone-path", 1)
    })
    test("robot built tile", () => {
      Events.raiseFakeEventNamed("on_robot_built_tile", {
        surface_index: ctx.getSurface().index,
        tile: prototypes.tile["stone-path"],
        inventory: nil!,
        robot: nil!,
        item: nil!,
        tiles: [
          {
            position: tilePos,
            old_tile: nil!,
          },
        ],
      })

      expect(ctx.getProject().actions.onTileBuilt).toHaveBeenCalledWith(tilePos, "stone-path", 1)
    })

    test("script built tile", () => {
      Events.raiseFakeEventNamed("script_raised_set_tiles", {
        surface_index: ctx.getSurface().index,
        tiles: [
          {
            position: tilePos,
            name: "stone-path",
          },
        ],
      })
      expect(ctx.getProject().actions.onTileBuilt).toHaveBeenCalledWith(tilePos, "stone-path", 1)
    })

    test("player mined tile", () => {
      const surface = ctx.getSurface()
      surface.set_tiles([{ name: "stone-path", position: tilePos }], false, false, false, false)
      ctx.getPlayer().mine_tile(surface.get_tile(tilePos.x, tilePos.y))
      expect(ctx.getProject().actions.onTileMined).toHaveBeenCalledWith(tilePos, 1)
    })
    test("robot mined tile", () => {
      const surface = ctx.getSurface()
      surface.set_tiles([{ name: "stone-path", position: tilePos }], false, false, false, false)
      Events.raiseFakeEventNamed("on_robot_mined_tile", {
        surface_index: surface.index,
        tiles: [
          {
            position: tilePos,
            old_tile: nil!,
          },
        ],
        robot: nil!,
      })
      expect(ctx.getProject().actions.onTileMined).toHaveBeenCalledWith(tilePos, 1)
    })
  })
  describe("if tiles disabled", () => {
    before_each(() => {
      ctx.getProject().settings.stagedTilesEnabled.set(false)
    })
    after_each(() => {
      ctx.setExpectedNumCalls(0)
    })
    test("player built tile", () => {
      Events.raiseFakeEventNamed("on_player_built_tile", {
        tile: prototypes.tile["stone-path"],
        item: nil!,
        tiles: [
          {
            position: tilePos,
            old_tile: nil!,
          },
        ],
        player_index: ctx.getPlayer().index,
        surface_index: ctx.getSurface().index,
      })
    })
    test("robot built tile", () => {
      Events.raiseFakeEventNamed("on_robot_built_tile", {
        surface_index: ctx.getSurface().index,
        tile: prototypes.tile["stone-path"],
        robot: nil!,
        inventory: nil!,
        item: nil!,
        tiles: [
          {
            position: tilePos,
            old_tile: nil!,
          },
        ],
      })
    })
    test("script built tile", () => {
      Events.raiseFakeEventNamed("script_raised_set_tiles", {
        surface_index: ctx.getSurface().index,
        tiles: [
          {
            position: tilePos,
            name: "stone-path",
          },
        ],
      })
    })
    test("player mined tile", () => {
      const surface = ctx.getSurface()
      surface.set_tiles([{ name: "stone-path", position: tilePos }], false, false, false, false)
      ctx.getPlayer().mine_tile(surface.get_tile(tilePos.x, tilePos.y))
    })
    test("robot mined tile", () => {
      const surface = ctx.getSurface()
      surface.set_tiles([{ name: "stone-path", position: tilePos }], false, false, false, false)
      Events.raiseFakeEventNamed("on_robot_mined_tile", {
        surface_index: surface.index,
        tiles: [
          {
            position: tilePos,
            old_tile: nil!,
          },
        ],
        robot: nil!,
      })
    })
  })
})
