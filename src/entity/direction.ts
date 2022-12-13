import { isUndergroundBeltType, rollingStockTypes } from "./entity-info"
import { oppositedirection } from "util"
import { BasicEntityInfo } from "./Entity"
import floor = math.floor

/**
 * Saved direction, may be different from actual world-direction.
 *
 * Type is so that they are incompatible with each other, but castable to each other.
 */
export type SavedDirection = (defines.direction | symbol) & {
  _savedDirectionBrand: never
}

export type WorldDirection = defines.direction

export const NORTH = defines.direction.north as SavedDirection
export const EAST = defines.direction.east as SavedDirection
export const SOUTH = defines.direction.south as SavedDirection
export const WEST = defines.direction.west as SavedDirection
/**
 * Converts world direction to saved direction.
 *
 * Inverts if is output underground belt (so rotating an underground keeps the same _saved_ direction).
 *
 * Direction is always 0 if is rolling stock, or assembling machine with no fluid boxes.
 */
export function getSavedDirection(entity: BasicEntityInfo): SavedDirection {
  const type = entity.type
  if (type == "underground-belt") {
    if (entity.belt_to_ground_type == "output") {
      return oppositedirection(entity.direction) as SavedDirection
    }
  } else if (rollingStockTypes.has(type)) {
    return 0 as SavedDirection
  }
  return entity.direction as SavedDirection
}

export function getUndergroundWorldDirection(
  direction: SavedDirection,
  beltToGroundType: "input" | "output",
): WorldDirection {
  if (beltToGroundType == "output") {
    return oppositedirection(direction as WorldDirection)
  }
  return direction as WorldDirection
}
const oppositeSavedDirection = oppositedirection as unknown as (direction: SavedDirection) => SavedDirection
export { oppositeSavedDirection }
export function getWorldDirection(entity: BlueprintEntity, direction: SavedDirection): WorldDirection {
  if (entity.orientation != nil) return 0
  const isUnderground = isUndergroundBeltType(entity.name)
  if (isUnderground && entity.type == "output") {
    return oppositedirection(direction as WorldDirection)
  }
  return direction as WorldDirection
}

export function orientationToDirection(orientation: RealOrientation | nil): WorldDirection {
  if (orientation == nil) return 0
  return floor(orientation * 8 + 0.5) % 8
}
