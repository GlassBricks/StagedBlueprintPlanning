/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of BBPP3.
 *
 * BBPP3 is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * BBPP3 is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with BBPP3. If not, see <https://www.gnu.org/licenses/>.
 */

import { AssemblyEntity, StageNumber } from "../entity/AssemblyEntity"
import { AssemblyWireConnection, getDirectionalInfo } from "../entity/AssemblyWireConnection"
import { getStagePosition } from "../entity/EntityHandler"
import { AssemblyContent, StagePosition } from "./AssemblyContent"
import { AssemblyEntityConnections, EntityMap } from "./EntityMap"

/** @noSelf */
export interface WireUpdater {
  updateWireConnections(
    assembly: AssemblyContent,
    entity: AssemblyEntity,
    stageNumber: StageNumber,
    luaEntity: LuaEntity,
  ): void
}

/** @noSelf */
export interface WireSaver {
  getWireConnectionDiff(
    assembly: AssemblyContent,
    entity: AssemblyEntity,
    stageNumber: StageNumber,
    luaEntity: LuaEntity,
  ): LuaMultiReturn<[added: AssemblyWireConnection[], removed: AssemblyWireConnection[]] | [_: false, _?: never]>
}

/** @noSelf */
export interface WireHandler extends WireUpdater, WireSaver {}

function updateWireConnections(
  assembly: AssemblyContent,
  entity: AssemblyEntity,
  stageNumber: StageNumber,
  luaEntity: LuaEntity,
): void {
  const existingConnections = luaEntity.circuit_connection_definitions
  if (!existingConnections) return

  const assemblyConnections = assembly.content.getWireConnections(entity)
  if (!assemblyConnections) {
    luaEntity.disconnect_neighbour(defines.wire_type.red)
    luaEntity.disconnect_neighbour(defines.wire_type.green)
    return
  }

  const [matchingConnections, extraConnections] = analyzeExistingConnections(
    assemblyConnections,
    existingConnections,
    assembly.content,
    assembly.getStage(stageNumber)!,
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

function getWireConnectionDiff(
  assembly: AssemblyContent,
  entity: AssemblyEntity,
  stageNumber: StageNumber,
  luaEntity: LuaEntity,
): LuaMultiReturn<[added: AssemblyWireConnection[], removed: AssemblyWireConnection[]] | [false]> {
  const existingConnections = luaEntity.circuit_connection_definitions
  if (!existingConnections) return $multi(false)
  const assemblyConnections = assembly.content.getWireConnections(entity)

  const [matchingConnections, extraConnections] = analyzeExistingConnections(
    assemblyConnections,
    existingConnections,
    assembly.content,
    assembly.getStage(stageNumber)!,
  )

  const added: AssemblyWireConnection[] = []
  for (const [definition, otherEntity] of extraConnections) {
    added.push({
      fromEntity: entity,
      toEntity: otherEntity,
      wire: definition.wire,
      fromId: definition.source_circuit_id,
      toId: definition.target_circuit_id,
    })
  }

  const removed: AssemblyWireConnection[] = []
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
  assemblyConnections: AssemblyEntityConnections | nil,
  existingConnections: readonly CircuitConnectionDefinition[],
  content: EntityMap,
  stage: StagePosition,
): LuaMultiReturn<
  [
    matchingConnections: LuaMap<AssemblyWireConnection, CircuitConnectionDefinition>,
    extraConnections: LuaMap<CircuitConnectionDefinition, AssemblyEntity>,
  ]
> {
  const matching = new LuaMap<AssemblyWireConnection, CircuitConnectionDefinition>()
  const extra = new LuaMap<CircuitConnectionDefinition, AssemblyEntity>()

  for (const existingConnection of existingConnections) {
    const otherLuaEntity = existingConnection.target_entity
    const otherEntity = content.findCompatible(
      otherLuaEntity.name,
      getStagePosition(stage, otherLuaEntity),
      otherLuaEntity.direction,
    )
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
  connections: ReadonlyLuaSet<AssemblyWireConnection>,
  toEntity: AssemblyEntity,
  { source_circuit_id, target_circuit_id, wire }: CircuitConnectionDefinition,
): AssemblyWireConnection | nil {
  for (const connection of connections) {
    if (connection.wire === wire) {
      const [, toId, fromId] = getDirectionalInfo(connection, toEntity)
      // ^ is backwards!
      if (fromId === source_circuit_id && toId === target_circuit_id) return connection
    }
  }
}

export const DefaultWireHandler: WireHandler = {
  updateWireConnections,
  getWireConnectionDiff,
}
