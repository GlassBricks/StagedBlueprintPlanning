import { LuaEntity, PlayerIndex } from "factorio:runtime"
import expect, { mock } from "tstl-expect"
import { getTempBpItemStack } from "../../../entity/save-load"
import { Events } from "../../../lib"
import { Pos } from "../../../lib/geometry"
import { reviveGhost } from "../../test-util"
import { pos, setupEventHandlerTests } from "./_test-setup"

const ctx = setupEventHandlerTests()

describe("add", () => {
  test("script raise built", () => {
    const entity = ctx.getSurface().create_entity({
      name: "iron-chest",
      position: pos,
      raise_built: true,
    })!
    expect(entity).toBeAny()
    expect(ctx.getProject().actions.onEntityCreated).toHaveBeenCalledWith(entity, 1, nil)
  })
  test("does not run create if raised by this mod", () => {
    const entity = ctx.getSurface().create_entity({
      name: "iron-chest",
      position: pos,
      raise_built: false,
    })!
    script.raise_script_built({ entity })
    expect(ctx.getProject().actions.onEntityCreated).not.toHaveBeenCalled()
    ctx.setExpectedNumCalls(0)
  })
})

describe("delete", () => {
  let entity: LuaEntity
  before_each(() => {
    entity = ctx.getSurface().create_entity({
      name: "iron-chest",
      position: pos,
      raise_built: true,
      force: "player",
    })!
    mock.clear(ctx.getProject().actions)
  })
  test("script raised destroy", () => {
    Events.raiseFakeEventNamed("script_raised_destroy", { entity })
    expect(ctx.getProject().actions.onEntityDeleted).toHaveBeenCalledWith(expect._, 1)
  })
  test("does not run delete if raised by this mod", () => {
    script.raise_script_destroy({ entity })
    expect(ctx.getProject().actions.onEntityDeleted).not.toHaveBeenCalled()
    ctx.setExpectedNumCalls(0)
  })
  test("die", () => {
    entity.die()
    expect(ctx.getProject().actions.onEntityDied).toHaveBeenCalledWith(expect._, 1)
  })
})

describe("update", () => {
  let entity: LuaEntity
  before_each(() => {
    entity = ctx.getSurface().create_entity({
      name: "inserter",
      position: pos,
      raise_built: true,
      force: "player",
    })!
    mock.clear(ctx.getProject().actions)
  })
  test("gui", () => {
    const player = ctx.getPlayer()
    player.opened = nil
    player.opened = entity
    player.opened = nil
    expect(ctx.getProject().actions.onEntityPossiblyUpdated).toHaveBeenCalledWith(entity, 1, nil, 1)
  })
  test("settings copy paste", () => {
    Events.raiseFakeEventNamed("on_entity_settings_pasted", {
      source: entity,
      destination: entity,
      player_index: 1 as PlayerIndex,
    })
    expect(ctx.getProject().actions.onEntityPossiblyUpdated).toHaveBeenCalledWith(entity, 1, nil, 1)
  })
  test("rotate", () => {
    const oldDirection = entity.direction
    entity.rotate({ by_player: 1 as PlayerIndex })
    expect(ctx.getProject().actions.onEntityRotated).toHaveBeenCalledWith(entity, 1, oldDirection, 1)
  })
})

describe("upgrade", () => {
  let entity: LuaEntity
  before_each(() => {
    entity = ctx.getSurface().create_entity({
      name: "inserter",
      position: pos,
      raise_built: true,
      force: "player",
    })!
    mock.clear(ctx.getProject().actions)
  })

  test("marked for upgrade", () => {
    entity.order_upgrade({
      force: "player",
      target: "fast-inserter",
    })
    expect(ctx.getProject().actions.onEntityMarkedForUpgrade).toHaveBeenCalledWith(entity, 1, nil)
  })
  test("marked to rotate", () => {
    entity.order_upgrade({
      force: "player",
      target: "inserter",
    })
    expect(ctx.getProject().actions.onEntityMarkedForUpgrade).toHaveBeenCalledWith(entity, 1, nil)
  })
})

describe("robot actions", () => {
  const setupBlueprint =
    "0eNqF0e9qxCAMAPB3yWc9rv/o6quMcVgv7QSronasK777aY/J4Arzi0SSXyTZYVQrWid1ALaDFEZ7YO87eDlrrvJb2CwCAxlwAQKaLzlyZjTWuACRgNR3/AZWxQ8CqIMMEp/GEWw3vS4jupTwWk3AGp8KjM6dMpKSNmC0usZIXoS6CH7hSlFUKIKTglqj8ARrLt0vd+nOwKaAyszSh0SJT/SB+mAcn8/M9j+zLWb5Hmp080bTkNFNXJyyT3RI8xzXaUJ38/InIdW1nDzfYwvsz9IIfKHzB1S/VW0/1H03NH26Y3wA6bmb8w=="
  before_each(() => {
    const surface = ctx.getSurface()
    surface.find_entities().forEach((e) => e.destroy())
    const stack = getTempBpItemStack()
    stack.import_stack(setupBlueprint)
    const ghosts = stack.build_blueprint({
      surface,
      position: pos,
      force: "player",
    })
    ghosts.forEach((x) => reviveGhost(x))
    const roboport = surface.find_entities_filtered({
      type: "roboport",
      limit: 1,
    })[0]
    expect(roboport).toBeAny()
    roboport.insert("construction-robot")
    const storageChest = surface.find_entities_filtered({
      name: "storage-chest",
      limit: 1,
    })[0]
    expect(storageChest).toBeAny()
    storageChest.insert("iron-chest")
  })
  test("build", () => {
    const surface = ctx.getSurface()
    const ghost = surface.create_entity({
      name: "entity-ghost",
      inner_name: "iron-chest",
      position: Pos(4.5, 0.5),
      force: "player",
    })
    assert(ghost, "ghost created")
    after_ticks(120, () => {
      const chest = surface.find_entities_filtered({
        name: "iron-chest",
        limit: 1,
      })[0]
      expect(chest).toBeAny()
      expect(ctx.getProject().actions.onEntityCreated).toHaveBeenCalledWith(chest, 1, nil)
    })
  })

  test("mine", () => {
    const surface = ctx.getSurface()
    const minePos = Pos(4.5, 0.5)
    const chest = surface.create_entity({
      name: "iron-chest",
      position: minePos,
      force: "player",
    })!
    assert(chest, "chest created")
    chest.order_deconstruction("player")
    after_ticks(120, () => {
      expect(ctx.getProject().actions.onEntityDeleted).toHaveBeenCalledWith(expect._, 1)
    })
  })
})

describe("mirroring", () => {
  test("horizontal", () => {
    const chemPlant = ctx.getSurface().create_entity({
      name: "chemical-plant",
      position: pos,
      force: "player",
      recipe: "light-oil-cracking",
    })!
    chemPlant.mirroring = true
    Events.raiseFakeEventNamed("on_player_flipped_entity", {
      entity: chemPlant,
      player_index: ctx.getPlayer().index,
      horizontal: true,
    })
  })
})
