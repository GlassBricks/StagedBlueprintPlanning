import { Layer } from "../assembly/Assembly"
import { Pos, PositionClass } from "../lib/geometry"
import { Entity } from "./AssemblyEntity"
import { BlueprintDiffHandler } from "./diff/BlueprintDiffHandler"
import minus = Pos.minus

export function getLayerPosition(entity: LuaEntity, layer: Layer): PositionClass {
  return minus(entity.position, layer.bbox.left_top)
}

export function saveEntity(entity: LuaEntity): Entity | nil {
  return BlueprintDiffHandler.save(entity)
}
