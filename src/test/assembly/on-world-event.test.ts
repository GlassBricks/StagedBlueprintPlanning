/*
 * Copyright (c) 2022-2023 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import expect from "tstl-expect"
import {
  EntityRotateResult,
  EntityUpdateResult,
  StageMoveResult,
  WireUpdateResult,
} from "../../assembly/assembly-updates"
import { Assembly } from "../../assembly/AssemblyDef"
import { L_Game } from "../../constants"
import { AssemblyEntity, createAssemblyEntity, StageNumber } from "../../entity/AssemblyEntity"
import { createPreviewEntity, saveEntity } from "../../entity/save-load"
import { Pos } from "../../lib/geometry"
import { L_Interaction } from "../../locale"
import { moduleMock } from "../module-mock"
import { createMockAssembly, setupTestSurfaces } from "./Assembly-mock"
import _assemblyUpdater = require("../../assembly/assembly-updates")

import _worldNotifier = require("../../assembly/notifications")
import worldListener = require("../../assembly/on-world-event")
import _worldUpdater = require("../../assembly/world-entities")

const worldNotifier = moduleMock(_worldNotifier, true)
let totalCalls = 0
let expectedCalls = 1

const assemblyUpdater = moduleMock(_assemblyUpdater, true)
const worldUpdater = moduleMock(_worldUpdater, true)

before_each(() => {
  totalCalls = 0
  expectedCalls = 1
  for (const [, func] of pairs(assemblyUpdater)) {
    if (func != true)
      func.invokes((): any => {
        totalCalls++
      })
  }
  for (const [, func] of pairs(worldUpdater)) {
    if (func != true)
      func.invokes((): any => {
        totalCalls++
      })
  }
  assemblyUpdater.moveEntityOnPreviewReplace.invokes(() => {
    totalCalls++
    return true
  })
})

after_each(() => {
  expect(totalCalls).to.equal(expectedCalls)
})

const surfaces = setupTestSurfaces(6)
let assembly: Assembly
before_each(() => {
  assembly = createMockAssembly(surfaces)
})

const pos = Pos(10.5, 10.5)
function createWorldEntity(stageNum: StageNumber, args?: Partial<SurfaceCreateEntity>): LuaEntity {
  const params = {
    name: "filter-inserter",
    position: pos,
    force: "player",
    ...args,
  }
  const entity = assert(surfaces[stageNum - 1].create_entity(params), "created entity")[0]
  const proto = game.entity_prototypes[params.name]
  if (proto.type == "inserter") {
    entity.inserter_stack_size_override = 1
    entity.inserter_filter_mode = "whitelist"
  }
  return entity
}
const playerIndex = 1 as PlayerIndex

function addEntity(
  stage: StageNumber,
  args?: Partial<SurfaceCreateEntity>,
): {
  luaEntity: LuaEntity
  entity: AssemblyEntity
} {
  const luaEntity = createWorldEntity(stage, args)
  const value = saveEntity(luaEntity)!
  const assemblyEntity = createAssemblyEntity(value, luaEntity.position, luaEntity.direction, stage)
  assembly.content.add(assemblyEntity)
  return { luaEntity, entity: assemblyEntity }
}

let notificationsAsserted = false
function assertNotified(entity: AssemblyEntity, message: LocalisedString, errorSound: boolean) {
  expect(worldNotifier.createNotification).calledTimes(1)
  expect(worldNotifier.createNotification).calledWith(entity, playerIndex, message, errorSound)
  notificationsAsserted = true
}
function assertIndicatorCreated(entity: AssemblyEntity, message: string) {
  expect(worldNotifier.createIndicator).calledTimes(1)
  expect(worldNotifier.createIndicator).calledWith(entity, playerIndex, message, expect._)
  notificationsAsserted = true
}
before_each(() => {
  notificationsAsserted = false
})
after_each(() => {
  if (!notificationsAsserted) expect(worldNotifier.createNotification).not.called()
})

describe("onEntityCreated", () => {
  test("can add a simple entity", () => {
    const luaEntity = createWorldEntity(2)
    const knownValue: any = { foo: "bar" }
    worldListener.onEntityCreated(assembly, luaEntity, 2, playerIndex, knownValue)
    expect(assemblyUpdater.addNewEntity).calledWith(assembly, luaEntity, 2, knownValue)
  })

  test.each([2, 3])("at same or higher stage %d sets entity and calls refreshEntityAtStage", (newStage) => {
    const { luaEntity, entity } = addEntity(2)
    worldListener.onEntityCreated(assembly, luaEntity, newStage, playerIndex)

    expect(entity.getWorldEntity(newStage)).to.be(luaEntity)
    expect(worldUpdater.refreshWorldEntityAtStage).calledWith(assembly, entity, newStage)
  })

  test.each([1, 2], "at lower stage %d sets entity and calls moveEntityOnPreviewReplace", (newStage) => {
    const { luaEntity, entity } = addEntity(3)
    worldListener.onEntityCreated(assembly, luaEntity, newStage, playerIndex)

    expect(entity.getWorldEntity(newStage)).to.be(luaEntity)
    expect(assemblyUpdater.moveEntityOnPreviewReplace).calledWith(assembly, entity, newStage)
    assertNotified(entity, [L_Interaction.EntityMovedFromStage, "mock stage 3"], false)
  })
  test("create at lower stage can handle immediate upgrade", () => {
    const { luaEntity, entity } = addEntity(3)
    assemblyUpdater.moveEntityOnPreviewReplace.invokes(() => {
      totalCalls++
      luaEntity.destroy()
      entity.replaceWorldEntity(1, createWorldEntity(1))
      return true
    })
    worldListener.onEntityCreated(assembly, luaEntity, 1, playerIndex)

    // assert.equal(luaEntity, entity.getWorldEntity(1))
    expect(assemblyUpdater.moveEntityOnPreviewReplace).calledWith(assembly, entity, 1)
    assertNotified(entity, [L_Interaction.EntityMovedFromStage, "mock stage 3"], false)
  })

  test.each(
    [1, 2, 3],
    "on a settings-remnant at any stage (%d) sets entity and calls reviveSettingsRemnant",
    (newStage) => {
      const { luaEntity, entity } = addEntity(2)
      entity.isSettingsRemnant = true

      worldListener.onEntityCreated(assembly, luaEntity, newStage, playerIndex)
      expect(entity.getWorldEntity(newStage)).to.be(luaEntity)
      expect(assemblyUpdater.reviveSettingsRemnant).calledWith(assembly, entity, newStage)
    },
  )

  test.each([1, 2, 3])(
    "if entity can overlap with self, adding at new direction at stage %d creates new entity",
    (stage) => {
      addEntity(2, {
        name: "straight-rail",
        direction: defines.direction.east,
      })
      const luaEntity2 = createWorldEntity(stage, {
        name: "straight-rail",
        direction: defines.direction.north,
      })
      worldListener.onEntityCreated(assembly, luaEntity2, stage, playerIndex)
      expect(assemblyUpdater.addNewEntity).calledWith(assembly, luaEntity2, stage)
    },
  )

  test("disallows building at earlier stage with different direction", () => {
    const entity1 = addEntity(2, {
      name: "transport-belt",
      direction: defines.direction.east,
    })
    const luaEntity2 = createWorldEntity(1, {
      name: "transport-belt",
      direction: defines.direction.north,
    })
    worldListener.onEntityCreated(assembly, luaEntity2, 1, playerIndex)
    assertNotified(entity1.entity, [L_Interaction.CannotBuildDifferentDirection], false)

    expectedCalls = 0
  })
})

describe("onEntityDeleted", () => {
  test("if entity not in assembly, does nothing", () => {
    const luaEntity = createWorldEntity(2)
    worldListener.onEntityDeleted(assembly, luaEntity, 2, playerIndex)
    expectedCalls = 0
  })

  test("in a lower stage does nothing (bug)", () => {
    addEntity(2)
    const luaEntity = createWorldEntity(1)
    worldListener.onEntityDeleted(assembly, luaEntity, 1, playerIndex)
    expectedCalls = 0
  })

  test("in a higher stage calls disallowEntityDeletion", () => {
    const { luaEntity, entity } = addEntity(2)
    worldListener.onEntityDeleted(assembly, luaEntity, 3, playerIndex)
    expect(worldUpdater.rebuildWorldEntityAtStage).calledWith(assembly, entity, 3)
  })

  test("in same stage calls deleteEntityOrCreateSettingsRemnant", () => {
    const { luaEntity, entity } = addEntity(2)
    worldListener.onEntityDeleted(assembly, luaEntity, 2, playerIndex)
    expect(assemblyUpdater.deleteEntityOrCreateSettingsRemnant).calledWith(assembly, entity)
  })
})

test("onEntityDied calls clearEntityAtStage", () => {
  const { luaEntity, entity } = addEntity(2)
  worldListener.onEntityDied(assembly, luaEntity, 2)
  expect(worldUpdater.clearWorldEntityAtStage).calledWith(assembly, entity, 2)
})

const resultMessages: Array<[EntityUpdateResult, string | false]> = [
  ["no-change", false],
  ["updated", false],
  ["cannot-rotate", L_Game.CantBeRotated],
  ["cannot-flip-multi-pair-underground", L_Interaction.CannotFlipUndergroundDueToMultiplePairs],
  ["cannot-upgrade-multi-pair-underground", L_Interaction.CannotUpgradeUndergroundDueToMultiplePairs],
  ["cannot-create-pair-upgrade", L_Interaction.CannotCreateUndergroundUpgradeIfNotInSameStage],
  ["cannot-upgrade-changed-pair", L_Interaction.CannotUpgradeUndergroundChangedPair],
]

describe("onEntityPossiblyUpdated", () => {
  test("if not in assembly, defaults to add behaviour", () => {
    const luaEntity = createWorldEntity(2)
    const knownValue: any = { foo: "bar" }
    worldListener.onEntityPossiblyUpdated(assembly, luaEntity, 2, nil, playerIndex, knownValue)
    expect(assemblyUpdater.addNewEntity).calledWith(assembly, luaEntity, 2, knownValue)
  })

  test.each(resultMessages)('calls tryUpdateEntityFromWorld and notifies, with result "%s"', (result, message) => {
    const { luaEntity, entity } = addEntity(2)
    const knownValue: any = { foo: "bar" }
    assemblyUpdater.tryUpdateEntityFromWorld.invokes(() => {
      totalCalls++
      return result
    })
    worldListener.onEntityPossiblyUpdated(assembly, luaEntity, 2, nil, playerIndex, knownValue)

    expect(assemblyUpdater.tryUpdateEntityFromWorld).calledWith(assembly, entity, 2, knownValue)
    if (message) assertNotified(entity, [message], true)
  })

  test("works with upgrade-compatible entity (fast-replace)", () => {
    const { luaEntity, entity } = addEntity(2)
    assemblyUpdater.tryUpdateEntityFromWorld.invokes(() => {
      totalCalls++
      return "updated"
    })
    luaEntity.destroy()
    const luaEntity2 = createWorldEntity(2, { name: "stack-filter-inserter" })
    worldListener.onEntityPossiblyUpdated(assembly, luaEntity2, 2, nil, playerIndex)

    expect(assemblyUpdater.tryUpdateEntityFromWorld).calledWith(assembly, entity, 2)
  })

  test("works with upgrade-compatible entity (fast-replace) with different direction", () => {
    const { luaEntity, entity } = addEntity(2)
    assemblyUpdater.tryUpdateEntityFromWorld.invokes(() => {
      totalCalls++
      return "updated"
    })
    const oldDirection = luaEntity.direction
    luaEntity.destroy()
    const luaEntity2 = createWorldEntity(2, { name: "stack-filter-inserter", direction: defines.direction.south })
    worldListener.onEntityPossiblyUpdated(assembly, luaEntity2, 2, oldDirection, playerIndex)

    expect(assemblyUpdater.tryUpdateEntityFromWorld).calledWith(assembly, entity, 2)
  })
})

describe("onEntityRotated", () => {
  test("if not in assembly, defaults to add behavior", () => {
    const luaEntity = createWorldEntity(2)
    worldListener.onEntityRotated(assembly, luaEntity, 2, luaEntity.direction, playerIndex)
    expect(assemblyUpdater.addNewEntity).calledWith(assembly, luaEntity, 2)
  })

  test.each<[EntityRotateResult, string | false]>([
    ["no-change", false],
    ["updated", false],
    ["cannot-rotate", L_Game.CantBeRotated],
    ["cannot-flip-multi-pair-underground", L_Interaction.CannotFlipUndergroundDueToMultiplePairs],
  ])('calls tryRotateEntityFromWorld and notifies, with result "%s"', (result, message) => {
    const { luaEntity, entity } = addEntity(2)
    assemblyUpdater.tryRotateEntityToMatchWorld.invokes(() => {
      totalCalls++
      return result
    })
    worldListener.onEntityRotated(assembly, luaEntity, 2, luaEntity.direction, playerIndex)

    expect(assemblyUpdater.tryRotateEntityToMatchWorld).calledWith(assembly, entity, 2)
    if (message) assertNotified(entity, [message], true)
  })
})

test("onUndergroundBeltDragRotated", () => {
  const { luaEntity, entity } = addEntity(2, {
    name: "underground-belt",
    type: "input",
  })
  assemblyUpdater.tryRotateEntityToMatchWorld.invokes(() => {
    totalCalls++
    return "updated"
  })
  worldListener.onUndergroundBeltDragRotated(assembly, luaEntity, 2, playerIndex)
  expect(luaEntity.direction).toBe(defines.direction.south)
  expect(assemblyUpdater.tryRotateEntityToMatchWorld).calledWith(assembly, entity, 2)
})

describe("onEntityMarkedForUpgrade", () => {
  test("if not in assembly, defaults to add behavior", () => {
    const luaEntity = createWorldEntity(2)
    worldListener.onEntityMarkedForUpgrade(assembly, luaEntity, 2, playerIndex)
    expect(assemblyUpdater.addNewEntity).calledWith(assembly, luaEntity, 2)
  })

  test.each(resultMessages)('calls tryUpgradeEntityFromWorld and notifies, with result "%s"', (result, message) => {
    const { luaEntity, entity } = addEntity(2)
    assemblyUpdater.tryApplyUpgradeTarget.invokes(() => {
      totalCalls++
      return result
    })
    worldListener.onEntityMarkedForUpgrade(assembly, luaEntity, 2, playerIndex)

    expect(assemblyUpdater.tryApplyUpgradeTarget).calledWith(assembly, entity, 2)
    if (message) assertNotified(entity, [message], true)
  })
})

describe("onCircuitWiresPossiblyUpdated", () => {
  test("if not in assembly, defaults to add behavior", () => {
    const luaEntity = createWorldEntity(2)
    worldListener.onCircuitWiresPossiblyUpdated(assembly, luaEntity, 2, playerIndex)
  })

  test.each<[WireUpdateResult, string | false]>([
    ["no-change", false],
    ["updated", false],
    ["max-connections-exceeded", L_Interaction.MaxConnectionsReachedInAnotherStage],
  ])('calls updateWiresFromWorld and notifies, with result "%s"', (result, message) => {
    const { luaEntity, entity } = addEntity(2)
    assemblyUpdater.updateWiresFromWorld.invokes(() => {
      totalCalls++
      return result
    })
    worldListener.onCircuitWiresPossiblyUpdated(assembly, luaEntity, 2, playerIndex)

    expect(assemblyUpdater.updateWiresFromWorld).calledWith(assembly, entity, 2)
    if (message) assertNotified(entity, [message], true)
  })
})

function createPreview(luaEntity: LuaEntity) {
  return createPreviewEntity(luaEntity.surface, luaEntity.position, luaEntity.direction, luaEntity.name)!
}

describe("onCleanupToolUsed", () => {
  test("if not in assembly, does nothing", () => {
    const luaEntity = createWorldEntity(2)
    worldListener.onCleanupToolUsed(assembly, luaEntity, 2)
    expectedCalls = 0
  })

  test("if is settings remnant, calls forceDeleteEntity", () => {
    const { luaEntity, entity } = addEntity(2)
    entity.isSettingsRemnant = true
    worldListener.onCleanupToolUsed(assembly, createPreview(luaEntity), 2)
    expect(assemblyUpdater.forceDeleteEntity).calledWith(assembly, entity)
  })

  test("if is less than first stage, does nothing", () => {
    const { luaEntity } = addEntity(1)
    worldListener.onCleanupToolUsed(assembly, luaEntity, 2)
    expectedCalls = 0
  })

  test.each([2, 3])("if is in stage %s, calls refreshEntityAllStages", (atStage) => {
    const { luaEntity, entity } = addEntity(2)
    worldListener.onCleanupToolUsed(assembly, createPreview(luaEntity), atStage)
    expect(worldUpdater.refreshWorldEntityAllStages).calledWith(assembly, entity)
  })
})

test("onEntityForceDeleted calls forceDeleteEntity", () => {
  const { luaEntity, entity } = addEntity(2)
  worldListener.onEntityForceDeleteUsed(assembly, createPreview(luaEntity))
  expect(assemblyUpdater.forceDeleteEntity).calledWith(assembly, entity)
})

test("onEntityDied calls clearEntityAtStage", () => {
  const { luaEntity, entity } = addEntity(2)
  worldListener.onEntityDied(assembly, luaEntity, 2)
  expect(worldUpdater.clearWorldEntityAtStage).calledWith(assembly, entity, 2)
})

describe("onMoveEntityToStageCustomInput", () => {
  test("if not in assembly, does nothing", () => {
    const luaEntity = createWorldEntity(2)
    worldListener.onMoveEntityToStageCustomInput(assembly, luaEntity, 2, playerIndex)
    expectedCalls = 0
  })
  test("if is settings remnant, does nothing", () => {
    const { luaEntity, entity } = addEntity(2)
    entity.isSettingsRemnant = true
    worldListener.onMoveEntityToStageCustomInput(assembly, createPreview(luaEntity), 2, playerIndex)
    expectedCalls = 0
  })
  test.each<[StageMoveResult, LocalisedString | false]>([
    ["updated", [L_Interaction.EntityMovedFromStage, "mock stage 3"]],
    ["no-change", [L_Interaction.AlreadyAtFirstStage]],
    ["cannot-move-upgraded-underground", [L_Interaction.CannotMoveUndergroundBeltWithUpgrade]],
  ])('calls moveEntityToStage and notifies, with result "%s"', (result, message) => {
    const { luaEntity, entity } = addEntity(3)
    assemblyUpdater.moveEntityToStage.invokes(() => {
      totalCalls++
      return result
    })
    worldListener.onMoveEntityToStageCustomInput(assembly, luaEntity, 2, playerIndex)
    expect(assemblyUpdater.moveEntityToStage).calledWith(assembly, entity, 2)
    if (message) assertNotified(entity, message, result != "updated")
  })
})
describe("onSendToStageUsed", () => {
  test("calls moveEntityToStage and notifies if sent down", () => {
    const { luaEntity, entity } = addEntity(2)
    assemblyUpdater.moveEntityToStage.invokes(() => {
      totalCalls++
      return "updated"
    })
    entity.replaceWorldEntity(2, luaEntity)
    worldListener.onSendToStageUsed(assembly, luaEntity, 2, 1, playerIndex)
    assertIndicatorCreated(entity, "<<")
    expect(assemblyUpdater.moveEntityToStage).calledWith(assembly, entity, 1)
  })
  test("calls moveEntityToStage and does not notify if sent up", () => {
    const { luaEntity, entity } = addEntity(2)
    assemblyUpdater.moveEntityToStage.invokes(() => {
      totalCalls++
      return "updated"
    })
    entity.replaceWorldEntity(2, luaEntity)
    worldListener.onSendToStageUsed(assembly, luaEntity, 2, 3, playerIndex)
    expect(worldNotifier.createIndicator).not.called()
    expect(assemblyUpdater.moveEntityToStage).calledWith(assembly, entity, 3)
  })
  test("ignores if not in current stage", () => {
    const { entity, luaEntity } = addEntity(2)
    entity.replaceWorldEntity(2, luaEntity)
    assemblyUpdater.moveEntityToStage.invokes(() => {
      totalCalls++
      return "updated"
    })
    worldListener.onSendToStageUsed(assembly, luaEntity, 3, 1, playerIndex)
    expect(assemblyUpdater.moveEntityToStage).not.called()
    expectedCalls = 0
  })
  describe("onBringToStageUsed", () => {
    test("calls moveEntityToStage when moved, and notifies if sent up", () => {
      const { luaEntity, entity } = addEntity(2)
      assemblyUpdater.moveEntityToStage.invokes(() => {
        totalCalls++
        return "updated"
      })
      entity.replaceWorldEntity(2, luaEntity)
      worldListener.onBringToStageUsed(assembly, luaEntity, 3, playerIndex)
      assertIndicatorCreated(entity, ">>")
      expect(assemblyUpdater.moveEntityToStage).calledWith(assembly, entity, 3)
    })
    test("calls moveEntityToStage and does not notify if sent down", () => {
      const { luaEntity, entity } = addEntity(2)
      assemblyUpdater.moveEntityToStage.invokes(() => {
        totalCalls++
        return "updated"
      })
      entity.replaceWorldEntity(2, luaEntity)
      worldListener.onBringToStageUsed(assembly, luaEntity, 1, playerIndex)
      expect(worldNotifier.createIndicator).not.called()
      expect(assemblyUpdater.moveEntityToStage).calledWith(assembly, entity, 1)
    })
    test("ignores if called at same stage", () => {
      const { entity, luaEntity } = addEntity(2)
      entity.replaceWorldEntity(2, luaEntity)
      assemblyUpdater.moveEntityToStage.invokes(() => {
        totalCalls++
        return "updated"
      })
      worldListener.onBringToStageUsed(assembly, luaEntity, 2, playerIndex)
      expect(assemblyUpdater.moveEntityToStage).not.called()
      expectedCalls = 0
    })
  })
})

describe("onEntityDollied", () => {
  test("if not in assembly, defaults to add behavior", () => {
    const luaEntity = createWorldEntity(2)
    worldListener.onEntityDollied(assembly, luaEntity, 2, luaEntity.position, playerIndex)
    expect(assemblyUpdater.addNewEntity).calledWith(assembly, luaEntity, 2)
  })

  test("calls tryMoveEntity and does not notify if returns nil", () => {
    const { luaEntity, entity } = addEntity(2)
    entity.replaceWorldEntity(2, luaEntity) // needed to detect entity
    // assemblyUpdater.tryMoveEntity.invokes(() => {
    //   totalCalls++
    //   return nil
    // })
    // already returns nil
    worldListener.onEntityDollied(assembly, luaEntity, 2, luaEntity.position, playerIndex)

    expect(worldUpdater.tryDollyEntities).calledWith(assembly, entity, 2)
  })

  test("calls tryMoveEntity and notifies if returns error", () => {
    // just one example
    const { luaEntity, entity } = addEntity(2)
    entity.replaceWorldEntity(2, luaEntity)
    worldUpdater.tryDollyEntities.invokes(() => {
      totalCalls++
      return "entities-missing"
    })
    worldListener.onEntityDollied(assembly, luaEntity, 2, luaEntity.position, playerIndex)

    expect(worldUpdater.tryDollyEntities).calledWith(assembly, entity, 2)
    assertNotified(entity, [L_Interaction.EntitiesMissing, ["entity-name.filter-inserter"]], true)
  })
})
