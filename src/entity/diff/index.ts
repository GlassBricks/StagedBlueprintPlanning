import { Position } from "../../lib/geometry"
import { WorldPosition } from "../../utils/world-location"
import { Entity } from "../entity"
import { BlueprintDiffHandler } from "./BlueprintDiffHandler"

export function saveEntity(entity: LuaEntity, layerPosition: Position): Entity | undefined {
  return BlueprintDiffHandler.save(entity, layerPosition)
}

export function createEntity(saved: Entity, layerWorldPosition: WorldPosition): void {
  BlueprintDiffHandler.create(saved as BlueprintEntityRead, layerWorldPosition)
}
