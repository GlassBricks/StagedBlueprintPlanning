// Copyright (c) 2022-2025 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { LocalisedString, LuaEntity, PlayerIndex, SurfaceCreateEntity } from "factorio:runtime"
import expect from "tstl-expect"
import { L_Game, Prototypes, Settings } from "../../constants"
import { newProjectEntity, ProjectEntity, StageNumber } from "../../entity/ProjectEntity"
import { createProjectTile, ProjectTile } from "../../tiles/ProjectTile"
import { createPreviewEntity, saveEntity } from "../../entity/save-load"
import { StageInfoExport } from "../../import-export/entity"
import { Pos } from "../../lib/geometry"
import { getPlayer } from "../../lib/test/misc"
import { L_Interaction } from "../../locale"
import { EntityUpdateResult, ProjectUpdates, StageMoveResult, WireUpdateResult } from "../../project/project-updates"
import { ProjectBase } from "../../project/Project"
import { performUndoAction } from "../../project/undo"
import { UserActions } from "../../project/user-actions"
import { WorldUpdates } from "../../project/world-updates"
import { fMock } from "../f-mock"
import { moduleMock } from "../module-mock"
import { createMockProject, setupTestSurfaces } from "./Project-mock"
import _notifications = require("../../project/notifications")

const notifications = moduleMock(_notifications, true)
let expectedNumCalls = 1

const surfaces = setupTestSurfaces(6)
let project: ProjectBase
function wp() {
  return project.worldPresentation
}

const projectUpdates = fMock<ProjectUpdates>()
const worldUpdates = fMock<WorldUpdates>()
let userActions: UserActions

before_each(() => {
  project = createMockProject(surfaces)
  project.worldUpdates = worldUpdates
  project.updates = projectUpdates
  project.actions = userActions = UserActions(project, projectUpdates, worldUpdates)
})

before_each(() => {
  expectedNumCalls = 1
  projectUpdates.trySetFirstStage.invokes((entity, stage) => {
    entity._asMut().setFirstStageUnchecked(stage)
    return StageMoveResult.Updated
  })
  projectUpdates.trySetLastStage.invokes((entity, stage) => {
    entity._asMut().setLastStageUnchecked(stage)
    return StageMoveResult.Updated
  })
  projectUpdates.setValueFromStagedInfo.invokes((entity, stagedInfo) => {
    entity._asMut().setFirstStageUnchecked(stagedInfo.firstStage)
    return StageMoveResult.Updated
  })
})

after_each(() => {
  let totalCalls = 0
  for (const [, func] of pairs(projectUpdates)) {
    totalCalls += func.calls.length
  }
  for (const [, func] of pairs(worldUpdates)) {
    totalCalls += func.calls.length
  }
  // expect(totalCalls).toEqual(expectedCalls)
  if (totalCalls != expectedNumCalls) {
    const lines: string[] = []
    lines.push(`Expected ${expectedNumCalls} calls, but got ${totalCalls}`)
    for (const [name, func] of pairs(projectUpdates)) {
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

const pos = Pos(10.5, 10.5)
function createWorldEntity(stageNum: StageNumber, args?: Partial<SurfaceCreateEntity>): LuaEntity {
  const params = {
    name: "fast-inserter",
    position: pos,
    force: "player",
    ...args,
  }
  const entity = assert(surfaces[stageNum - 1].create_entity(params), "created entity")[0]
  const proto = prototypes.entity[params.name as string]
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
  entity: ProjectEntity
} {
  const luaEntity = createWorldEntity(stage, args)
  const [value] = saveEntity(luaEntity)
  const projectEntity = newProjectEntity(value!, luaEntity.position, luaEntity.direction, stage)
  project.content.addEntity(projectEntity)
  return { luaEntity, entity: projectEntity }
}

let numNotifications = 0
let numIndicators = 0
function assertNotified(entity: ProjectEntity | ProjectTile, message: LocalisedString, errorSound: boolean) {
  expect(notifications.createNotification).toHaveBeenCalledTimes(++numNotifications)
  expect(notifications.createNotification).toHaveBeenLastCalledWith(entity, playerIndex, message, errorSound)
}
function assertIndicatorCreated(entity: ProjectEntity, message: string) {
  expect(notifications.createIndicator).toHaveBeenCalledTimes(++numIndicators)
  expect(notifications.createIndicator).toHaveBeenCalledWith(entity, playerIndex, message, expect._)
}
function ignoreNotification() {
  numNotifications++
}
before_each(() => {
  numNotifications = 0
  numIndicators = 0
})
after_each(() => {
  expect(notifications.createNotification).toHaveBeenCalledTimes(numNotifications)
  expect(notifications.createIndicator).toHaveBeenCalledTimes(numIndicators)
})

describe("onEntityCreated()", () => {
  test.each([2, 3])("at same or higher stage %d sets entity and calls refreshEntityAtStage", (newStage) => {
    const { luaEntity, entity } = addEntity(2)
    userActions.onEntityCreated(luaEntity, newStage, playerIndex)

    expect(wp().getWorldEntity(entity, newStage)).toBe(luaEntity)
    expect(worldUpdates.refreshWorldEntityAtStage).toHaveBeenCalledWith(entity, newStage)
  })

  test.each([1, 2])("at lower stage %d (overbuilding preview) sets entity and calls trySetFirstStage", (newStage) => {
    const { luaEntity, entity } = addEntity(3)
    userActions.onEntityCreated(luaEntity, newStage, playerIndex)

    expect(wp().getWorldEntity(entity, newStage)).toBe(luaEntity)
    expect(projectUpdates.trySetFirstStage).toHaveBeenCalledWith(entity, newStage)
    assertNotified(entity, [L_Interaction.EntityMovedFromStage, "mock stage 3"], false)
  })

  test("create at lower stage can handle immediate upgrade", () => {
    const { luaEntity, entity } = addEntity(3)
    userActions.onEntityCreated(luaEntity, 1, playerIndex)

    // assert.equal(luaEntity, wp().getWorldEntity(entity,1))
    expect(projectUpdates.trySetFirstStage).toHaveBeenCalledWith(entity, 1)
    assertNotified(entity, [L_Interaction.EntityMovedFromStage, "mock stage 3"], false)
  })

  test.each([1, 2, 3])(
    "on a settings-remnant at stage (%d) sets entity and calls tryReviveSettingsRemnant",
    (newStage) => {
      const { luaEntity, entity } = addEntity(2)
      entity._asMut().isSettingsRemnant = true

      projectUpdates.tryReviveSettingsRemnant.invokes(() => {
        return StageMoveResult.Updated
      })

      userActions.onEntityCreated(luaEntity, newStage, playerIndex)
      expect(wp().getWorldEntity(entity, newStage)).toBe(luaEntity)
      expect(projectUpdates.tryReviveSettingsRemnant).toHaveBeenCalledWith(entity, newStage)
    },
  )

  test("if cannot revive settings remnant, notifies and destroys", () => {
    const { luaEntity, entity } = addEntity(2)
    entity._asMut().isSettingsRemnant = true

    projectUpdates.tryReviveSettingsRemnant.invokes(() => {
      return StageMoveResult.IntersectsAnotherEntity
    })

    userActions.onEntityCreated(luaEntity, 3, playerIndex)

    expect(worldUpdates.refreshWorldEntityAtStage).toHaveBeenCalledWith(entity, 3)
    assertNotified(entity, [L_Interaction.MoveWillIntersectAnotherEntity], true)

    expectedNumCalls = 2
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
      userActions.onEntityCreated(luaEntity2, stage, playerIndex)
      expect(projectUpdates.addNewEntity).toHaveBeenCalledWith(luaEntity2, stage)
    },
  )

  test("if building at earlier stage with different direction, rotates", () => {
    const entity1 = addEntity(2, {
      name: "transport-belt",
      direction: defines.direction.east,
    })
    const luaEntity2 = createWorldEntity(1, {
      name: "transport-belt",
      direction: defines.direction.north,
    })
    userActions.onEntityCreated(luaEntity2, 1, playerIndex)
    assertNotified(entity1.entity, [L_Interaction.EntityMovedFromStage, "mock stage 2"], false)

    expectedNumCalls = 1
  })

  test("can undo overbuilding preview", () => {
    const { luaEntity, entity } = addEntity(3)
    const undoAction = userActions.onEntityCreated(luaEntity, 2, playerIndex)
    expect(undoAction).not.toBeNil()
    ignoreNotification()

    performUndoAction(undoAction!)
    expect(projectUpdates.trySetFirstStage).toHaveBeenCalledWith(entity, 3)
    assertNotified(entity, [L_Interaction.EntityMovedBackToStage, "mock stage 3"], false)

    expectedNumCalls = 2
  })

  test("can still undo after being deleted and re-added", () => {
    const { luaEntity, entity } = addEntity(3)
    const undoAction = userActions.onEntityCreated(luaEntity, 2, playerIndex)
    expect(undoAction).not.toBeNil()
    ignoreNotification()

    project.content.deleteEntity(entity)

    const { entity: entity2 } = addEntity(2)
    performUndoAction(undoAction!)
    expect(projectUpdates.trySetFirstStage).toHaveBeenCalledWith(entity2, 3)
    assertNotified(entity2, [L_Interaction.EntityMovedBackToStage, "mock stage 3"], false)

    expectedNumCalls = 2
  })

  test("does not do undo action if not same first layer", () => {
    const { luaEntity, entity } = addEntity(3)
    const undoAction = userActions.onEntityCreated(luaEntity, 2, playerIndex)
    expect(undoAction).not.toBeNil()
    expect(projectUpdates.trySetFirstStage).toHaveBeenCalledTimes(1)
    ignoreNotification()

    project.content.deleteEntity(entity)

    addEntity(3)
    performUndoAction(undoAction!)
    expect(projectUpdates.trySetFirstStage).toHaveBeenCalledTimes(1)
  })
})

describe("onEntityDeleted()", () => {
  test("if entity not in project, does nothing", () => {
    const luaEntity = createWorldEntity(2)
    userActions.onEntityDeleted(luaEntity, 2)
    expectedNumCalls = 0
  })

  // Functionality moved to project-updates.ts...
  // test("in a lower stage does nothing (bug)", () => {
  //   addEntity(2)
  //   const luaEntity = createWorldEntity(1)
  //   userActions.onEntityDeleted(luaEntity, 1, playerIndex)
  //   expectedNumCalls = 1
  // })
  //
  // test("in a higher stage calls disallowEntityDeletion", () => {
  //   const { luaEntity, entity } = addEntity(2)
  //   userActions.onEntityDeleted(luaEntity, 3, playerIndex)
  //   expect(worldUpdates.rebuildWorldEntityAtStage).toHaveBeenCalledWith(entity, 3)
  // })
  //
  // test("in same stage calls deleteEntityOrCreateSettingsRemnant", () => {
  //   const { luaEntity, entity } = addEntity(2)
  //   userActions.onEntityDeleted(luaEntity, 2, playerIndex)
  //   expect(projectUpdates.deleteEntityOrCreateSettingsRemnant).toHaveBeenCalledWith(entity)
  // })
})

test("onEntityDied calls clearEntityAtStage", () => {
  const { luaEntity, entity } = addEntity(2)
  userActions.onEntityDied(luaEntity, 2)
  expect(worldUpdates.clearWorldEntityAtStage).toHaveBeenCalledWith(entity, 2)
})

const resultMessages: Array<[EntityUpdateResult, string | false]> = [
  [EntityUpdateResult.NoChange, false],
  [EntityUpdateResult.Updated, false],
  [EntityUpdateResult.CannotRotate, L_Game.CantBeRotated],
  [EntityUpdateResult.CannotUpgradeChangedPair, L_Interaction.CannotUpgradeUndergroundChangedPair],
]

describe("onEntityPossiblyUpdated()", () => {
  test("if not in project, adds entity", () => {
    const luaEntity = createWorldEntity(2)
    userActions.onEntityPossiblyUpdated(luaEntity, 2, nil, playerIndex)
    expect(projectUpdates.addNewEntity).toHaveBeenCalledWith(luaEntity, 2)
  })

  test("if is in project at higher stage, defaults to overbuild behavior", () => {
    const { luaEntity, entity } = addEntity(3)
    userActions.onEntityPossiblyUpdated(luaEntity, 2, nil, playerIndex, nil)
    expect(projectUpdates.trySetFirstStage).toHaveBeenCalledWith(entity, 2)
    assertNotified(entity, [L_Interaction.EntityMovedFromStage, "mock stage 3"], false)
  })

  test.each(resultMessages)('calls tryUpdateEntityFromWorld and notifies, with result "%s"', (result, message) => {
    const { luaEntity, entity } = addEntity(2)
    projectUpdates.tryUpdateEntityFromWorld.returns(result)
    userActions.onEntityPossiblyUpdated(luaEntity, 2, nil, playerIndex)

    expect(projectUpdates.tryUpdateEntityFromWorld).toHaveBeenCalledWith(entity, 2)
    if (message) assertNotified(entity, [message], true)
  })

  test("works with upgrade-compatible entity (fast-replace)", () => {
    const { luaEntity, entity } = addEntity(2)
    projectUpdates.tryUpdateEntityFromWorld.invokes(() => {
      return EntityUpdateResult.Updated
    })
    luaEntity.destroy()
    const luaEntity2 = createWorldEntity(2, { name: "bulk-inserter" })
    userActions.onEntityPossiblyUpdated(luaEntity2, 2, nil, playerIndex)

    expect(projectUpdates.tryUpdateEntityFromWorld).toHaveBeenCalledWith(entity, 2)
  })

  test("works with upgrade-compatible entity (fast-replace) with different direction", () => {
    const { luaEntity, entity } = addEntity(2)
    projectUpdates.tryUpdateEntityFromWorld.returns(EntityUpdateResult.Updated)
    const oldDirection = luaEntity.direction
    luaEntity.destroy()
    const luaEntity2 = createWorldEntity(2, { name: "bulk-inserter", direction: defines.direction.south })
    userActions.onEntityPossiblyUpdated(luaEntity2, 2, oldDirection, playerIndex)

    expect(projectUpdates.tryUpdateEntityFromWorld).toHaveBeenCalledWith(entity, 2)
  })

  test("calls setValueFromStagedInfo if stagedInfo supplied", () => {
    const { luaEntity, entity } = addEntity(2)
    const stagedInfo: StageInfoExport<any> = {
      firstStage: 1,
      lastStage: nil,
      firstValue: { foo: "bar" },
    }
    userActions.onEntityPossiblyUpdated(luaEntity, 2, nil, playerIndex, stagedInfo)
    expect(projectUpdates.setValueFromStagedInfo).toHaveBeenCalledWith(entity, stagedInfo, nil, luaEntity)
  })
})

describe("onEntityRotated()", () => {
  test("if not in project, defaults to add behavior", () => {
    const luaEntity = createWorldEntity(2)
    userActions.onEntityRotated(luaEntity, 2, luaEntity.direction, playerIndex)
    expect(projectUpdates.addNewEntity).toHaveBeenCalledWith(luaEntity, 2)
  })

  test.each<[EntityUpdateResult, string | false]>([
    [EntityUpdateResult.NoChange, false],
    [EntityUpdateResult.Updated, false],
    [EntityUpdateResult.CannotRotate, L_Game.CantBeRotated],
  ])('calls tryRotateEntityFromWorld and notifies, with result "%s"', (result, message) => {
    const { luaEntity, entity } = addEntity(2)
    projectUpdates.tryRotateEntityFromWorld.invokes(() => {
      return result
    })
    userActions.onEntityRotated(luaEntity, 2, luaEntity.direction, playerIndex)

    expect(projectUpdates.tryRotateEntityFromWorld).toHaveBeenCalledWith(entity, 2)
    if (message) assertNotified(entity, [message], true)
  })
})

test("onUndergroundBeltDragRotated", () => {
  const { luaEntity, entity } = addEntity(2, {
    name: "underground-belt",
    type: "input",
  })
  projectUpdates.tryRotateEntityFromWorld.invokes(() => {
    return EntityUpdateResult.Updated
  })
  userActions.onUndergroundBeltDragRotated(luaEntity, 2, playerIndex)
  expect(luaEntity.direction).toBe(defines.direction.south)
  expect(projectUpdates.tryRotateEntityFromWorld).toHaveBeenCalledWith(entity, 2)
})

describe("onEntityMarkedForUpgrade()", () => {
  test("if not in project, defaults to add behavior", () => {
    const luaEntity = createWorldEntity(2)
    userActions.onEntityMarkedForUpgrade(luaEntity, 2, playerIndex)
    expect(projectUpdates.addNewEntity).toHaveBeenCalledWith(luaEntity, 2)
  })

  test.each(resultMessages)('calls tryUpgradeEntityFromWorld and notifies, with result "%s"', (result, message) => {
    const { luaEntity, entity } = addEntity(2)
    projectUpdates.tryUpgradeEntityFromWorld.invokes(() => {
      return result
    })
    userActions.onEntityMarkedForUpgrade(luaEntity, 2, playerIndex)

    expect(projectUpdates.tryUpgradeEntityFromWorld).toHaveBeenCalledWith(entity, 2)
    if (message) assertNotified(entity, [message], true)
  })
})

describe("onWiresPossiblyUpdated()", () => {
  test("if not in project, defaults to add behavior", () => {
    const luaEntity = createWorldEntity(2)
    userActions.onWiresPossiblyUpdated(luaEntity, 2, playerIndex)
  })

  test.each<[WireUpdateResult, string | false]>([
    [WireUpdateResult.NoChange, false],
    [WireUpdateResult.Updated, false],
  ])('calls updateWiresFromWorld and notifies, with result "%s"', (result, message) => {
    const { luaEntity, entity } = addEntity(2)
    projectUpdates.updateWiresFromWorld.invokes(() => {
      return result
    })
    userActions.onWiresPossiblyUpdated(luaEntity, 2, playerIndex)

    expect(projectUpdates.updateWiresFromWorld).toHaveBeenCalledWith(entity, 2)
    if (message) assertNotified(entity, [message], true)
  })
})

function createPreview(luaEntity: LuaEntity) {
  return createPreviewEntity(
    luaEntity.surface,
    luaEntity.position,
    luaEntity.direction,
    Prototypes.PreviewEntityPrefix + luaEntity.name,
  )!
}

describe("onCleanupToolUsed()", () => {
  test("if not in project, does nothing", () => {
    const luaEntity = createWorldEntity(2)
    userActions.onCleanupToolUsed(luaEntity, 2)
    expectedNumCalls = 0
  })

  test("if is settings remnant, calls forceDeleteEntity", () => {
    const { luaEntity, entity } = addEntity(2)
    entity._asMut().isSettingsRemnant = true
    userActions.onCleanupToolUsed(createPreview(luaEntity), 2)
    expect(projectUpdates.forceDeleteEntity).toHaveBeenCalledWith(entity)
  })

  test("if does not have error, does nothing", () => {
    const { luaEntity, entity } = addEntity(1)
    wp().replaceWorldOrPreviewEntity(entity, 1, luaEntity)
    expect(wp().hasErrorAt(entity, 1)).toBe(false)
    userActions.onCleanupToolUsed(luaEntity, 1)
    expectedNumCalls = 0
  })

  test.each([2, 3])("if is in stage %s, calls refreshAllWorldEntities", (atStage) => {
    const { luaEntity, entity } = addEntity(2)
    userActions.onCleanupToolUsed(createPreview(luaEntity), atStage)
    expect(worldUpdates.refreshAllWorldEntities).toHaveBeenCalledWith(entity)
  })
})

test("onEntityForceDeleted calls forceDeleteEntity", () => {
  const { luaEntity, entity } = addEntity(2)
  const undoAction = userActions.onEntityForceDeleteUsed(createPreview(luaEntity), 2, 1 as PlayerIndex)
  expect(projectUpdates.forceDeleteEntity).toHaveBeenCalledWith(entity)
  expect(undoAction).not.toBeNil()

  performUndoAction(undoAction!)
  expect(projectUpdates.readdDeletedEntity).toHaveBeenCalledWith(entity)

  expectedNumCalls = 2
})

describe("onMoveEntityToStageCustomInput()", () => {
  test("if not in project, does nothing", () => {
    const luaEntity = createWorldEntity(2)
    const undoAction = userActions.onMoveEntityToStageCustomInput(luaEntity, 2, playerIndex)
    expectedNumCalls = 0
    expect(undoAction).toBeNil()
  })
  test("if is settings remnant, does nothing", () => {
    const { luaEntity, entity } = addEntity(2)
    entity._asMut().isSettingsRemnant = true
    const undoAction = userActions.onMoveEntityToStageCustomInput(createPreview(luaEntity), 2, playerIndex)
    expectedNumCalls = 0

    expect(undoAction).toBeNil()
  })
  test.each<[StageMoveResult, LocalisedString | false]>([
    [StageMoveResult.Updated, [L_Interaction.EntityMovedFromStage, "mock stage 3"]],
    [StageMoveResult.NoChange, [L_Interaction.AlreadyAtFirstStage]],
    [StageMoveResult.IntersectsAnotherEntity, [L_Interaction.MoveWillIntersectAnotherEntity]],
    [StageMoveResult.CannotMovePastLastStage, [L_Interaction.CannotMovePastLastStage]],
  ])('calls trySetFirstStage and notifies, with result "%s"', (result, message) => {
    const { luaEntity, entity } = addEntity(3)
    projectUpdates.trySetFirstStage.invokes((entity, stage) => {
      entity._asMut().setFirstStageUnchecked(stage)
      return result
    })
    const undoAction = userActions.onMoveEntityToStageCustomInput(luaEntity, 2, playerIndex)

    expect(projectUpdates.trySetFirstStage).toHaveBeenCalledWith(entity, 2)
    if (message) assertNotified(entity, message, result != "updated")

    if (result == "updated") {
      expect(undoAction).not.toBeNil()

      performUndoAction(undoAction!)
      expect(projectUpdates.trySetFirstStage).toHaveBeenCalledWith(entity, 3)
      assertNotified(entity, [L_Interaction.EntityMovedBackToStage, "mock stage 3"], false)

      expectedNumCalls = 2
    }
  })
})
describe("onSendToStageUsed()", () => {
  test("calls trySetFirstStage and notifies if sent down", () => {
    const { luaEntity, entity } = addEntity(2)
    wp().replaceWorldOrPreviewEntity(entity, 2, luaEntity)
    const undoAction = userActions.onSendToStageUsed(luaEntity, 2, 1, true, playerIndex)

    assertIndicatorCreated(entity, "<<")
    expect(projectUpdates.trySetFirstStage).toHaveBeenCalledWith(entity, 1)
    expect(undoAction).not.toBeNil()

    performUndoAction(undoAction!)
    expect(projectUpdates.trySetFirstStage).toHaveBeenCalledWith(entity, 2)
    assertIndicatorCreated(entity, ">>")

    expectedNumCalls = 2
  })
  test("calls trySetFirstStage and does not notify if sent up", () => {
    const { luaEntity, entity } = addEntity(2)
    wp().replaceWorldOrPreviewEntity(entity, 2, luaEntity)
    const undoAction = userActions.onSendToStageUsed(luaEntity, 2, 3, true, playerIndex)

    expect(notifications.createIndicator).not.toHaveBeenCalled()
    expect(projectUpdates.trySetFirstStage).toHaveBeenCalledWith(entity, 3)
    expect(undoAction).not.toBeNil()

    performUndoAction(undoAction!)
    expect(projectUpdates.trySetFirstStage).toHaveBeenCalledWith(entity, 2)

    expectedNumCalls = 2
  })
  test("ignores if not in current stage", () => {
    const { entity, luaEntity } = addEntity(2)
    wp().replaceWorldOrPreviewEntity(entity, 2, luaEntity)
    const undoAction = userActions.onSendToStageUsed(luaEntity, 3, 1, true, playerIndex)

    expect(projectUpdates.trySetFirstStage).not.toHaveBeenCalled()
    expect(undoAction).toBeNil()
    expectedNumCalls = 0
  })
  test("allows not in current stage if onlyIfMatchesFirstSTage is false", () => {
    const { entity, luaEntity } = addEntity(2)
    wp().replaceWorldOrPreviewEntity(entity, 3, luaEntity)
    const undoAction = userActions.onSendToStageUsed(luaEntity, 3, 1, false, playerIndex)

    expect(projectUpdates.trySetFirstStage).toHaveBeenCalledWith(entity, 1)
    expect(undoAction).not.toBeNil()
    assertIndicatorCreated(entity, "<<")

    performUndoAction(undoAction!)

    expect(projectUpdates.trySetFirstStage).toHaveBeenCalledWith(entity, 3)
    assertIndicatorCreated(entity, ">>")

    expectedNumCalls = 2
  })
  test.each<[StageMoveResult, LocalisedString]>([
    [StageMoveResult.CannotMovePastLastStage, [L_Interaction.CannotMovePastLastStage]],
    [StageMoveResult.IntersectsAnotherEntity, [L_Interaction.MoveWillIntersectAnotherEntity]],
  ])("notifies error if cannot move to stage %s", (result, message) => {
    const { entity, luaEntity } = addEntity(2)
    wp().replaceWorldOrPreviewEntity(entity, 2, luaEntity)
    projectUpdates.trySetFirstStage.returns(result)
    userActions.onSendToStageUsed(luaEntity, 2, 3, true, playerIndex)
    expect(projectUpdates.trySetFirstStage).toHaveBeenCalledWith(entity, 3)
    assertNotified(entity, message, true)
  })
})
describe("onBringToStageUsed()", () => {
  test("calls trySetFirstStage when moved, and notifies if sent up", () => {
    const { luaEntity, entity } = addEntity(2)
    wp().replaceWorldOrPreviewEntity(entity, 2, luaEntity)
    const undoAction = userActions.onBringToStageUsed(luaEntity, 3, playerIndex)

    assertIndicatorCreated(entity, ">>")
    expect(projectUpdates.trySetFirstStage).toHaveBeenCalledWith(entity, 3)
    expect(undoAction).not.toBeNil()

    performUndoAction(undoAction!)
    expect(projectUpdates.trySetFirstStage).toHaveBeenCalledWith(entity, 2)
    assertIndicatorCreated(entity, "<<")

    expectedNumCalls = 2
  })
  test("calls trySetFirstStage and does not notify if sent down", () => {
    const { luaEntity, entity } = addEntity(2)
    wp().replaceWorldOrPreviewEntity(entity, 2, luaEntity)
    const undoAction = userActions.onBringToStageUsed(luaEntity, 1, playerIndex)!

    expect(notifications.createIndicator).not.toHaveBeenCalled()
    expect(projectUpdates.trySetFirstStage).toHaveBeenCalledWith(entity, 1)
    expect(undoAction).not.toBeNil()

    performUndoAction(undoAction)
    expect(projectUpdates.trySetFirstStage).toHaveBeenCalledWith(entity, 2)

    expectedNumCalls = 2
  })
  test("ignores if called at same stage", () => {
    const { entity, luaEntity } = addEntity(2)
    wp().replaceWorldOrPreviewEntity(entity, 2, luaEntity)
    const undoAction = userActions.onBringToStageUsed(luaEntity, 2, playerIndex)

    expect(projectUpdates.trySetFirstStage).not.toHaveBeenCalled()
    expect(undoAction).toBeNil()

    expectedNumCalls = 0
  })

  test.each<[StageMoveResult, LocalisedString]>([
    [StageMoveResult.CannotMovePastLastStage, [L_Interaction.CannotMovePastLastStage]],
    [StageMoveResult.IntersectsAnotherEntity, [L_Interaction.MoveWillIntersectAnotherEntity]],
  ])("notifies error if cannot move to stage %s", (result, message) => {
    const { entity, luaEntity } = addEntity(2)
    wp().replaceWorldOrPreviewEntity(entity, 2, luaEntity)
    projectUpdates.trySetFirstStage.returns(result)
    userActions.onBringToStageUsed(luaEntity, 3, playerIndex)
    expect(projectUpdates.trySetFirstStage).toHaveBeenCalledWith(entity, 3)
    assertNotified(entity, message, true)
  })
})

describe("onBringDownToStageUsed()", () => {
  test("works for entity in higher stage", () => {
    const { luaEntity, entity } = addEntity(3)
    wp().replaceWorldOrPreviewEntity(entity, 3, luaEntity)
    const undoAction = userActions.onBringDownToStageUsed(luaEntity, 2, playerIndex)!

    expect(notifications.createIndicator).not.toHaveBeenCalled()
    expect(projectUpdates.trySetFirstStage).toHaveBeenCalledWith(entity, 2)
    expect(undoAction).not.toBeNil()

    performUndoAction(undoAction)
    expect(projectUpdates.trySetFirstStage).toHaveBeenCalledWith(entity, 3)

    expectedNumCalls = 2
  })

  test("ignores for entities in lower stage", () => {
    const { luaEntity, entity } = addEntity(1)
    wp().replaceWorldOrPreviewEntity(entity, 1, luaEntity)
    const undoAction = userActions.onBringDownToStageUsed(luaEntity, 2, playerIndex)

    expect(projectUpdates.trySetFirstStage).not.toHaveBeenCalled()
    expect(undoAction).toBeNil()

    expectedNumCalls = 0
  })
})
describe("onStageDeleteUsed()", () => {
  after_each(() => {
    getPlayer().mod_settings[Settings.DeleteAtNextStage] = { value: false }
  })

  test.each<[boolean, number]>([
    [false, 2],
    [true, 3],
  ])("sets last stage correctly (isReverseSelect=%s, deleteAtNextStage=false)", (isReverseSelect, expectedStage) => {
    const { entity, luaEntity } = addEntity(2)
    wp().replaceWorldOrPreviewEntity(entity, 2, luaEntity)
    const undoAction = isReverseSelect
      ? userActions.onStageDeleteReverseUsed(luaEntity, 3, playerIndex)
      : userActions.onStageDeleteUsed(luaEntity, 3, playerIndex)
    expect(projectUpdates.trySetLastStage).toHaveBeenCalledWith(entity, expectedStage)

    expect(undoAction).not.toBeNil()
    performUndoAction(undoAction!)
    expect(projectUpdates.trySetLastStage).toHaveBeenCalledWith(entity, nil)

    expectedNumCalls = 2
  })

  test.each<[boolean, number]>([
    [false, 3],
    [true, 2],
  ])("sets last stage correctly (isReverseSelect=%s, deleteAtNextStage=true)", (isReverseSelect, expectedStage) => {
    const { entity, luaEntity } = addEntity(2)
    wp().replaceWorldOrPreviewEntity(entity, 2, luaEntity)
    getPlayer().mod_settings[Settings.DeleteAtNextStage] = { value: true }
    const undoAction = isReverseSelect
      ? userActions.onStageDeleteReverseUsed(luaEntity, 3, playerIndex)
      : userActions.onStageDeleteUsed(luaEntity, 3, playerIndex)
    expect(projectUpdates.trySetLastStage).toHaveBeenCalledWith(entity, expectedStage)

    expect(undoAction).not.toBeNil()
    performUndoAction(undoAction!)
    expect(projectUpdates.trySetLastStage).toHaveBeenCalledWith(entity, nil)

    expectedNumCalls = 2
  })

  test("can set stage to lower than existing", () => {
    const { entity, luaEntity } = addEntity(2)
    wp().replaceWorldOrPreviewEntity(entity, 2, luaEntity)
    entity._asMut().setLastStageUnchecked(3)
    const undoAction = userActions.onStageDeleteUsed(luaEntity, 3, playerIndex)
    expect(projectUpdates.trySetLastStage).toHaveBeenCalledWith(entity, 2)

    expect(undoAction).not.toBeNil()
    performUndoAction(undoAction!)
    expect(projectUpdates.trySetLastStage).toHaveBeenCalledWith(entity, 3)

    expectedNumCalls = 2
  })

  test("notifies if error", () => {
    const { entity, luaEntity } = addEntity(2)
    wp().replaceWorldOrPreviewEntity(entity, 2, luaEntity)
    projectUpdates.trySetLastStage.returns(StageMoveResult.CannotMoveBeforeFirstStage)
    const undoAction = userActions.onStageDeleteUsed(luaEntity, 3, playerIndex)
    expect(projectUpdates.trySetLastStage).toHaveBeenCalledWith(entity, 2)
    assertNotified(entity, [L_Interaction.CannotDeleteBeforeFirstStage], true)

    expect(undoAction).toBeNil()
  })
})

describe("onStageDeleteCancelUsed()", () => {
  test("can clear last stage", () => {
    const { entity, luaEntity } = addEntity(2)
    wp().replaceWorldOrPreviewEntity(entity, 2, luaEntity)
    entity._asMut().setLastStageUnchecked(2)
    const undoAction = userActions.onStageDeleteCancelUsed(luaEntity, 2, playerIndex)

    expect(projectUpdates.trySetLastStage).toHaveBeenCalledWith(entity, nil)

    expect(undoAction).not.toBeNil()
    performUndoAction(undoAction!)
    expect(projectUpdates.trySetLastStage).toHaveBeenCalledWith(entity, 2)

    expectedNumCalls = 2
  })

  test("notifies if error", () => {
    const { entity, luaEntity } = addEntity(2)
    wp().replaceWorldOrPreviewEntity(entity, 2, luaEntity)
    entity._asMut().setLastStageUnchecked(2)
    projectUpdates.trySetLastStage.returns(StageMoveResult.IntersectsAnotherEntity)
    const undoAction = userActions.onStageDeleteCancelUsed(luaEntity, 2, playerIndex)

    expect(projectUpdates.trySetLastStage).toHaveBeenCalledWith(entity, nil)
    assertNotified(entity, [L_Interaction.MoveWillIntersectAnotherEntity], true)
    expect(undoAction).toBeNil()
  })

  test("ignores if selected stage is not entity's last stage", () => {
    const { entity, luaEntity } = addEntity(2)
    wp().replaceWorldOrPreviewEntity(entity, 2, luaEntity)
    entity._asMut().setLastStageUnchecked(2)

    const undoAction = userActions.onStageDeleteCancelUsed(luaEntity, 1, playerIndex)
    expect(projectUpdates.trySetLastStage).not.toHaveBeenCalled()
    expectedNumCalls = 0

    expect(undoAction).toBeNil()
  })
})

describe("on surface cleared", () => {
  test("rebuilds all entities with previews", () => {
    const { entity } = addEntity(2)
    userActions.onSurfaceCleared(2)
    expect(worldUpdates.clearWorldEntityAtStage).toHaveBeenCalledWith(entity, 2)
  })
})

describe("tiles", () => {
  describe("onTileBuilt", () => {
    const position = { x: 1, y: 1 }

    test("creates new tile with blueprintable tile", () => {
      userActions.onTileBuilt(position, "concrete", 2)

      expect(projectUpdates.setTileAtStage).toHaveBeenCalledWith(position, 2, "concrete")
      expectedNumCalls = 1
    })

    test("sets nil for non-blueprintable tile", () => {
      userActions.onTileBuilt(position, "out-of-map", 2)

      expect(projectUpdates.setTileAtStage).toHaveBeenCalledWith(position, 2, nil)
      expectedNumCalls = 1
    })
  })

  describe("onTileMined", () => {
    const position = { x: 1, y: 1 }

    test("sets tile to nil at mined stage", () => {
      const tile = createProjectTile()
      tile.setTileAtStage(1, "concrete")
      project.content.setTile(position, tile)

      userActions.onTileMined(position, 3)

      expect(projectUpdates.setTileAtStage).toHaveBeenCalledWith(position, 3, nil)
      expectedNumCalls = 1
    })
  })
})
