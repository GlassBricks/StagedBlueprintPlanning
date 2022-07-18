import { Layer } from "../assembly/Assembly"
import { Building, deepCompare, isEmpty } from "../lib"
import { Pos, Position, PositionClass } from "../lib/geometry"
import { Entity, LayerChange, MutableAssemblyEntity } from "./AssemblyEntity"
import { BlueprintDiffHandler } from "./diff/BlueprintDiffHandler"
import { getNilPlaceholder, NilPlaceholder } from "./NilPlaceholder"
import minus = Pos.minus

export function getLayerPosition(entity: LuaEntity, layer: Layer): PositionClass {
  return minus(entity.position, layer.bbox.left_top)
}

export function saveEntity(
  entity: LuaEntity,
  layer: Layer,
  resultPosition: Position = getLayerPosition(entity, layer),
): MutableAssemblyEntity | nil {
  const result = BlueprintDiffHandler.save(entity) as MutableAssemblyEntity | nil
  if (!result) return nil
  result.layerNumber = layer.layerNumber
  result.position = resultPosition
  return result
}

const ignoredProps = newLuaSet("position", "direction", "layerNumber", "layerChanges", "isLostReference")

export function getEntityDiff(below: Entity, above: Entity): LayerChange | nil {
  const nilPlaceholder: NilPlaceholder = getNilPlaceholder()
  const changes: Building<LayerChange> = {}
  for (const [key, value] of pairs(above)) {
    if (ignoredProps.has(key) || deepCompare(value, below[key])) continue
    changes[key] = value as any
  }
  for (const [key] of pairs(below)) {
    if (above[key] === nil) changes[key] = nilPlaceholder
  }
  return !isEmpty(changes) ? (changes as LayerChange) : nil
}
