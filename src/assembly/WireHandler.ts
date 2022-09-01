/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of 100% Blueprint Planning.
 *
 * 100% Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * 100% Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with 100% Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { AsmCircuitConnection, getDirectionalInfo } from "../entity/AsmCircuitConnection"
import { AssemblyEntity, StageNumber } from "../entity/AssemblyEntity"
import { AssemblyContent } from "./AssemblyContent"
import { AsmEntityCircuitConnections, EntityMap } from "./EntityMap"

/** @noSelf */
export interface WireUpdater {
  updateCircuitConnections(
    assembly: AssemblyContent,
    entity: AssemblyEntity,
    stageNumber: StageNumber,
    luaEntity: LuaEntity,
  ): void
}

/** @noSelf */
export interface WireSaver {
  getCircuitConnectionDiff(
    assembly: AssemblyContent,
    entity: AssemblyEntity,
    stageNumber: StageNumber,
    luaEntity: LuaEntity,
  ): LuaMultiReturn<[added: AsmCircuitConnection[], removed: AsmCircuitConnection[]] | [_: false, _?: never]>
}

/** @noSelf */
export interface WireHandler extends WireUpdater, WireSaver {}

function updateCircuitConnections(
  assembly: AssemblyContent,
  entity: AssemblyEntity,
  stageNumber: StageNumber,
  luaEntity: LuaEntity,
): void {
  const existingConnections = luaEntity.circuit_connection_definitions
  if (!existingConnections) return

  const assemblyConnections = assembly.content.getCircuitConnections(entity)
  if (!assemblyConnections) {
    luaEntity.disconnect_neighbour(defines.wire_type.red)
    luaEntity.disconnect_neighbour(defines.wire_type.green)
    return
  }

  const [matchingConnections, extraConnections] = analyzeExistingConnections(
    assemblyConnections,
    existingConnections,
    assembly.content,
  )
  for (const [extraConnection] of extraConnections) luaEntity.disconnect_neighbour(extraConnection)

  // add missing connections
  for (const [otherEntity, connections] of assemblyConnections) {
    const otherLuaEntity = otherEntity.getWorldEntity(stageNumber)
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

function getCircuitConnectionDiff(
  assembly: AssemblyContent,
  entity: AssemblyEntity,
  stageNumber: StageNumber,
  luaEntity: LuaEntity,
): LuaMultiReturn<[added: AsmCircuitConnection[], removed: AsmCircuitConnection[]] | [false]> {
  const existingConnections = luaEntity.circuit_connection_definitions
  if (!existingConnections) return $multi(false)
  const assemblyConnections = assembly.content.getCircuitConnections(entity)

  const [matchingConnections, extraConnections] = analyzeExistingConnections(
    assemblyConnections,
    existingConnections,
    assembly.content,
  )

  const added: AsmCircuitConnection[] = []
  for (const [definition, otherEntity] of extraConnections) {
    added.push({
      fromEntity: entity,
      toEntity: otherEntity,
      wire: definition.wire,
      fromId: definition.source_circuit_id,
      toId: definition.target_circuit_id,
    })
  }

  const removed: AsmCircuitConnection[] = []
  if (assemblyConnections) {
    for (const [otherEntity, connections] of assemblyConnections) {
      const otherLuaEntity = otherEntity.getWorldEntity(stageNumber)
      if (!otherLuaEntity) continue
      for (const connection of connections) {
        if (matchingConnections.has(connection)) continue
        removed.push(connection)
      }
    }
  }

  return $multi(added, removed)
}

function analyzeExistingConnections(
  assemblyConnections: AsmEntityCircuitConnections | nil,
  existingConnections: readonly CircuitConnectionDefinition[],
  content: EntityMap,
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
    const otherEntity = content.findCompatible(otherLuaEntity, otherLuaEntity.position, nil)
    if (!otherEntity) continue
    const otherConnections = assemblyConnections && assemblyConnections.get(otherEntity)
    const matchingConnection =
      otherConnections && findingMatchingConnection(otherConnections, otherEntity, existingConnection)
    if (matchingConnection) {
      matching.set(matchingConnection, existingConnection)
    } else {
      extra.set(existingConnection, otherEntity)
    }
  }
  return $multi(matching, extra)
}

function findingMatchingConnection(
  connections: ReadonlyLuaSet<AsmCircuitConnection>,
  toEntity: AssemblyEntity,
  { source_circuit_id, target_circuit_id, wire }: CircuitConnectionDefinition,
): AsmCircuitConnection | nil {
  for (const connection of connections) {
    if (connection.wire === wire) {
      const [, toId, fromId] = getDirectionalInfo(connection, toEntity)
      // ^ is backwards!
      if (fromId === source_circuit_id && toId === target_circuit_id) return connection
    }
  }
}

export const DefaultWireHandler: WireHandler = {
  updateCircuitConnections,
  getCircuitConnectionDiff,
}
