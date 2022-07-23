import { LayerPosition } from "../assembly/Assembly"
import { Pos, Position, PositionClass } from "../lib/geometry"
import { Entity, EntityPose } from "./AssemblyEntity"
import { BlueprintDiffHandler } from "./diff/BlueprintDiffHandler"
import minus = Pos.minus
import plus = Pos.plus

export function getLayerPosition(luaEntity: LuaEntity, layer: LayerPosition): PositionClass {
  return minus(luaEntity.position, layer.left_top)
}
export function getWorldPosition(layerPosition: Position, layer: LayerPosition): PositionClass {
  return plus(layerPosition, layer.left_top)
}

export function saveEntity(luaEntity: LuaEntity): Entity | nil {
  return BlueprintDiffHandler.save(luaEntity)
}

export function createEntity(
  layer: LayerPosition,
  { position, direction }: EntityPose,
  entity: Entity,
): LuaEntity | nil {
  return BlueprintDiffHandler.create(
    layer.surface,
    getWorldPosition(position, layer),
    direction,
    entity as BlueprintEntityRead,
  )
}

export function matchEntity(luaEntity: LuaEntity, value: Entity): void {
  return BlueprintDiffHandler.match(luaEntity, value as BlueprintEntityRead)
}
