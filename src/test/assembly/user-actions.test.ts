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
import { _doUndoAction } from "../../assembly/undo"
import { L_Game } from "../../constants"
import { AssemblyEntity, createAssemblyEntity, StageNumber } from "../../entity/AssemblyEntity"
import { createPreviewEntity, saveEntity } from "../../entity/save-load"
import { Pos } from "../../lib/geometry"
import { L_Interaction } from "../../locale"
import { moduleMock } from "../module-mock"
import { createMockAssembly, setupTestSurfaces } from "./Assembly-mock"
import _assemblyUpdates = require("../../assembly/assembly-updates")
import _notifications = require("../../assembly/notifications")
import _userActions = require("../../assembly/user-actions")
import _worldEntityUpdates = require("../../assembly/world-entity-updates")

const notifications = moduleMock(_notifications, true)
let expectedCalls = 1

const assemblyUpdates = moduleMock(_assemblyUpdates, true)
const worldUpdates = moduleMock(_worldEntityUpdates, true)

const userActions = moduleMock(_userActions, false)

before_each(() => {
  expectedCalls = 1
  assemblyUpdates.trySetFirstStage.invokes((assembly, entity, stage) => {
    entity.setFirstStageUnchecked(stage)
    return StageMoveResult.Updated
  })
  assemblyUpdates.trySetLastStage.invokes((assembly, entity, stage) => {
    entity.setLastStageUnchecked(stage)
    return StageMoveResult.Updated
  })
})

after_each(() => {
  let totalCalls = 0
  for (const [, func] of pairs(assemblyUpdates)) {
    totalCalls += func.calls.length
  }
  for (const [, func] of pairs(worldUpdates)) {
    totalCalls += func.calls.length
  }
  // expect(totalCalls).to.equal(expectedCalls)
  if (totalCalls != expectedCalls) {
    const lines: string[] = []
    lines.push(`Expected ${expectedCalls} calls, but got ${totalCalls}`)
    for (const [name, func] of pairs(assemblyUpdates)) {
      const numCalls = func.calls.length
      if (numCalls > 0) lines.push(`  ${name}: ${numCalls}`)
    }
    for (const [name, func] of pairs(worldUpdates)) {
      const numCalls = func.calls.length
      if (numCalls > 0) lines.push(`  ${name}: ${numCalls}`)
    }
    error(table.concat(lines, "\n"))
  }
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
  expect(notifications.createNotification).calledTimes(1)
  expect(notifications.createNotification).calledWith(entity, playerIndex, message, errorSound)
  notificationsAsserted = true
}
function assertIndicatorCreated(entity: AssemblyEntity, message: string) {
  expect(notifications.createIndicator).calledTimes(1)
  expect(notifications.createIndicator).calledWith(entity, playerIndex, message, expect._)
  notificationsAsserted = true
}
before_each(() => {
  notificationsAsserted = false
})
after_each(() => {
  if (!notificationsAsserted) expect(notifications.createNotification).not.called()
})

test("userMovedEntityToStage, with return=true notifies with EntityMovedBackToStage", () => {
  const { entity } = addEntity(2)

  userActions.userMovedEntityToStage(assembly, entity, 3, playerIndex, true)

  assertNotified(entity, [L_Interaction.EntityMovedBackToStage, "mock stage 2"], false)
})

describe("onEntityCreated", () => {
  test("can add a simple entity", () => {
    const luaEntity = createWorldEntity(2)
    const knownValue: any = { foo: "bar" }
    userActions.onEntityCreated(assembly, luaEntity, 2, playerIndex, knownValue)
    expect(assemblyUpdates.addNewEntity).calledWith(assembly, luaEntity, 2, knownValue)
  })

  test.each([2, 3])("at same or higher stage %d sets entity and calls refreshEntityAtStage", (newStage) => {
    const { luaEntity, entity } = addEntity(2)
    userActions.onEntityCreated(assembly, luaEntity, newStage, playerIndex)

    expect(entity.getWorldEntity(newStage)).to.be(luaEntity)
    expect(worldUpdates.refreshWorldEntityAtStage).calledWith(assembly, entity, newStage)
  })

  test.each([1, 2], "at lower stage %d sets entity and calls trySetFirstStage to new value", (newStage) => {
    const { luaEntity, entity } = addEntity(3)
    userActions.onEntityCreated(assembly, luaEntity, newStage, playerIndex)

    expect(entity.getWorldEntity(newStage)).to.be(luaEntity)
    expect(assemblyUpdates.trySetFirstStage).calledWith(assembly, entity, newStage)
    assertNotified(entity, [L_Interaction.EntityMovedFromStage, "mock stage 3"], false)
  })

  test("create at lower stage can handle immediate upgrade", () => {
    const { luaEntity, entity } = addEntity(3)
    userActions.onEntityCreated(assembly, luaEntity, 1, playerIndex)

    // assert.equal(luaEntity, entity.getWorldEntity(1))
    expect(assemblyUpdates.trySetFirstStage).calledWith(assembly, entity, 1)
    assertNotified(entity, [L_Interaction.EntityMovedFromStage, "mock stage 3"], false)
  })

  test.each(
    [1, 2, 3],
    "on a settings-remnant at stage (%d) sets entity and calls tryReviveSettingsRemnant",
    (newStage) => {
      const { luaEntity, entity } = addEntity(2)
      entity.isSettingsRemnant = true

      assemblyUpdates.tryReviveSettingsRemnant.invokes(() => {
        return StageMoveResult.Updated
      })

      userActions.onEntityCreated(assembly, luaEntity, newStage, playerIndex)
      expect(entity.getWorldEntity(newStage)).to.be(luaEntity)
      expect(assemblyUpdates.tryReviveSettingsRemnant).calledWith(assembly, entity, newStage)
    },
  )

  test("if cannot revive settings remnant, notifies and destroys", () => {
    const { luaEntity, entity } = addEntity(2)
    entity.isSettingsRemnant = true

    assemblyUpdates.tryReviveSettingsRemnant.invokes(() => {
      return StageMoveResult.IntersectsAnotherEntity
    })

    userActions.onEntityCreated(assembly, luaEntity, 3, playerIndex)

    expect(worldUpdates.refreshWorldEntityAtStage).calledWith(assembly, entity, 3)
    assertNotified(entity, [L_Interaction.MoveWillIntersectAnotherEntity], true)

    expectedCalls = 2
  })

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
      userActions.onEntityCreated(assembly, luaEntity2, stage, playerIndex)
      expect(assemblyUpdates.addNewEntity).calledWith(assembly, luaEntity2, stage)
    },
  )

  test("diagonal rails at same position but opposite direction are treated as different entities", () => {
    addEntity(2, {
      name: "straight-rail",
      direction: defines.direction.northeast,
    })
    const luaEntity2 = createWorldEntity(2, {
      name: "straight-rail",
      direction: defines.direction.southwest,
    })
    userActions.onEntityCreated(assembly, luaEntity2, 2, playerIndex)
    expect(assemblyUpdates.addNewEntity).calledWith(assembly, luaEntity2, 2)
  })

  test("disallows building at earlier stage with different direction", () => {
    const entity1 = addEntity(2, {
      name: "transport-belt",
      direction: defines.direction.east,
    })
    const luaEntity2 = createWorldEntity(1, {
      name: "transport-belt",
      direction: defines.direction.north,
    })
    userActions.onEntityCreated(assembly, luaEntity2, 1, playerIndex)
    assertNotified(entity1.entity, [L_Interaction.CannotBuildDifferentDirection], false)

    expectedCalls = 0
  })

  test("can undo overbuilding preview", () => {
    userActions.userMovedEntityToStage.returns(true) // stub out

    const { luaEntity, entity } = addEntity(3)
    const undoAction = userActions.onEntityCreated(assembly, luaEntity, 2, playerIndex)
    notificationsAsserted = true // ignore notifications from onEntityCreated

    expect(undoAction).not.toBeNil()

    _doUndoAction(undoAction!)
    expect(userActions.userMovedEntityToStage).calledWith(assembly, entity, 3, playerIndex, true)
  })

  test("can still undo after being deleted and re-added", () => {
    userActions.userMovedEntityToStage.returns(true) // stub out

    const { luaEntity, entity } = addEntity(3)
    const undoAction = userActions.onEntityCreated(assembly, luaEntity, 2, playerIndex)
    notificationsAsserted = true // ignore notifications from onEntityCreated
    expect(undoAction).not.toBeNil()

    assembly.content.delete(entity)

    const { entity: entity2 } = addEntity(3)
    _doUndoAction(undoAction!)
    expect(userActions.userMovedEntityToStage).calledWith(assembly, entity2, 3, playerIndex, true)
  })
})

describe("onEntityDeleted", () => {
  test("if entity not in assembly, does nothing", () => {
    const luaEntity = createWorldEntity(2)
    userActions.onEntityDeleted(assembly, luaEntity, 2, playerIndex)
    expectedCalls = 0
  })

  test("in a lower stage does nothing (bug)", () => {
    addEntity(2)
    const luaEntity = createWorldEntity(1)
    userActions.onEntityDeleted(assembly, luaEntity, 1, playerIndex)
    expectedCalls = 0
  })

  test("in a higher stage calls disallowEntityDeletion", () => {
    const { luaEntity, entity } = addEntity(2)
    userActions.onEntityDeleted(assembly, luaEntity, 3, playerIndex)
    expect(worldUpdates.rebuildWorldEntityAtStage).calledWith(assembly, entity, 3)
  })

  test("in same stage calls deleteEntityOrCreateSettingsRemnant", () => {
    const { luaEntity, entity } = addEntity(2)
    userActions.onEntityDeleted(assembly, luaEntity, 2, playerIndex)
    expect(assemblyUpdates.deleteEntityOrCreateSettingsRemnant).calledWith(assembly, entity)
  })
})

test("onEntityDied calls clearEntityAtStage", () => {
  const { luaEntity, entity } = addEntity(2)
  userActions.onEntityDied(assembly, luaEntity, 2)
  expect(worldUpdates.clearWorldEntityAtStage).calledWith(assembly, entity, 2)
})

const resultMessages: Array<[EntityUpdateResult, string | false]> = [
  [EntityUpdateResult.NoChange, false],
  [EntityUpdateResult.Updated, false],
  [EntityUpdateResult.CannotRotate, L_Game.CantBeRotated],
  [EntityUpdateResult.CannotUpgradeMultiPairUnderground, L_Interaction.CannotUpgradeUndergroundDueToMultiplePairs],
  [EntityUpdateResult.CannotCreatePairUpgrade, L_Interaction.CannotCreateUndergroundUpgradeIfNotInSameStage],
  [EntityUpdateResult.CannotUpgradeChangedPair, L_Interaction.CannotUpgradeUndergroundChangedPair],
]

describe("onEntityPossiblyUpdated", () => {
  test("if not in assembly, defaults to add behaviour", () => {
    const luaEntity = createWorldEntity(2)
    const knownValue: any = { foo: "bar" }
    userActions.onEntityPossiblyUpdated(assembly, luaEntity, 2, nil, playerIndex, knownValue)
    expect(assemblyUpdates.addNewEntity).calledWith(assembly, luaEntity, 2, knownValue)
  })

  test.each(resultMessages)('calls tryUpdateEntityFromWorld and notifies, with result "%s"', (result, message) => {
    const { luaEntity, entity } = addEntity(2)
    const knownValue: any = { foo: "bar" }
    assemblyUpdates.tryUpdateEntityFromWorld.invokes(() => {
      return result
    })
    userActions.onEntityPossiblyUpdated(assembly, luaEntity, 2, nil, playerIndex, knownValue)

    expect(assemblyUpdates.tryUpdateEntityFromWorld).calledWith(assembly, entity, 2, knownValue)
    if (message) assertNotified(entity, [message], true)
  })

  test("works with upgrade-compatible entity (fast-replace)", () => {
    const { luaEntity, entity } = addEntity(2)
    assemblyUpdates.tryUpdateEntityFromWorld.invokes(() => {
      return EntityUpdateResult.Updated
    })
    luaEntity.destroy()
    const luaEntity2 = createWorldEntity(2, { name: "stack-filter-inserter" })
    userActions.onEntityPossiblyUpdated(assembly, luaEntity2, 2, nil, playerIndex)

    expect(assemblyUpdates.tryUpdateEntityFromWorld).calledWith(assembly, entity, 2)
  })

  test("works with upgrade-compatible entity (fast-replace) with different direction", () => {
    const { luaEntity, entity } = addEntity(2)
    assemblyUpdates.tryUpdateEntityFromWorld.invokes(() => {
      return EntityUpdateResult.Updated
    })
    const oldDirection = luaEntity.direction
    luaEntity.destroy()
    const luaEntity2 = createWorldEntity(2, { name: "stack-filter-inserter", direction: defines.direction.south })
    userActions.onEntityPossiblyUpdated(assembly, luaEntity2, 2, oldDirection, playerIndex)

    expect(assemblyUpdates.tryUpdateEntityFromWorld).calledWith(assembly, entity, 2)
  })
})

describe("onEntityRotated", () => {
  test("if not in assembly, defaults to add behavior", () => {
    const luaEntity = createWorldEntity(2)
    userActions.onEntityRotated(assembly, luaEntity, 2, luaEntity.direction, playerIndex)
    expect(assemblyUpdates.addNewEntity).calledWith(assembly, luaEntity, 2)
  })

  test.each<[EntityRotateResult, string | false]>([
    [EntityRotateResult.NoChange, false],
    [EntityRotateResult.Updated, false],
    [EntityRotateResult.CannotRotate, L_Game.CantBeRotated],
    [EntityRotateResult.CannotFlipMultiPairUnderground, L_Interaction.CannotFlipUndergroundDueToMultiplePairs],
  ])('calls tryRotateEntityFromWorld and notifies, with result "%s"', (result, message) => {
    const { luaEntity, entity } = addEntity(2)
    assemblyUpdates.tryRotateEntityToMatchWorld.invokes(() => {
      return result
    })
    userActions.onEntityRotated(assembly, luaEntity, 2, luaEntity.direction, playerIndex)

    expect(assemblyUpdates.tryRotateEntityToMatchWorld).calledWith(assembly, entity, 2)
    if (message) assertNotified(entity, [message], true)
  })
})

test("onUndergroundBeltDragRotated", () => {
  const { luaEntity, entity } = addEntity(2, {
    name: "underground-belt",
    type: "input",
  })
  assemblyUpdates.tryRotateEntityToMatchWorld.invokes(() => {
    return EntityRotateResult.Updated
  })
  userActions.onUndergroundBeltDragRotated(assembly, luaEntity, 2, playerIndex)
  expect(luaEntity.direction).toBe(defines.direction.south)
  expect(assemblyUpdates.tryRotateEntityToMatchWorld).calledWith(assembly, entity, 2)
})

describe("onEntityMarkedForUpgrade", () => {
  test("if not in assembly, defaults to add behavior", () => {
    const luaEntity = createWorldEntity(2)
    userActions.onEntityMarkedForUpgrade(assembly, luaEntity, 2, playerIndex)
    expect(assemblyUpdates.addNewEntity).calledWith(assembly, luaEntity, 2)
  })

  test.each(resultMessages)('calls tryUpgradeEntityFromWorld and notifies, with result "%s"', (result, message) => {
    const { luaEntity, entity } = addEntity(2)
    assemblyUpdates.tryApplyUpgradeTarget.invokes(() => {
      return result
    })
    userActions.onEntityMarkedForUpgrade(assembly, luaEntity, 2, playerIndex)

    expect(assemblyUpdates.tryApplyUpgradeTarget).calledWith(assembly, entity, 2)
    if (message) assertNotified(entity, [message], true)
  })
})

describe("onCircuitWiresPossiblyUpdated", () => {
  test("if not in assembly, defaults to add behavior", () => {
    const luaEntity = createWorldEntity(2)
    userActions.onCircuitWiresPossiblyUpdated(assembly, luaEntity, 2, playerIndex)
  })

  test.each<[WireUpdateResult, string | false]>([
    [WireUpdateResult.NoChange, false],
    [WireUpdateResult.Updated, false],
    [WireUpdateResult.MaxConnectionsExceeded, L_Interaction.MaxConnectionsReachedInAnotherStage],
  ])('calls updateWiresFromWorld and notifies, with result "%s"', (result, message) => {
    const { luaEntity, entity } = addEntity(2)
    assemblyUpdates.updateWiresFromWorld.invokes(() => {
      return result
    })
    userActions.onCircuitWiresPossiblyUpdated(assembly, luaEntity, 2, playerIndex)

    expect(assemblyUpdates.updateWiresFromWorld).calledWith(assembly, entity, 2)
    if (message) assertNotified(entity, [message], true)
  })
})

function createPreview(luaEntity: LuaEntity) {
  return createPreviewEntity(luaEntity.surface, luaEntity.position, luaEntity.direction, luaEntity.name)!
}

describe("onCleanupToolUsed", () => {
  test("if not in assembly, does nothing", () => {
    const luaEntity = createWorldEntity(2)
    userActions.onCleanupToolUsed(assembly, luaEntity, 2)
    expectedCalls = 0
  })

  test("if is settings remnant, calls forceDeleteEntity", () => {
    const { luaEntity, entity } = addEntity(2)
    entity.isSettingsRemnant = true
    userActions.onCleanupToolUsed(assembly, createPreview(luaEntity), 2)
    expect(assemblyUpdates.forceDeleteEntity).calledWith(assembly, entity)
  })

  test("if is less than first stage, does nothing", () => {
    const { luaEntity } = addEntity(1)
    userActions.onCleanupToolUsed(assembly, luaEntity, 2)
    expectedCalls = 0
  })

  test.each([2, 3])("if is in stage %s, calls refreshEntityAllStages", (atStage) => {
    const { luaEntity, entity } = addEntity(2)
    userActions.onCleanupToolUsed(assembly, createPreview(luaEntity), atStage)
    expect(worldUpdates.refreshAllWorldEntities).calledWith(assembly, entity)
  })
})

test("onEntityForceDeleted calls forceDeleteEntity", () => {
  const { luaEntity, entity } = addEntity(2)
  userActions.onEntityForceDeleteUsed(assembly, createPreview(luaEntity), 2)
  expect(assemblyUpdates.forceDeleteEntity).calledWith(assembly, entity)
})

test("onEntityDied calls clearEntityAtStage", () => {
  const { luaEntity, entity } = addEntity(2)
  userActions.onEntityDied(assembly, luaEntity, 2)
  expect(worldUpdates.clearWorldEntityAtStage).calledWith(assembly, entity, 2)
})

describe("onMoveEntityToStageCustomInput", () => {
  test("if not in assembly, does nothing", () => {
    const luaEntity = createWorldEntity(2)
    const undoAction = userActions.onMoveEntityToStageCustomInput(assembly, luaEntity, 2, playerIndex)
    expectedCalls = 0
    expect(undoAction).toBeNil()
  })
  test("if is settings remnant, does nothing", () => {
    const { luaEntity, entity } = addEntity(2)
    entity.isSettingsRemnant = true
    const undoAction = userActions.onMoveEntityToStageCustomInput(assembly, createPreview(luaEntity), 2, playerIndex)
    expectedCalls = 0

    expect(undoAction).toBeNil()
  })
  test.each<[StageMoveResult, LocalisedString | false]>([
    [StageMoveResult.Updated, [L_Interaction.EntityMovedFromStage, "mock stage 3"]],
    [StageMoveResult.NoChange, [L_Interaction.AlreadyAtFirstStage]],
    [StageMoveResult.CannotMoveUpgradedUnderground, [L_Interaction.CannotMoveUndergroundBeltWithUpgrade]],
    [StageMoveResult.IntersectsAnotherEntity, [L_Interaction.MoveWillIntersectAnotherEntity]],
    [StageMoveResult.CannotMovePastLastStage, [L_Interaction.CannotMovePastLastStage]],
  ])('calls trySetFirstStage and notifies, with result "%s"', (result, message) => {
    const { luaEntity, entity } = addEntity(3)
    assemblyUpdates.trySetFirstStage.invokes((_, entity, stage) => {
      entity.setFirstStageUnchecked(stage)
      return result
    })
    const undoAction = userActions.onMoveEntityToStageCustomInput(assembly, luaEntity, 2, playerIndex)

    expect(assemblyUpdates.trySetFirstStage).calledWith(assembly, entity, 2)
    if (message) assertNotified(entity, message, result != "updated")

    if (result == "updated") {
      expect(undoAction).not.toBeNil()

      userActions.userMovedEntityToStage.returns(true)
      _doUndoAction(undoAction!)
      expect(userActions.userMovedEntityToStage).calledWith(assembly, entity, 3, 1, true)
    }
  })
})
describe("onSendToStageUsed", () => {
  test("calls trySetFirstStage and notifies if sent down", () => {
    const { luaEntity, entity } = addEntity(2)
    entity.replaceWorldEntity(2, luaEntity)
    const undoAction = userActions.onSendToStageUsed(assembly, luaEntity, 2, 1, playerIndex)

    assertIndicatorCreated(entity, "<<")
    expect(assemblyUpdates.trySetFirstStage).calledWith(assembly, entity, 1)
    expect(undoAction).not.toBeNil()

    userActions.userBringEntityToStage.returns(true)
    _doUndoAction(undoAction!)
    expect(userActions.userBringEntityToStage).calledWith(assembly, entity, 2, 1)
  })
  test("calls trySetFirstStage and does not notify if sent up", () => {
    const { luaEntity, entity } = addEntity(2)
    entity.replaceWorldEntity(2, luaEntity)
    const undoAction = userActions.onSendToStageUsed(assembly, luaEntity, 2, 3, playerIndex)

    expect(notifications.createIndicator).not.called()
    expect(assemblyUpdates.trySetFirstStage).calledWith(assembly, entity, 3)
    expect(undoAction).not.toBeNil()

    userActions.userBringEntityToStage.returns(true)
    _doUndoAction(undoAction!)
    expect(userActions.userBringEntityToStage).calledWith(assembly, entity, 2, 1)
  })
  test("ignores if not in current stage", () => {
    const { entity, luaEntity } = addEntity(2)
    entity.replaceWorldEntity(2, luaEntity)
    const undoAction = userActions.onSendToStageUsed(assembly, luaEntity, 3, 1, playerIndex)

    expect(assemblyUpdates.trySetFirstStage).not.called()
    expect(undoAction).toBeNil()
    expectedCalls = 0
  })
  test.each<[StageMoveResult, LocalisedString]>([
    [StageMoveResult.CannotMovePastLastStage, [L_Interaction.CannotMovePastLastStage]],
    [StageMoveResult.CannotMoveUpgradedUnderground, [L_Interaction.CannotMoveUndergroundBeltWithUpgrade]],
    [StageMoveResult.IntersectsAnotherEntity, [L_Interaction.MoveWillIntersectAnotherEntity]],
  ])("notifies error if cannot move to stage %s", (result, message) => {
    const { entity, luaEntity } = addEntity(2)
    entity.replaceWorldEntity(2, luaEntity)
    assemblyUpdates.trySetFirstStage.returns(result)
    userActions.onSendToStageUsed(assembly, luaEntity, 2, 3, playerIndex)
    expect(assemblyUpdates.trySetFirstStage).calledWith(assembly, entity, 3)
    assertNotified(entity, message, true)
  })
})
describe("onBringToStageUsed", () => {
  test("calls trySetFirstStage when moved, and notifies if sent up", () => {
    const { luaEntity, entity } = addEntity(2)
    entity.replaceWorldEntity(2, luaEntity)
    const undoAction = userActions.onBringToStageUsed(assembly, luaEntity, 3, playerIndex)

    assertIndicatorCreated(entity, ">>")
    expect(assemblyUpdates.trySetFirstStage).calledWith(assembly, entity, 3)
    expect(undoAction).not.toBeNil()

    userActions.userSentEntityToStage.returns(true)
    _doUndoAction(undoAction!)
    expect(userActions.userSentEntityToStage).calledWith(assembly, entity, 3, 2, playerIndex)
  })
  test("calls trySetFirstStage and does not notify if sent down", () => {
    const { luaEntity, entity } = addEntity(2)
    entity.replaceWorldEntity(2, luaEntity)
    const undoAction = userActions.onBringToStageUsed(assembly, luaEntity, 1, playerIndex)

    expect(notifications.createIndicator).not.called()
    expect(assemblyUpdates.trySetFirstStage).calledWith(assembly, entity, 1)
    expect(undoAction).not.toBeNil()

    userActions.userSentEntityToStage.returns(true)
    _doUndoAction(undoAction!)
    expect(userActions.userSentEntityToStage).calledWith(assembly, entity, 1, 2, playerIndex)
  })
  test("ignores if called at same stage", () => {
    const { entity, luaEntity } = addEntity(2)
    entity.replaceWorldEntity(2, luaEntity)
    const undoAction = userActions.onBringToStageUsed(assembly, luaEntity, 2, playerIndex)

    expect(assemblyUpdates.trySetFirstStage).not.called()
    expect(undoAction).toBeNil()

    expectedCalls = 0
  })

  test.each<[StageMoveResult, LocalisedString]>([
    [StageMoveResult.CannotMovePastLastStage, [L_Interaction.CannotMovePastLastStage]],
    [StageMoveResult.CannotMoveUpgradedUnderground, [L_Interaction.CannotMoveUndergroundBeltWithUpgrade]],
    [StageMoveResult.IntersectsAnotherEntity, [L_Interaction.MoveWillIntersectAnotherEntity]],
  ])("notifies error if cannot move to stage %s", (result, message) => {
    const { entity, luaEntity } = addEntity(2)
    entity.replaceWorldEntity(2, luaEntity)
    assemblyUpdates.trySetFirstStage.returns(result)
    userActions.onBringToStageUsed(assembly, luaEntity, 3, playerIndex)
    expect(assemblyUpdates.trySetFirstStage).calledWith(assembly, entity, 3)
    assertNotified(entity, message, true)
  })
})

describe("onStageDeleteUsed", () => {
  test("can set stage", () => {
    const { entity, luaEntity } = addEntity(2)
    entity.replaceWorldEntity(2, luaEntity)
    assemblyUpdates.trySetLastStage.invokes(() => {
      return StageMoveResult.Updated
    })
    userActions.onStageDeleteUsed(assembly, luaEntity, 2, playerIndex)
    expect(assemblyUpdates.trySetLastStage).calledWith(assembly, entity, 1)
  })

  test("notifies if error", () => {
    const { entity, luaEntity } = addEntity(2)
    entity.replaceWorldEntity(2, luaEntity)
    assemblyUpdates.trySetLastStage.invokes(() => {
      return StageMoveResult.CannotMoveBeforeFirstStage
    })
    userActions.onStageDeleteUsed(assembly, luaEntity, 2, playerIndex)
    expect(assemblyUpdates.trySetLastStage).calledWith(assembly, entity, 1)
    assertNotified(entity, [L_Interaction.CannotDeleteBeforeFirstStage], true)
  })
})
describe("onStageDeleteCancelUsed", () => {
  test("can clear last stage", () => {
    const { entity, luaEntity } = addEntity(2)
    entity.replaceWorldEntity(2, luaEntity)
    entity.setLastStageUnchecked(2)
    assemblyUpdates.trySetLastStage.invokes(() => {
      return StageMoveResult.Updated
    })
    userActions.onStageDeleteCancelUsed(assembly, luaEntity, 2, playerIndex)
    expect(assemblyUpdates.trySetLastStage).calledWith(assembly, entity, nil)
  })

  test("notifies if error", () => {
    const { entity, luaEntity } = addEntity(2)
    entity.replaceWorldEntity(2, luaEntity)
    entity.setLastStageUnchecked(2)
    assemblyUpdates.trySetLastStage.invokes(() => {
      return StageMoveResult.IntersectsAnotherEntity
    })
    userActions.onStageDeleteCancelUsed(assembly, luaEntity, 2, playerIndex)
    expect(assemblyUpdates.trySetLastStage).calledWith(assembly, entity, nil)
    assertNotified(entity, [L_Interaction.MoveWillIntersectAnotherEntity], true)
  })

  test("ignores if selected stage is not entity's last stage", () => {
    const { entity, luaEntity } = addEntity(2)
    entity.replaceWorldEntity(2, luaEntity)
    entity.setLastStageUnchecked(2)
    assemblyUpdates.trySetLastStage.invokes(() => {
      return StageMoveResult.Updated
    })
    userActions.onStageDeleteCancelUsed(assembly, luaEntity, 1, playerIndex)
    expect(assemblyUpdates.trySetLastStage).not.called()
    expectedCalls = 0
  })
})

describe("onEntityDollied", () => {
  test("if not in assembly, defaults to add behavior", () => {
    const luaEntity = createWorldEntity(2)
    userActions.onEntityDollied(assembly, luaEntity, 2, luaEntity.position, playerIndex)
    expect(assemblyUpdates.addNewEntity).calledWith(assembly, luaEntity, 2)
  })

  test("calls tryMoveEntity and does not notify if returns nil", () => {
    const { luaEntity, entity } = addEntity(2)
    entity.replaceWorldEntity(2, luaEntity) // needed to detect entity
    // asmUpdates.tryMoveEntity.invokes(() => {
    //   totalCalls++
    //   return nil
    // })
    // already returns nil
    userActions.onEntityDollied(assembly, luaEntity, 2, luaEntity.position, playerIndex)

    expect(worldUpdates.tryDollyEntities).calledWith(assembly, entity, 2)
  })

  test("calls tryMoveEntity and notifies if returns error", () => {
    // just one example
    const { luaEntity, entity } = addEntity(2)
    entity.replaceWorldEntity(2, luaEntity)
    worldUpdates.tryDollyEntities.invokes(() => {
      return "entities-missing"
    })
    userActions.onEntityDollied(assembly, luaEntity, 2, luaEntity.position, playerIndex)

    expect(worldUpdates.tryDollyEntities).calledWith(assembly, entity, 2)
    assertNotified(entity, [L_Interaction.EntitiesMissing, ["entity-name.filter-inserter"]], true)
  })
})
