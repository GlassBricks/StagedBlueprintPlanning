import { Layer } from "../assembly/Assembly"
import { deepCompare, nilIfEmpty } from "../lib"
import { Pos, PositionClass } from "../lib/geometry"
import { Entity, LayerChange } from "./AssemblyEntity"
import { BlueprintDiffHandler } from "./diff/BlueprintDiffHandler"
import { getNilPlaceholder, NilPlaceholder } from "./NilPlaceholder"
import minus = Pos.minus

export function getLayerPosition(entity: LuaEntity, layer: Layer): PositionClass {
  return minus(entity.position, layer.bbox.left_top)
}

export function saveEntity(entity: LuaEntity): Entity | nil {
  return BlueprintDiffHandler.save(entity)
}

const ignoredProps = newLuaSet<keyof any>("position", "direction")

export function getEntityDiff<E extends Entity = Entity>(below: E, above: E): LayerChange | nil {
  const nilPlaceholder: NilPlaceholder = getNilPlaceholder()
  const changes: any = {}
  for (const [key, value] of pairs(above)) {
    if (!ignoredProps.has(key) && !deepCompare(value, below[key])) {
      changes[key] = value
    }
  }
  for (const [key] of pairs(below)) {
    if (!ignoredProps.has(key) && above[key] === nil) changes[key] = nilPlaceholder
  }
  return nilIfEmpty(changes)
}
