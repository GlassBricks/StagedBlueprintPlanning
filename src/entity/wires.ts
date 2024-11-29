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

import { LuaEntity, LuaWireConnector } from "factorio:runtime"
import { isEmpty } from "../lib"
import { MutableProjectContent, ProjectContent } from "./ProjectContent"
import { addWireConnection, ProjectEntity, removeWireConnection, StageNumber, WireConnections } from "./ProjectEntity"
import { getDirectionalInfo, ProjectWireConnection, wireConnectionMatches } from "./wire-connection"

interface WireSourceAndTarget {
  sourceId: defines.wire_connector_id
  target: LuaWireConnector
}

function updateWireConnectionsAtStage(content: MutableProjectContent, entity: ProjectEntity, stage: StageNumber): void {
  const luaEntity = entity.getWorldEntity(stage)
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
      const otherLuaEntity = otherEntity.getWorldEntity(stage)
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _higherStageForMerging?: StageNumber,
): boolean {
  const luaEntity = entity.getWorldEntity(stage)
  if (!luaEntity) return false
  const existingConnections = luaEntity.get_wire_connectors(false)
  if (isEmpty(existingConnections)) return false

  const projectConnections = entity.wireConnections
  const [matchingConnections, extraConnections] = partitionExistingWireConnections(
    projectConnections,
    luaEntity,
    content,
    stage,
  )

  let hasDiff = !isEmpty(extraConnections)

  // remove before adding, so don't remove just added connections
  if (projectConnections) {
    for (const [otherEntity, connections] of projectConnections) {
      const otherLuaEntity = otherEntity.getWorldEntity(stage)
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
