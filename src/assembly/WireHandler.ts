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

import { AssemblyEntity, LayerNumber } from "../entity/AssemblyEntity"
import { AssemblyWireConnection, getDirectionalInfo } from "../entity/AssemblyWireConnection"
import { getLayerPosition } from "../entity/EntityHandler"
import { AssemblyContent } from "./Assembly"
import { AssemblyEntityConnections } from "./EntityMap"

/** @noSelf */
export interface WireUpdater {
  updateWireConnections(
    assemblyConnections: AssemblyEntityConnections | nil,
    layerNumber: LayerNumber,
    luaEntity: LuaEntity,
    getAssemblyEntityFromLuaEntity: (entity: LuaEntity) => AssemblyEntity | nil,
  ): void
}

export interface CircuitConnectionAndEntity {
  definition: CircuitConnectionDefinition
  otherEntity: AssemblyEntity
}

/** @noSelf */
export interface WireSaver {
  getWireConnectionDiff(
    assemblyConnections: AssemblyEntityConnections | nil,
    layerNum: LayerNumber,
    luaEntity: LuaEntity,
    getAssemblyEntityFromLuaEntity: (entity: LuaEntity) => AssemblyEntity | nil,
  ): LuaMultiReturn<[added: CircuitConnectionAndEntity[], removed: AssemblyWireConnection[]]>
}

export function getWireConnectionDiff(
  assembly: AssemblyContent,
  assemblyEntity: AssemblyEntity,
  layerNum: LayerNumber,
  entity: LuaEntity,
  wireSaver: WireSaver,
): LuaMultiReturn<[CircuitConnectionAndEntity[], AssemblyWireConnection[]]> {
  const { content } = assembly
  const connections = content.getWireConnections(assemblyEntity)
  const layer = assembly.layers[layerNum]
  const getter = (entity: LuaEntity) =>
    content.findCompatible(entity, getLayerPosition(layer, entity), entity.direction)
  return wireSaver.getWireConnectionDiff(connections, layerNum, entity, getter)
}

export function updateWireConnections(
  assembly: AssemblyContent,
  assemblyEntity: AssemblyEntity,
  layerNum: LayerNumber,
  entity: LuaEntity,
  wireUpdater: WireUpdater,
): void {
  const { content } = assembly
  const connections = content.getWireConnections(assemblyEntity)
  const layer = assembly.layers[layerNum]
  const getter = (entity: LuaEntity) =>
    content.findCompatible(entity, getLayerPosition(layer, entity), entity.direction)
  wireUpdater.updateWireConnections(connections, layerNum, entity, getter)
}

/** @noSelf */
export interface WireHandler extends WireUpdater, WireSaver {}

export function createWireHandler(): WireHandler {
  function updateWireConnections(
    assemblyConnections: AssemblyEntityConnections | nil,
    layerNum: LayerNumber,
    luaEntity: LuaEntity,
    getAssemblyEntityFromLuaEntity: (entity: LuaEntity) => AssemblyEntity | nil,
  ): void {
    if (!assemblyConnections) {
      luaEntity.disconnect_neighbour(defines.wire_type.red)
      luaEntity.disconnect_neighbour(defines.wire_type.green)
      return
    }

    const [matchingConnections, extraConnections] = analyzeExistingConnections(
      assemblyConnections,
      luaEntity,
      getAssemblyEntityFromLuaEntity,
    )
    for (const [extraConnection] of extraConnections) luaEntity.disconnect_neighbour(extraConnection)

    // add missing connections
    for (const [otherEntity, connections] of assemblyConnections) {
      const otherLuaEntity = otherEntity.getWorldEntity(layerNum)
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
    assemblyConnections: AssemblyEntityConnections | nil,
    layerNum: LayerNumber,
    luaEntity: LuaEntity,
    getAssemblyEntityFromLuaEntity: (entity: LuaEntity) => AssemblyEntity | nil,
  ): LuaMultiReturn<[added: CircuitConnectionAndEntity[], removed: AssemblyWireConnection[]]> {
    const [matchingConnections, extraConnections] = analyzeExistingConnections(
      assemblyConnections,
      luaEntity,
      getAssemblyEntityFromLuaEntity,
    )

    const added: CircuitConnectionAndEntity[] = []
    for (const [definition, otherEntity] of extraConnections) {
      added.push({ definition, otherEntity })
    }

    const removed: AssemblyWireConnection[] = []
    if (assemblyConnections) {
      for (const [otherEntity, connections] of assemblyConnections) {
        const otherLuaEntity = otherEntity.getWorldEntity(layerNum)
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
    luaEntity: LuaEntity,
    getAssemblyEntityFromLuaEntity: (entity: LuaEntity) => AssemblyEntity | nil,
  ): LuaMultiReturn<
    [
      matchingConnections: LuaMap<AssemblyWireConnection, CircuitConnectionDefinition>,
      extraConnections: LuaMap<CircuitConnectionDefinition, AssemblyEntity>,
    ]
  > {
    const existingEntityConnections = luaEntity.circuit_connection_definitions
    if (!existingEntityConnections) return $multi(new LuaMap(), new LuaMap())

    const matching = new LuaMap<AssemblyWireConnection, CircuitConnectionDefinition>()
    const extra = new LuaMap<CircuitConnectionDefinition, AssemblyEntity>()

    for (const existingConnection of existingEntityConnections) {
      const otherEntity = getAssemblyEntityFromLuaEntity(existingConnection.target_entity)
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
    { source_circuit_id, target_circuit_id }: CircuitConnectionDefinition,
  ): AssemblyWireConnection | nil {
    for (const connection of connections) {
      const [, toId, fromId] = getDirectionalInfo(connection, toEntity)
      // ^ is backwards!
      if (fromId === source_circuit_id && toId === target_circuit_id) return connection
    }
  }

  return {
    updateWireConnections,
    getWireConnectionDiff,
  }
}

export const DefaultWireHandler = createWireHandler()
