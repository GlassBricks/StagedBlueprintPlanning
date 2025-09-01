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

import { BlueprintEntity, LuaItemStack, LuaPlayer } from "factorio:runtime"
import { createUserProject } from "../project/UserProject"
import { getProjectPlayerData } from "../project/player-project-data"
import { teleportToProject } from "../ui/player-current-stage"
import { createProjectEntityNoCopy, ProjectEntity, addWireConnection } from "../entity/ProjectEntity"
import { updateWireConnectionsAtStage } from "../entity/wires"
import { saveEntity } from "../entity/save-load"
import { getEntityDiff } from "../entity/stage-diff"
import { UserProject } from "../project/ProjectDef"
import { Position } from "../lib/geometry"
import { Entity, InserterEntity, RollingStockEntity, UndergroundBeltEntity, AssemblingMachineEntity } from "../entity/Entity"
import { ProjectWireConnection } from "../entity/wire-connection"


export interface ImportResult {
  success: boolean
  error?: string
  project?: UserProject
  stageCount?: number
}

interface BlueprintInfo {
  label: string
  entityCount: number
  stack: LuaItemStack
  index: number
}

interface UniqueEntityInfo {
  firstStage: number
  lastStage: number
  entityData: BlueprintEntity
  stageValues: Record<number, BlueprintEntity>
  projectEntity?: ProjectEntity  // Set after entity creation for wire mapping
}

/**
 * Creates a clean Entity object from BlueprintEntity data, excluding only blueprint-internal
 * properties that cause blueprint icons to appear. Position and direction are handled 
 * separately by createProjectEntityNoCopy().
 * 
 * EXCLUDED: entity_number (blueprint internal ID), position, direction
 * INCLUDED: All other properties (quality, items, control_behavior, tags, schedule, wires, etc.)
 */
function createCleanEntityData(blueprintEntity: BlueprintEntity): Entity {
  const anyEntity = blueprintEntity as any
  const cleanEntity: any = {}
  
  // Copy all properties except the problematic ones
  for (const prop in anyEntity) {
    if (prop != 'entity_number' && prop != 'position' && prop != 'direction') {
      cleanEntity[prop] = anyEntity[prop]
    }
  }
  
  return cleanEntity as Entity
}

export function importBlueprintBookFromString(blueprintString: string, player: LuaPlayer): ImportResult {
  if (blueprintString == nil || blueprintString == "") {
    return { success: false, error: "empty-string" }
  }
  // Try to parse the blueprint string
  const tempInventory = game.create_inventory(1)
  const stack = tempInventory[0]

  const [success] = pcall(() => {
    stack.import_stack(blueprintString)
  })

  if (!success) {
    tempInventory.destroy()
    return { success: false, error: "invalid-string" }
  }

  // Check if it parsed into something valid
  if (!stack.valid_for_read) {
    tempInventory.destroy()
    return { success: false, error: "invalid-string" }
  }

  // Check if it's a blueprint book (not a single blueprint)
  if (!stack.is_blueprint_book) {
    tempInventory.destroy()
    return { success: false, error: "not-blueprint-book" }
  }

  // Extract individual blueprints from the book
  const bookInventory = stack.get_inventory(defines.inventory.item_main)!

  const blueprints: BlueprintInfo[] = []

  for (let i = 0; i < bookInventory.length; i++) {
    const bpStack = bookInventory[i]
    if (bpStack.valid_for_read) {
      if (bpStack.is_blueprint) {
        const bpLabel = bpStack.label || `Blueprint ${blueprints.length + 1}`
        const entities = bpStack.get_blueprint_entities()
        const entityCount = entities ? entities.length : 0

        // Skip completely empty blueprints
        if (entityCount > 0) {
          blueprints.push({
            label: bpLabel,
            entityCount: entityCount,
            stack: bpStack,
            index: i + 1,
          })
        } else {
          player.print(`BP Import: Skipping empty blueprint "${bpLabel}"`)
        }
      } else if (bpStack.is_blueprint_book) {
        // Handle nested blueprint books (placeholder)
        const nestedBookLabel = bpStack.label || "Unnamed Nested Book"
        player.print(`BP Import: Found nested blueprint book "${nestedBookLabel}" - skipping (not yet supported)`)
      }
    }
  }

  const bookLabel = stack.label || "Unnamed Blueprint Book"

  if (blueprints.length == 0) {
    tempInventory.destroy()
    return { success: false, error: "empty-book" }
  }

  // Create project from blueprints
  const result = createProjectFromBlueprints(bookLabel, blueprints, player)

  tempInventory.destroy()
  return result
}

function createProjectFromBlueprints(projectName: string, blueprints: BlueprintInfo[], player: LuaPlayer): ImportResult {
  // Use default name if empty
  const finalProjectName = (!projectName || projectName == "") ? "Imported Blueprint Project" : projectName

  if (!blueprints || blueprints.length == 0) {
    return { success: false, error: "no-blueprints" }
  }

  if (blueprints.length > 100) {
    return { success: false, error: "too-many-blueprints" }
  }

  // Create project with number of stages matching blueprint count
  const project = createUserProject(finalProjectName, blueprints.length)
  if (!project) {
    return { success: false, error: "project-creation-failed" }
  }

  // Import all blueprints

  // First pass: Collect all unique entities and track their changes across stages
  const uniqueEntities: Record<string, UniqueEntityInfo> = {} // [position_key] = {firstStage, lastStage, entityData, stageValues}

  // Analyze all blueprints to find entity stage spans and changes
  for (let i = 0; i < blueprints.length; i++) {
    const bp = blueprints[i]
    const stageNum = i + 1
    const stage = project.getStage(stageNum)
    if (stage) {
      stage.name.set(bp.label)


      const entities = bp.stack.get_blueprint_entities()
      if (entities && entities.length > 0) {
        for (const entity of entities) {
          if (!entity.position) {
            continue
          }

          const posKey = `${entity.position.x},${entity.position.y}`
          if (uniqueEntities[posKey]) {
            // Entity already exists, extend its lastStage and track changes
            const existingEntity = uniqueEntities[posKey]
            existingEntity.lastStage = stageNum
            existingEntity.stageValues[stageNum] = entity

          } else {
            // New entity, starts and ends at this stage for now
            uniqueEntities[posKey] = {
              firstStage: stageNum,
              lastStage: stageNum,
              entityData: entity,
              stageValues: { [stageNum]: entity }, // Track entity data per stage
            }
          }
        }
      }
    }
  }

  // Second pass: Create ProjectEntities with proper stage spans
  const content = project.content
  let totalEntitiesCreated = 0
  
  // Entity number to ProjectEntity mapping for wire connections
  const entityNumberMap: Record<number, Record<number, ProjectEntity>> = {} // [stage][entity_number] = ProjectEntity

  for (const posKey in uniqueEntities) {
    const entityInfo = uniqueEntities[posKey]
    // Create ProjectEntity with proper firstStage and staged values
    const firstStageData = entityInfo.stageValues[entityInfo.firstStage]
    
    
    // Create a clean entity object with only the properties safe for manual placement
    // This avoids blueprint-specific properties that cause blueprint icons to show
    const cleanEntityData = createCleanEntityData(firstStageData)
    
    const projectEntity = createProjectEntityNoCopy(
      cleanEntityData,
      firstStageData.position!,
      firstStageData.direction || 0,
      entityInfo.firstStage,
    )

    if (projectEntity != nil) {
      // Only set lastStage if the entity should actually be removed (doesn't appear in final blueprint)
      // For blueprint imports, entities that persist to the end should have lastStage = nil (continue indefinitely)
      const totalStages = blueprints.length
      if (entityInfo.lastStage < totalStages) {
        // Entity disappears before the final stage, so it should be marked for removal
        projectEntity.setLastStageUnchecked(entityInfo.lastStage)
      }

      // Create stage diffs for stages with different properties
      const stageDiffs: Record<number, any> = {}
      for (let stage = entityInfo.firstStage + 1; stage <= entityInfo.lastStage; stage++) {
        if (entityInfo.stageValues[stage]) {
          const stageData = entityInfo.stageValues[stage]
          const previousStageData = entityInfo.stageValues[stage - 1] || firstStageData
          
          // Use clean entity data for both current and previous stage to ensure consistency
          const cleanStageData = createCleanEntityData(stageData)
          const cleanPreviousStageData = createCleanEntityData(previousStageData)

          // Calculate diff between consecutive stages using clean data
          const diff = getEntityDiff(cleanPreviousStageData, cleanStageData)
          if (diff) {
            stageDiffs[stage] = diff
          }
        }
      }

      // Apply stage diffs to the ProjectEntity
      if (Object.keys(stageDiffs).length > 0) {
        projectEntity.setStageDiffsDirectly(stageDiffs)
      }

      // Add entity to project content
      content.addEntity(projectEntity)
      
      // Store reference for wire mapping
      entityInfo.projectEntity = projectEntity
      
      // Build entity number mapping for each stage where this entity appears
      for (let s = entityInfo.firstStage; s <= entityInfo.lastStage; s++) {
        if (!entityNumberMap[s]) {
          entityNumberMap[s] = {}
        }
        const stageEntityData = entityInfo.stageValues[s] || firstStageData
        if (stageEntityData.entity_number != nil) {
          entityNumberMap[s][stageEntityData.entity_number] = projectEntity
        }
      }

      // Build the entity in all stages where it should appear
      for (let s = entityInfo.firstStage; s <= entityInfo.lastStage; s++) {
        project.worldUpdates.rebuildWorldEntityAtStage(projectEntity, s)
      }

      totalEntitiesCreated++
    }
  }

  if (totalEntitiesCreated == 0) {
    player.create_local_flying_text({ text: "Warning: No entities imported - all blueprints are empty", create_at_cursor: true })
  }

  // Third pass: Process wire connections and build into world
  let totalWireConnectionsCreated = 0
  const processedConnections = new Set<string>() // Track processed connections to avoid duplicates
  const entitiesWithWires = new Set<ProjectEntity>() // Track entities that need wire updates
  
  
  for (let i = 0; i < blueprints.length; i++) {
    const bp = blueprints[i]
    const stageNum = i + 1
    const stageEntityMap = entityNumberMap[stageNum]
    
    if (!stageEntityMap) continue
    
    const entities = bp.stack.get_blueprint_entities()
    if (!entities) continue
    
    // Read wire connections from each entity
    for (const entity of entities) {
      if (!entity.entity_number) continue
      
      // Cast to any to access wires property
      const anyEntity = entity as any
      if (!anyEntity.wires) continue
      
      const fromEntity = stageEntityMap[entity.entity_number]
      if (!fromEntity) continue
      
      // Process wires array - format: {entity1_number, connector1_id, entity2_number, connector2_id}
      const wires = anyEntity.wires
      if (!Array.isArray(wires)) continue
      
      for (const wire of wires) {
        if (!Array.isArray(wire) || wire.length < 4) continue
        
        const [entity1Num, connector1Id, entity2Num, connector2Id] = wire
        
        // Get both entities
        const entity1 = stageEntityMap[entity1Num]
        const entity2 = stageEntityMap[entity2Num]
        if (!entity1 || !entity2) continue
        
        // Create unique key to avoid duplicate connections
        const connectionKey = `${Math.min(entity1Num, entity2Num)}-${Math.max(entity1Num, entity2Num)}-${connector1Id}-${connector2Id}`
        if (processedConnections.has(connectionKey)) continue
        processedConnections.add(connectionKey)
        
        const wireConnection: ProjectWireConnection = {
          fromEntity: entity1,
          fromId: connector1Id as defines.wire_connector_id,
          toEntity: entity2,
          toId: connector2Id as defines.wire_connector_id,
        }
        
        addWireConnection(wireConnection)
        totalWireConnectionsCreated++
        
        // Track entities for wire world building
        entitiesWithWires.add(entity1)
        entitiesWithWires.add(entity2)
      }
    }
    
  }
  
  
  // Build wire connections into world entities for all tracked entities
  if (totalWireConnectionsCreated > 0) {
    for (const entity of entitiesWithWires) {
      const firstStage = entity.firstStage
      const lastStage = entity.lastStage || blueprints.length
      for (let stage = firstStage; stage <= lastStage; stage++) {
        updateWireConnectionsAtStage(project.content, entity, stage)
      }
    }
  }

  // Calculate center position for first blueprint only (for player positioning)
  let firstStagePosition: Position = { x: 0, y: 0 }
  if (blueprints.length > 0) {
    const firstBp = blueprints[0]
    const entities = firstBp.stack.get_blueprint_entities()
    if (entities && entities.length > 0) {
      let minX = Infinity,
        maxX = -Infinity
      let minY = Infinity,
        maxY = -Infinity
      let validPositions = 0

      for (const entity of entities) {
        if (entity.position != nil) {
          minX = Math.min(minX, entity.position.x)
          maxX = Math.max(maxX, entity.position.x)
          minY = Math.min(minY, entity.position.y)
          maxY = Math.max(maxY, entity.position.y)
          validPositions++
        }
      }

      if (validPositions > 0) {
        firstStagePosition = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
      }
    }
  }

  // Store blueprint center position for first stage
  const playerData = getProjectPlayerData(player.index, project)
  if (playerData) {
    // Set the last stage to stage 1 and last position to first blueprint center
    playerData.lastStage = 1
    playerData.lastPosition = firstStagePosition
  }

  player.print(`BP Import: Created project "${finalProjectName}" with ${blueprints.length} stages!`)

  // Use teleportToProject to properly set up project context and position player
  teleportToProject(player, project)

  return { success: true, project: project, stageCount: blueprints.length }
}