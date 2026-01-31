// Copyright (c) 2022-2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { LuaEntity, LuaWireConnector } from "factorio:runtime"
import { isEmpty } from "../lib"
import { WorldEntityLookup } from "../project/WorldPresentation"
import { MutableProjectContent, ProjectContent } from "./ProjectContent"
import { addWireConnection, ProjectEntity, removeWireConnection, StageNumber, WireConnections } from "./ProjectEntity"
import { getDirectionalInfo, ProjectWireConnection, wireConnectionMatches } from "./wire-connection"

interface WireSourceAndTarget {
  sourceId: defines.wire_connector_id
  target: LuaWireConnector
}

function updateWireConnectionsAtStage(
  content: MutableProjectContent,
  entity: ProjectEntity,
  stage: StageNumber,
  worldEntities: WorldEntityLookup,
): void {
  const luaEntity = worldEntities.getWorldEntity(entity, stage)
  if (!luaEntity) return
  const projectConnections = entity.wireConnections

  const [matchingConnections, extraConnections] = partitionExistingWireConnections(
    projectConnections,
    luaEntity,
    content,
    stage,
  )
  for (const [extraConnection] of extraConnections) {
    luaEntity.get_wire_connector(extraConnection.sourceId, false)?.disconnect_from(extraConnection.target)
  }

  if (projectConnections) {
    for (const [otherEntity, connections] of projectConnections) {
      const otherLuaEntity = worldEntities.getWorldEntity(otherEntity, stage)
      if (!otherLuaEntity) continue
      for (const connection of connections) {
        if (matchingConnections.has(connection)) continue
        const [, otherId, thisId] = getDirectionalInfo(connection, otherEntity)
        luaEntity.get_wire_connector(thisId, true).connect_to(otherLuaEntity.get_wire_connector(otherId, true))
      }
    }
  }
}

function saveWireConnections(
  content: MutableProjectContent,
  entity: ProjectEntity,
  stage: StageNumber,
  higherStageForMerging: StageNumber | nil,
  worldEntities: WorldEntityLookup,
): boolean {
  const luaEntity = worldEntities.getWorldEntity(entity, stage)
  if (!luaEntity) return false

  const projectConnections = entity.wireConnections
  const [matchingConnections, extraConnections] = partitionExistingWireConnections(
    projectConnections,
    luaEntity,
    content,
    stage,
  )

  let hasDiff = !isEmpty(extraConnections)

  if (projectConnections) {
    for (const [otherEntity, connections] of projectConnections) {
      const otherLuaEntity = worldEntities.getWorldEntity(otherEntity, stage)
      if (!otherLuaEntity) continue
      for (const connection of connections) {
        if (!matchingConnections.has(connection)) {
          removeWireConnection(connection)
          hasDiff = true
        }
      }
    }
  }

  for (const [definition, otherEntity] of extraConnections) {
    addWireConnection({
      fromEntity: entity,
      toEntity: otherEntity,
      fromId: definition.sourceId,
      toId: definition.target.wire_connector_id,
    })
  }

  if (higherStageForMerging) {
    const higherEntity = worldEntities.getWorldEntity(entity, higherStageForMerging)
    if (higherEntity) {
      const [, extraConnectionsHigher] = partitionExistingWireConnections(
        projectConnections,
        higherEntity,
        content,
        higherStageForMerging,
      )
      for (const [definition, otherEntity] of extraConnectionsHigher) {
        addWireConnection({
          fromEntity: entity,
          toEntity: otherEntity,
          fromId: definition.sourceId,
          toId: definition.target.wire_connector_id,
        })
      }
    }
  }

  return hasDiff
}

function partitionExistingWireConnections(
  projectConnections: WireConnections | nil,
  luaEntity: LuaEntity,
  content: ProjectContent,
  stage: StageNumber,
): LuaMultiReturn<
  [
    matchingConnections: LuaMap<ProjectWireConnection, WireSourceAndTarget>,
    extraConnections: LuaMap<WireSourceAndTarget, ProjectEntity>,
  ]
> {
  const matching = new LuaMap<ProjectWireConnection, WireSourceAndTarget>()
  const extra = new LuaMap<WireSourceAndTarget, ProjectEntity>()

  for (const [thisId, point] of pairs(luaEntity.get_wire_connectors(false))) {
    for (const connection of point.connections) {
      const otherLuaEntity = connection.target.owner
      const otherId = connection.target.wire_connector_id
      if (luaEntity == otherLuaEntity && thisId > otherId) {
        // only count connections to self once
        continue
      }
      const otherEntity = content.findCompatibleWithLuaEntity(otherLuaEntity, nil, stage)
      if (!otherEntity) continue
      let matchingConnection: ProjectWireConnection | nil
      if (projectConnections) {
        const otherConnections = projectConnections.get(otherEntity)
        matchingConnection =
          otherConnections && findMatchingWireConnection(otherConnections, otherEntity, thisId, otherId)
      }
      const connectionDefinition = {
        sourceId: thisId,
        target: connection.target,
      }
      if (matchingConnection) {
        matching.set(matchingConnection, connectionDefinition)
      } else {
        extra.set(connectionDefinition, otherEntity)
      }
    }
  }
  return $multi(matching, extra)
}

function findMatchingWireConnection(
  connections: ReadonlyLuaSet<ProjectWireConnection>,
  toEntity: ProjectEntity,
  sourceId: defines.wire_connector_id,
  targetId: defines.wire_connector_id,
): ProjectWireConnection | nil {
  for (const connection of connections) {
    if (wireConnectionMatches(connection, toEntity, sourceId, targetId)) {
      return connection
    }
  }
}

export { updateWireConnectionsAtStage, saveWireConnections }

// noinspection JSUnusedGlobalSymbols
export const _mockable = true
