// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { UnitNumber } from "factorio:runtime"
import expect from "tstl-expect"
import { oppositedirection } from "util"
import { Prototypes } from "../../constants"
import { ProjectEntity } from "../../entity/ProjectEntity"
import { isPreviewEntity } from "../../entity/prototype-info"
import { canBeAnyDirection, saveEntity } from "../../entity/save-load"
import { assert } from "../../lib"
import { UserProject } from "../../project/ProjectDef"
import {
  assertConfigChangedHighlightsCorrect,
  assertErrorHighlightsCorrect,
  assertItemRequestHighlightsCorrect,
  assertLastStageHighlightCorrect,
  assertNoHighlightsAfterLastStage,
} from "./entity-highlight-test-util"

export function assertEntityCorrect(project: UserProject, entity: ProjectEntity, expectError: number | false): void {
  expect(entity.isSettingsRemnant).toBeFalsy()
  const found = project.content.findCompatibleEntity(entity.firstValue.name, entity.position, entity.direction, 1)
  expect(found).toBe(entity)

  let hasError: number | false = false
  for (const stage of $range(1, project.lastStageFor(entity))) {
    const worldEntity = entity.getWorldOrPreviewEntity(stage)!
    assert(worldEntity, `entity does not exist at stage ${stage}`)
    const isPreview = isPreviewEntity(worldEntity)
    const value = entity.getValueAtStage(stage)
    if (value == nil) {
      assert(isPreview, `entity must be preview at stage ${stage}`)
    } else if (isPreview) {
      assert(entity.hasErrorAt(stage), `entity must have error at stage ${stage} to be preview`)
      hasError ||= stage
    } else if (entity.hasErrorAt(stage)) {
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
    } else if (entity.isUndergroundBelt() && entity.hasErrorAt(stage)) {
      expect(worldEntity.direction).toEqual(oppositedirection(entity.direction))
    } else if (!canBeAnyDirection(worldEntity)) {
      expect(worldEntity.direction).toEqual(entity.direction)
    }

    expect(entity.getExtraEntity("settingsRemnantHighlight", stage)).toBeNil()
  }

  expect(hasError).toBe(expectError)

  for (const stage of $range(project.lastStageFor(entity) + 1, project.numStages())) {
    expect(entity.getWorldOrPreviewEntity(stage)).toBeNil()
  }

  assertErrorHighlightsCorrect(entity, project.lastStageFor(entity))
  assertConfigChangedHighlightsCorrect(entity, project.lastStageFor(entity))
  assertLastStageHighlightCorrect(entity)
  assertNoHighlightsAfterLastStage(entity, project.numStages())
  assertItemRequestHighlightsCorrect(entity, project.lastStageFor(entity))

  const wireConnections = entity.wireConnections
  if (!wireConnections) {
    for (const stage of $range(entity.firstStage, project.lastStageFor(entity))) {
      const worldEntity = entity.getWorldEntity(stage)
      if (!worldEntity) continue
      for (const [, connectionPoint] of pairs(worldEntity.get_wire_connectors(false))) {
        expect(connectionPoint.connection_count).toBe(0)
      }
    }
  } else {
    for (const stage of $range(entity.firstStage, project.lastStageFor(entity))) {
      const thisWorldEntity = entity.getWorldEntity(stage)
      if (!thisWorldEntity) continue

      const expectedConnections = Object.entries(wireConnections).flatMap(([entity, connections]) => {
        const otherWorldEntity = entity.getWorldEntity(stage)
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

export function assertEntityNotPresent(project: UserProject, entity: ProjectEntity): void {
  const found = project.content.findCompatibleEntity(entity.firstValue.name, entity.position, entity.direction, 1)
  expect(found).toBeNil()

  for (const stage of $range(1, project.lastStageFor(entity))) {
    expect(entity.getWorldOrPreviewEntity(stage)).toBeNil()
  }
  expect(entity.hasAnyExtraEntities("errorOutline")).toBe(false)
  expect(entity.hasAnyExtraEntities("errorElsewhereIndicator")).toBe(false)
}

export function assertIsSettingsRemnant(project: UserProject, entity: ProjectEntity): void {
  expect(entity.isSettingsRemnant).toBe(true)
  for (const stage of $range(1, project.lastStageFor(entity))) {
    const preview = entity.getWorldOrPreviewEntity(stage)!
    expect(preview).toBeAny()
    expect(isPreviewEntity(preview)).toBe(true)
    expect(entity.getExtraEntity("settingsRemnantHighlight", stage)).toBeAny()
  }
  expect(entity.hasAnyExtraEntities("errorOutline")).toBe(false)
  expect(entity.hasAnyExtraEntities("errorElsewhereIndicator")).toBe(false)
}
