// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { BlueprintEntity, LuaEntity, LuaPlayer, LuaSurface, SurfaceCreateEntity, UnitNumber } from "factorio:runtime"
import expect from "tstl-expect"
import { oppositedirection } from "util"
import { Prototypes } from "../../constants"
import { Entity, LuaEntityInfo } from "../../entity/Entity"
import { ProjectEntity, StageNumber } from "../../entity/ProjectEntity"
import { isPreviewEntity } from "../../entity/prototype-info"
import { canBeAnyDirection, saveEntity } from "../../entity/save-load"
import { assert } from "../../lib"
import { Position, Pos } from "../../lib/geometry"
import { checkForEntityUpdates } from "../../project/event-handlers"
import { UserProject } from "../../project/ProjectDef"
import { _deleteAllProjects, createUserProject } from "../../project/UserProject"
import {
  assertConfigChangedHighlightsCorrect,
  assertErrorHighlightsCorrect,
  assertItemRequestHighlightsCorrect,
  assertLastStageHighlightCorrect,
  assertNoHighlightsAfterLastStage,
} from "../project/entity-highlight-test-util"
import { createWorldPresentationQueries, TestWorldQueries } from "./test-world-queries"

export { TestWorldQueries } from "./test-world-queries"

export type Pipeline = "old" | "new"

export function describeDualPipeline(name: string, fn: (pipeline: Pipeline) => void): void {
  describe.each<[Pipeline]>([["old"], ["new"]])(`${name} (%s pipeline)`, (pipeline) => fn(pipeline))
}

export interface TestWorldOps {
  rebuildStage(stage: StageNumber): void
  rebuildAllStages(): void
  refreshEntity(entity: ProjectEntity, stage: StageNumber): void
  refreshAllEntities(entity: ProjectEntity): void
  rebuildEntity(entity: ProjectEntity, stage: StageNumber): void
  updateWorldEntities(entity: ProjectEntity, stage: StageNumber): void
  updateAllHighlights(entity: ProjectEntity): void
  resyncWithWorld(): void
}

export interface TestProjectOps {
  resetProp<T extends Entity>(entity: ProjectEntity<T>, stage: StageNumber, prop: keyof T): boolean
  movePropDown<T extends Entity>(entity: ProjectEntity<T>, stage: StageNumber, prop: keyof T): boolean
  resetAllProps(entity: ProjectEntity, stage: StageNumber): boolean
  moveAllPropsDown(entity: ProjectEntity, stage: StageNumber): boolean
  setTileAtStage(position: Position, stage: StageNumber, value: string | nil): void
  deleteTile(position: Position): boolean
  trySetLastStage(
    entity: ProjectEntity,
    stage: StageNumber | nil,
  ): import("../../project/project-updates").StageMoveResult
  trySetFirstStage(entity: ProjectEntity, stage: StageNumber): import("../../project/project-updates").StageMoveResult
  addNewEntity(entity: LuaEntity, stage: StageNumber): ProjectEntity | nil
  deleteEntityOrCreateSettingsRemnant(entity: ProjectEntity): void
  tryReviveSettingsRemnant(
    entity: ProjectEntity,
    stage: StageNumber,
  ): import("../../project/project-updates").StageMoveResult
}

export function createOldPipelineProjectOps(project: UserProject): TestProjectOps {
  return {
    resetProp: (entity, stage, prop) => project.updates.resetProp(entity, stage, prop),
    movePropDown: (entity, stage, prop) => project.updates.movePropDown(entity, stage, prop),
    resetAllProps: (entity, stage) => project.updates.resetAllProps(entity, stage),
    moveAllPropsDown: (entity, stage) => project.updates.moveAllPropsDown(entity, stage),
    setTileAtStage: (position, stage, value) => project.updates.setTileAtStage(position, stage, value),
    deleteTile: (position) => project.updates.deleteTile(position),
    trySetLastStage: (entity, stage) => project.updates.trySetLastStage(entity, stage),
    trySetFirstStage: (entity, stage) => project.updates.trySetFirstStage(entity, stage),
    addNewEntity: (entity, stage) => project.updates.addNewEntity(entity, stage),
    deleteEntityOrCreateSettingsRemnant: (entity) => project.updates.deleteEntityOrCreateSettingsRemnant(entity),
    tryReviveSettingsRemnant: (entity, stage) => project.updates.tryReviveSettingsRemnant(entity, stage),
  }
}

export function applyDiffViaWorld(
  worldQueries: TestWorldQueries,
  entity: ProjectEntity,
  stage: StageNumber,
  applyFn: (worldEntity: LuaEntity) => void,
): void {
  const worldEntity = worldQueries.getWorldEntity(entity, stage)
  assert(worldEntity, "world entity must exist at stage")
  applyFn(worldEntity)
  checkForEntityUpdates(worldEntity, nil)
}

export function assertEntityCorrect(
  project: UserProject,
  entity: ProjectEntity,
  expectError: number | false,
  wq: TestWorldQueries,
): void {
  expect(entity.isSettingsRemnant).toBeFalsy()
  const found = project.content.findCompatibleEntity(entity.firstValue.name, entity.position, entity.direction, 1)
  expect(found).toBe(entity)

  let hasError: number | false = false
  for (const stage of $range(1, project.lastStageFor(entity))) {
    const worldEntity = wq.getWorldOrPreviewEntity(entity, stage)!
    assert(worldEntity, `entity does not exist at stage ${stage}`)
    const isPreview = isPreviewEntity(worldEntity)
    const value = entity.getValueAtStage(stage)
    if (value == nil) {
      assert(isPreview, `entity must be preview at stage ${stage}`)
    } else if (isPreview) {
      assert(wq.hasErrorAt(entity, stage), `entity must have error at stage ${stage} to be preview`)
      hasError ||= stage
    } else if (wq.hasErrorAt(entity, stage)) {
      assert(
        worldEntity.type == "underground-belt",
        "Only underground belt currently can have error with existing entity",
      )
      assert(entity.isUndergroundBelt())
      hasError ||= stage
      const type = worldEntity.belt_to_ground_type
      const oppositeType = type == "input" ? "output" : "input"
      expect(entity.direction).toBe(oppositedirection(worldEntity.direction))
      expect(entity.firstValue.type).toBe(oppositeType)
    } else {
      const [savedValue, savedUnstagedValue] = saveEntity(worldEntity)
      expect(savedValue).toEqual(value)
      expect(savedUnstagedValue).toEqual(entity.getUnstagedValue(stage))
      if (!canBeAnyDirection(worldEntity)) {
        expect(worldEntity.direction).toBe(entity.direction)
      }
    }
    if (isPreview) {
      expect(worldEntity.name).toBe(Prototypes.PreviewEntityPrefix + (value ?? entity.firstValue).name)
    }
    expect(worldEntity.position).comment(`preview at stage ${stage}`).toEqual(entity.position)
    if (isPreview) {
      expect(worldEntity.direction).toEqual(entity.getPreviewDirection())
    } else if (entity.isUndergroundBelt() && wq.hasErrorAt(entity, stage)) {
      expect(worldEntity.direction).toEqual(oppositedirection(entity.direction))
    } else if (!canBeAnyDirection(worldEntity)) {
      expect(worldEntity.direction).toEqual(entity.direction)
    }

    expect(wq.getExtraEntity(entity, "settingsRemnantHighlight", stage)).toBeNil()
  }

  expect(hasError).toBe(expectError)

  for (const stage of $range(project.lastStageFor(entity) + 1, project.settings.stageCount())) {
    expect(wq.getWorldOrPreviewEntity(entity, stage)).toBeNil()
  }

  assertErrorHighlightsCorrect(entity, project.lastStageFor(entity), wq)
  assertConfigChangedHighlightsCorrect(entity, project.lastStageFor(entity), wq)
  assertLastStageHighlightCorrect(entity, wq)
  assertNoHighlightsAfterLastStage(entity, project.settings.stageCount(), wq)
  assertItemRequestHighlightsCorrect(entity, project.lastStageFor(entity), wq)

  const wireConnections = entity.wireConnections
  if (!wireConnections) {
    for (const stage of $range(entity.firstStage, project.lastStageFor(entity))) {
      const worldEntity = wq.getWorldEntity(entity, stage)
      if (!worldEntity) continue
      for (const [, connectionPoint] of pairs(worldEntity.get_wire_connectors(false))) {
        expect(connectionPoint.connection_count).toBe(0)
      }
    }
  } else {
    for (const stage of $range(entity.firstStage, project.lastStageFor(entity))) {
      const thisWorldEntity = wq.getWorldEntity(entity, stage)
      if (!thisWorldEntity) continue

      const expectedConnections = Object.entries(wireConnections).flatMap(([otherEntity, connections]) => {
        const otherWorldEntity = wq.getWorldEntity(otherEntity, stage)
        if (!otherWorldEntity) return []
        return Object.keys(connections).map((connection) => ({
          toId: connection.toId,
          entities: newLuaSet(thisWorldEntity.unit_number!, otherWorldEntity.unit_number!),
        }))
      })

      const actualConnections: {
        toId: defines.wire_connector_id
        entities: LuaSet<UnitNumber>
      }[] = []
      for (const [, connectionPoint] of pairs(thisWorldEntity.get_wire_connectors(false))) {
        for (const connection of connectionPoint.connections) {
          actualConnections.push({
            toId: connection.target.wire_connector_id,
            entities: newLuaSet(thisWorldEntity.unit_number!, connection.target.owner.unit_number!),
          })
        }
      }
      expectedConnections.sort((a, b) => a.toId - b.toId)
      actualConnections.sort((a, b) => a.toId - b.toId)

      expect(actualConnections).toEqual(expectedConnections)
    }
  }
}

export function assertEntityNotPresent(project: UserProject, entity: ProjectEntity, wq: TestWorldQueries): void {
  const found = project.content.findCompatibleEntity(entity.firstValue.name, entity.position, entity.direction, 1)
  expect(found).toBeNil()

  for (const stage of $range(1, project.lastStageFor(entity))) {
    expect(wq.getWorldOrPreviewEntity(entity, stage)).toBeNil()
  }
  expect(wq.hasAnyExtraEntities(entity, "errorOutline")).toBe(false)
  expect(wq.hasAnyExtraEntities(entity, "errorElsewhereIndicator")).toBe(false)
}

export function assertIsSettingsRemnant(project: UserProject, entity: ProjectEntity, wq: TestWorldQueries): void {
  expect(entity.isSettingsRemnant).toBe(true)
  for (const stage of $range(1, project.lastStageFor(entity))) {
    const preview = wq.getWorldOrPreviewEntity(entity, stage)!
    expect(preview).toBeAny()
    expect(isPreviewEntity(preview)).toBe(true)
    expect(wq.getExtraEntity(entity, "settingsRemnantHighlight", stage)).toBeAny()
  }
  expect(wq.hasAnyExtraEntities(entity, "errorOutline")).toBe(false)
  expect(wq.hasAnyExtraEntities(entity, "errorElsewhereIndicator")).toBe(false)
}

export interface EntityTestContext {
  project: UserProject
  surfaces: LuaSurface[]
  player: LuaPlayer
  worldOps: TestWorldOps
  projectOps: TestProjectOps
  worldQueries: TestWorldQueries
  assertEntityCorrect(entity: ProjectEntity, expectError: number | false): void
  assertEntityNotPresent(entity: ProjectEntity): void
  assertIsSettingsRemnant(entity: ProjectEntity): void
  createEntity(stage: StageNumber, args?: Partial<SurfaceCreateEntity>): LuaEntity
  buildEntity<T extends BlueprintEntity = BlueprintEntity>(
    stage: StageNumber,
    args?: Partial<SurfaceCreateEntity>,
  ): ProjectEntity<T>
}

export function setupEntityIntegrationTest(numStages = 6): EntityTestContext {
  const pos = Pos(10.5, 10.5)
  let defaultName = "inserter"

  const ctx: EntityTestContext = {
    project: nil!,
    surfaces: nil!,
    player: nil!,
    worldOps: nil!,
    projectOps: nil!,
    worldQueries: nil!,
    assertEntityCorrect(entity: ProjectEntity, expectError: number | false) {
      assertEntityCorrect(ctx.project, entity, expectError, ctx.worldQueries)
    },
    assertEntityNotPresent(entity: ProjectEntity) {
      assertEntityNotPresent(ctx.project, entity, ctx.worldQueries)
    },
    assertIsSettingsRemnant(entity: ProjectEntity) {
      assertIsSettingsRemnant(ctx.project, entity, ctx.worldQueries)
    },
    createEntity(stage: StageNumber, args?: Partial<SurfaceCreateEntity>): LuaEntity {
      const params = {
        name: args?.name ?? defaultName ?? error("defaultName not set"),
        position: pos,
        force: "player",
        direction: defines.direction.east,
        ...args,
      }
      const entity = ctx.surfaces[stage - 1].create_entity(params)
      assert(entity, "created entity")
      const proto = prototypes.entity[params.name as string]
      if (proto.type == "inserter") {
        entity.inserter_stack_size_override = 1
        entity.inserter_filter_mode = "whitelist"
      }
      return entity
    },
    buildEntity<T extends BlueprintEntity = BlueprintEntity>(
      stage: StageNumber,
      args?: Partial<SurfaceCreateEntity>,
    ): ProjectEntity<T> {
      const luaEntity = ctx.createEntity(stage, args)
      const saved: LuaEntityInfo = {
        name: luaEntity.name,
        type: luaEntity.type,
        position: luaEntity.position,
        direction: luaEntity.direction,
        belt_to_ground_type: luaEntity.type == "underground-belt" ? luaEntity.belt_to_ground_type : nil,
        surface: luaEntity.surface,
      }
      ctx.project.actions.onEntityCreated(luaEntity, stage, ctx.player.index)
      const queryEntity = luaEntity.valid ? luaEntity : saved
      const entity = ctx.project.content.findCompatibleWithLuaEntity(queryEntity, nil, stage)! as ProjectEntity<T>
      assert(entity)
      expect(entity.firstStage).toBe(stage)
      return entity
    },
  }

  before_each(() => {
    ctx.player?.cursor_stack?.clear()
    ctx.surfaces?.forEach((surface) => {
      surface.find_entities().forEach((e) => e.destroy())
    })
    _deleteAllProjects()
  })

  before_each(() => {
    ctx.project = createUserProject("test", numStages)
    ctx.surfaces = ctx.project.getAllStages().map((stage) => stage.getSurface())
    ctx.player = game.players[1]
    ctx.worldOps = {
      rebuildStage: (stage) => ctx.project.worldUpdates.rebuildStage(stage),
      rebuildAllStages: () => ctx.project.worldUpdates.rebuildAllStages(),
      refreshEntity: (entity, stage) => ctx.project.worldUpdates.refreshWorldEntityAtStage(entity, stage),
      refreshAllEntities: (entity) => ctx.project.worldUpdates.refreshAllWorldEntities(entity),
      rebuildEntity: (entity, stage) => ctx.project.worldUpdates.rebuildWorldEntityAtStage(entity, stage),
      updateWorldEntities: (entity, stage) => ctx.project.worldUpdates.updateWorldEntities(entity, stage),
      updateAllHighlights: (entity) => ctx.project.worldUpdates.updateAllHighlights(entity),
      resyncWithWorld: () => ctx.project.worldUpdates.resyncWithWorld(),
    }
    ctx.projectOps = createOldPipelineProjectOps(ctx.project)
    ctx.worldQueries = createWorldPresentationQueries(ctx.project.worldPresentation)
  })

  before_each(() => {
    defaultName = "inserter"
  })

  return ctx
}

export function waitForPaste(useBplib: boolean, fn: () => void): void {
  if (useBplib) {
    after_ticks(1, fn)
  } else {
    fn()
  }
}
