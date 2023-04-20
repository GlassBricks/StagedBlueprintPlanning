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

import { isEmpty } from "../lib"
import { debugPrint } from "../lib/test/misc"
import { AsmCircuitConnection, circuitConnectionMatches, getDirectionalInfo } from "./AsmCircuitConnection"
import { AsmEntityCircuitConnections, AssemblyContent, CableAddResult, MutableAssemblyContent } from "./AssemblyContent"
import { AssemblyEntity, StageNumber } from "./AssemblyEntity"

function updateCircuitConnections(
  content: MutableAssemblyContent,
  entity: AssemblyEntity,
  stage: StageNumber,
  luaEntity: LuaEntity,
): void {
  const existingConnections = luaEntity.circuit_connection_definitions
  if (!existingConnections) return

  const assemblyConnections = content.getCircuitConnections(entity)

  const [matchingConnections, extraConnections] = partitionExistingCircuitConnections(
    assemblyConnections,
    luaEntity,
    existingConnections,
    content,
    stage,
  )
  for (const [extraConnection] of extraConnections) luaEntity.disconnect_neighbour(extraConnection)

  if (assemblyConnections) {
    for (const [otherEntity, connections] of assemblyConnections) {
      const otherLuaEntity = otherEntity.getWorldEntity(stage)
      if (!otherLuaEntity) continue
      for (const connection of connections) {
        if (matchingConnections.has(connection)) continue
        const [, otherId, thisId] = getDirectionalInfo(connection, otherEntity)
        luaEntity.connect_neighbour({
          wire: connection.wire,
          target_entity: otherLuaEntity,
          source_circuit_id: thisId,
          target_circuit_id: otherId,
        })
      }
    }
  }
}

function updateCableConnections(
  content: MutableAssemblyContent,
  entity: AssemblyEntity,
  stage: StageNumber,
  luaEntity: LuaEntity,
): boolean {
  if (luaEntity.type != "electric-pole") return true
  const assemblyConnections = content.getCableConnections(entity)

  const matching = new Set<AssemblyEntity>()
  const existingConnections = (luaEntity.neighbours as { copper?: LuaEntity[] }).copper
  if (existingConnections) {
    for (const otherLuaEntity of existingConnections) {
      const otherEntity = content.findCompatibleWithLuaEntity(otherLuaEntity, nil, stage)
      if (!otherEntity) continue
      if (assemblyConnections && assemblyConnections.has(otherEntity)) {
        matching.add(otherEntity)
      } else {
        luaEntity.disconnect_neighbour(otherLuaEntity)
      }
    }
  }

  if (assemblyConnections) {
    for (const otherEntity of assemblyConnections) {
      const otherLuaEntity = otherEntity.getWorldEntity(stage)
      if (otherLuaEntity && !matching.has(otherEntity)) {
        if (!luaEntity.connect_neighbour(otherLuaEntity)) return false
      }
    }
  }
  return true
}

/**
 * Handles both cable and circuit connections.
 *
 * Returns true if connections succeeded (false if max connections exceeded).
 */
function updateWireConnectionsAtStage(
  content: MutableAssemblyContent,
  entity: AssemblyEntity,
  stage: StageNumber,
): boolean {
  const luaEntity = entity.getWorldEntity(stage)
  if (!luaEntity) return false
  updateCircuitConnections(content, entity, stage, luaEntity)
  return updateCableConnections(content, entity, stage, luaEntity)
}

function saveCircuitConnections(
  content: MutableAssemblyContent,
  entity: AssemblyEntity,
  stage: StageNumber,
  luaEntity: LuaEntity,
): boolean {
  const existingConnections = luaEntity.circuit_connection_definitions
  if (!existingConnections) return false
  const assemblyConnections = content.getCircuitConnections(entity)

  debugPrint(existingConnections)

  const [matchingConnections, extraConnections] = partitionExistingCircuitConnections(
    assemblyConnections,
    luaEntity,
    existingConnections,
    content,
    stage,
  )

  let hasDiff = !isEmpty(extraConnections)

  // remove before add, so don't remove just added connections
  if (assemblyConnections) {
    for (const [otherEntity, connections] of assemblyConnections) {
      const otherLuaEntity = otherEntity.getWorldEntity(stage)
      if (!otherLuaEntity) continue
      for (const connection of connections) {
        if (!matchingConnections.has(connection)) {
          content.removeCircuitConnection(connection)
          hasDiff = true
        }
      }
    }
  }

  for (const [definition, otherEntity] of extraConnections) {
    content.addCircuitConnection({
      fromEntity: entity,
      toEntity: otherEntity,
      wire: definition.wire,
      fromId: definition.source_circuit_id,
      toId: definition.target_circuit_id,
    })
  }
  return hasDiff
}

/**
 * mergeStage should be the 'lower' stage. only new connections at this stage (not in the other stage) will be added.
 */
function saveCableConnections(
  content: MutableAssemblyContent,
  entity: AssemblyEntity,
  stage: StageNumber,
  higherStageForMerging: StageNumber | nil,
): LuaMultiReturn<[hasAnyDiff: boolean, maxConnectionsExceeded?: boolean]> {
  const luaEntity = entity.getWorldEntity(stage)
  if (!luaEntity || luaEntity.type != "electric-pole") return $multi(false)
  const worldConnections = (luaEntity.neighbours as { copper?: LuaEntity[] }).copper
  const savedConnections = content.getCableConnections(entity)

  const matchingConnections = new LuaSet<AssemblyEntity>()
  const newConnections = new LuaSet<AssemblyEntity>()

  if (worldConnections) {
    for (const otherLuaEntity of worldConnections) {
      const otherEntity = content.findCompatibleWithLuaEntity(otherLuaEntity, nil, stage)
      if (!otherEntity) continue
      if (!savedConnections || !savedConnections.has(otherEntity)) {
        newConnections.add(otherEntity)
      } else {
        matchingConnections.add(otherEntity)
      }
    }
  }

  if (higherStageForMerging) {
    // only add connections to entities higher than this stage
    const higherEntity = entity.getWorldEntity(higherStageForMerging)
    if (higherEntity) {
      const higherConnections = (higherEntity.neighbours as { copper?: LuaEntity[] }).copper
      if (higherConnections) {
        for (const otherLuaEntity of higherConnections) {
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
      // check other lua entity exists; if not, don't remove
      if (!matchingConnections.has(otherEntity) && otherEntity.getWorldEntity(stage)) {
        content.removeCableConnection(entity, otherEntity)
        hasDiff = true
      }
    }
  }

  let maxConnectionsExceeded: boolean | nil
  for (const add of newConnections) {
    const result = content.addCableConnection(entity, add)
    if (result == CableAddResult.MaxConnectionsReached) maxConnectionsExceeded = true
  }

  return $multi(hasDiff, maxConnectionsExceeded)
}

function saveWireConnections(
  content: MutableAssemblyContent,
  entity: AssemblyEntity,
  stage: StageNumber,
  higherStageForMerging?: StageNumber,
): LuaMultiReturn<[hasAnyDiff: boolean, maxConnectionsExceeded?: boolean]> {
  const circuitStageEntity = entity.getWorldEntity(stage)
  const diff1 = circuitStageEntity != nil && saveCircuitConnections(content, entity, stage, circuitStageEntity)

  const [diff2, maxConnectionsExceeded] = saveCableConnections(content, entity, stage, higherStageForMerging)
  return $multi(diff1 || diff2, maxConnectionsExceeded)
}

function partitionExistingCircuitConnections(
  assemblyConnections: AsmEntityCircuitConnections | nil,
  luaEntity: LuaEntity,
  existingConnections: readonly CircuitConnectionDefinition[],
  content: AssemblyContent,
  stage: StageNumber,
): LuaMultiReturn<
  [
    matchingConnections: LuaMap<AsmCircuitConnection, CircuitConnectionDefinition>,
    extraConnections: LuaMap<CircuitConnectionDefinition, AssemblyEntity>,
  ]
> {
  const matching = new LuaMap<AsmCircuitConnection, CircuitConnectionDefinition>()
  const extra = new LuaMap<CircuitConnectionDefinition, AssemblyEntity>()

  for (const existingConnection of existingConnections) {
    const otherLuaEntity = existingConnection.target_entity
    if (luaEntity == otherLuaEntity && existingConnection.source_circuit_id > existingConnection.target_circuit_id)
      continue
    const otherEntity = content.findCompatibleWithLuaEntity(otherLuaEntity, nil, stage)
    if (!otherEntity) continue
    let matchingConnection: AsmCircuitConnection | nil
    if (assemblyConnections) {
      const otherConnections = assemblyConnections.get(otherEntity)
      matchingConnection =
        otherConnections && findMatchingCircuitConnection(otherConnections, otherEntity, existingConnection)
    }
    if (matchingConnection) {
      matching.set(matchingConnection, existingConnection)
    } else {
      extra.set(existingConnection, otherEntity)
    }
  }
  return $multi(matching, extra)
}

function findMatchingCircuitConnection(
  connections: ReadonlyLuaSet<AsmCircuitConnection>,
  toEntity: AssemblyEntity,
  { source_circuit_id, target_circuit_id, wire }: CircuitConnectionDefinition,
): AsmCircuitConnection | nil {
  for (const connection of connections) {
    if (circuitConnectionMatches(connection, wire, toEntity, source_circuit_id, target_circuit_id)) {
      return connection
    }
  }
}

export { updateWireConnectionsAtStage, saveWireConnections }

// noinspection JSUnusedGlobalSymbols
export const _mockable = true
