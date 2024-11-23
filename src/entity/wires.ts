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
import { circuitConnectionMatches, getDirectionalInfo, ProjectCircuitConnection } from "./circuit-connection"
import { MutableProjectContent, ProjectContent } from "./ProjectContent"
import {
  addCircuitConnection,
  CircuitConnections,
  ProjectEntity,
  removeCircuitConnection,
  StageNumber,
} from "./ProjectEntity"

interface WireConnectionDefinition {
  sourceId: defines.wire_connector_id
  target: LuaWireConnector
}

function updateCircuitConnections(
  content: MutableProjectContent,
  entity: ProjectEntity,
  stage: StageNumber,
  luaEntity: LuaEntity,
): void {
  const projectConnections = entity.circuitConnections

  const [matchingConnections, extraConnections] = partitionExistingCircuitConnections(
    projectConnections,
    luaEntity,
    content,
    stage,
  )
  for (const [extraConnection] of extraConnections) {
    luaEntity.get_wire_connector(extraConnection.sourceId, false)?.disconnect_from(extraConnection.target)
  }

  if (!projectConnections) return

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

function updateCableConnections(
  content: MutableProjectContent,
  entity: ProjectEntity,
  stage: StageNumber,
  luaEntity: LuaEntity,
): void {
  if (luaEntity.type != "electric-pole") return
  const projectConnections = entity.cableConnections

  const matching = new LuaSet<ProjectEntity>()
  const existingConnections = (
    luaEntity.neighbours as {
      copper?: LuaEntity[]
    }
  ).copper
  if (existingConnections) {
    for (const otherLuaEntity of existingConnections) {
      if (otherLuaEntity.type == "power-switch") continue // handled by circuit connections
      const otherEntity = content.findCompatibleWithLuaEntity(otherLuaEntity, nil, stage)
      if (!otherEntity) continue
      if (projectConnections && projectConnections.has(otherEntity)) {
        matching.add(otherEntity)
      } else {
        luaEntity
          .get_wire_connector(defines.wire_connector_id.pole_copper, false)
          ?.disconnect_from(otherLuaEntity.get_wire_connector(defines.wire_connector_id.pole_copper, true))
      }
    }
  }

  if (projectConnections) {
    for (const otherEntity of projectConnections) {
      const otherLuaEntity = otherEntity.getWorldEntity(stage)
      if (otherLuaEntity && !matching.has(otherEntity)) {
        luaEntity
          .get_wire_connector(defines.wire_connector_id.pole_copper, true)
          .connect_to(otherLuaEntity.get_wire_connector(defines.wire_connector_id.pole_copper, true))
      }
    }
  }
}

/**
 * Handles both cable and circuit connections.
 */
function updateWireConnectionsAtStage(content: MutableProjectContent, entity: ProjectEntity, stage: StageNumber): void {
  const luaEntity = entity.getWorldEntity(stage)
  if (!luaEntity) return
  updateCircuitConnections(content, entity, stage, luaEntity)
  updateCableConnections(content, entity, stage, luaEntity)
}

function saveCircuitConnections(content: MutableProjectContent, entity: ProjectEntity, stage: StageNumber): boolean {
  const luaEntity = entity.getWorldEntity(stage)
  if (!luaEntity) return false
  const existingConnections = luaEntity.get_wire_connectors(false)
  if (isEmpty(existingConnections)) return false

  const projectConnections = entity.circuitConnections
  const [matchingConnections, extraConnections] = partitionExistingCircuitConnections(
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
          removeCircuitConnection(connection)
          hasDiff = true
        }
      }
    }
  }

  for (const [definition, otherEntity] of extraConnections) {
    addCircuitConnection({
      fromEntity: entity,
      toEntity: otherEntity,
      fromId: definition.sourceId,
      toId: definition.target.wire_connector_id,
    })
  }
  return hasDiff
}

/**
 * additionalStageForConnections: If provided, the connections will be saved for this stage as well (with lower priority).
 * Used when poles are first placed.
 */
function saveCableConnections(
  content: MutableProjectContent,
  entity: ProjectEntity,
  stage: StageNumber,
  additionalStageForConnections: StageNumber | nil,
): boolean {
  const luaEntity = entity.getWorldEntity(stage)
  if (!luaEntity || luaEntity.type != "electric-pole") return false
  const worldConnections = (
    luaEntity.neighbours as {
      copper?: LuaEntity[]
    }
  ).copper
  const savedConnections = entity.cableConnections

  const matchingConnections = new LuaSet<ProjectEntity>()
  const newConnections = new LuaSet<ProjectEntity>()

  if (worldConnections) {
    for (const otherLuaEntity of worldConnections) {
      const otherEntity = content.findCompatibleWithLuaEntity(otherLuaEntity, nil, stage)
      if (!otherEntity) continue

      if (otherLuaEntity.type == "power-switch") continue
      if (!savedConnections || !savedConnections.has(otherEntity)) {
        newConnections.add(otherEntity)
      } else {
        matchingConnections.add(otherEntity)
      }
    }
  }

  if (additionalStageForConnections) {
    // only add connections to entities higher than this stage
    const higherEntity = entity.getWorldEntity(additionalStageForConnections)
    if (higherEntity) {
      const higherConnections = (
        higherEntity.neighbours as {
          copper?: LuaEntity[]
        }
      ).copper
      if (higherConnections) {
        for (const otherLuaEntity of higherConnections) {
          if (otherLuaEntity.type == "power-switch") continue // don't care about power switches for additional stage
          const otherEntity = content.findCompatibleWithLuaEntity(otherLuaEntity, nil, stage)
          if (
            otherEntity &&
            otherEntity.firstStage > stage &&
            !(savedConnections && savedConnections.has(otherEntity))
          ) {
            newConnections.add(otherEntity)
          }
        }
      }
    }
  }

  let hasDiff = !isEmpty(newConnections)
  // remove first, to not exceed max connections
  if (savedConnections) {
    for (const otherEntity of savedConnections) {
      // only remove if the other lua entity exists
      if (!matchingConnections.has(otherEntity) && otherEntity.getWorldEntity(stage)) {
        entity.removeDualCableConnection(otherEntity)
        hasDiff = true
      }
    }
  }

  for (const add of newConnections) {
    entity.tryAddDualCableConnection(add)
  }

  return hasDiff
}

function saveWireConnections(
  content: MutableProjectContent,
  entity: ProjectEntity,
  stage: StageNumber,
  higherStageForMerging?: StageNumber,
): LuaMultiReturn<[hasAnyDiff: boolean, maxConnectionsExceeded?: boolean]> {
  const diff2 = saveCableConnections(content, entity, stage, higherStageForMerging)
  const diff1 = saveCircuitConnections(content, entity, stage)

  return $multi(diff1 || diff2)
}

function isPoleCopperConnection(entity: LuaEntity, sourceId: defines.wire_connector_id): boolean {
  return entity.type == "electric-pole" && sourceId == defines.wire_connector_id.pole_copper
}

function partitionExistingCircuitConnections(
  projectConnections: CircuitConnections | nil,
  luaEntity: LuaEntity,
  content: ProjectContent,
  stage: StageNumber,
): LuaMultiReturn<
  [
    matchingConnections: LuaMap<ProjectCircuitConnection, WireConnectionDefinition>,
    extraConnections: LuaMap<WireConnectionDefinition, ProjectEntity>,
  ]
> {
  const matching = new LuaMap<ProjectCircuitConnection, WireConnectionDefinition>()
  const extra = new LuaMap<WireConnectionDefinition, ProjectEntity>()

  for (const [thisId, point] of pairs(luaEntity.get_wire_connectors(false))) {
    const isPoleCopper = isPoleCopperConnection(luaEntity, thisId)
    for (const connection of point.connections) {
      const otherLuaEntity = connection.target.owner
      const otherId = connection.target.wire_connector_id
      if (luaEntity == otherLuaEntity && thisId > otherId) {
        // only count connections to self once
        continue
      }
      const otherIsPoleCopper = isPoleCopperConnection(otherLuaEntity, otherId)
      // pure copper connections handled by cable connections
      if (isPoleCopper && otherIsPoleCopper) continue
      const otherEntity = content.findCompatibleWithLuaEntity(otherLuaEntity, nil, stage)
      if (!otherEntity) continue
      let matchingConnection: ProjectCircuitConnection | nil
      if (projectConnections) {
        const otherConnections = projectConnections.get(otherEntity)
        matchingConnection =
          otherConnections && findMatchingCircuitConnection(otherConnections, otherEntity, thisId, otherId)
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

function findMatchingCircuitConnection(
  connections: ReadonlyLuaSet<ProjectCircuitConnection>,
  toEntity: ProjectEntity,
  sourceId: defines.wire_connector_id,
  targetId: defines.wire_connector_id,
): ProjectCircuitConnection | nil {
  for (const connection of connections) {
    if (circuitConnectionMatches(connection, toEntity, sourceId, targetId)) {
      return connection
    }
  }
}

export { updateWireConnectionsAtStage, saveWireConnections }

// noinspection JSUnusedGlobalSymbols
export const _mockable = true
