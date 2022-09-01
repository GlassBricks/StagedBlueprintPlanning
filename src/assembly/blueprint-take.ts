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

import { isEmpty, Mutable } from "../lib"
import { BBox, Pos, Position } from "../lib/geometry"
import { L_Interaction } from "../locale"

const OriginalPositionTag = "bp100OriginalPosition"
export interface BlueprintSettings {
  /** Original position + offset = blueprint position */
  positionOffset: Position
  snapToGrid: Position | nil
  positionRelativeToGrid: Position | nil
  absoluteSnapping: boolean
}
export function getDefaultBlueprintSettings(): BlueprintSettings {
  return {
    positionOffset: { x: 0, y: 0 },
    snapToGrid: { x: 2, y: 2 },
    positionRelativeToGrid: nil,
    absoluteSnapping: false,
  }
}

export function tryTakeBlueprintWithSettings(
  stack: BlueprintItemStack,
  settings: BlueprintSettings,
  surface: LuaSurface,
  markOriginalPosition = true,
): boolean {
  if (!stack.is_blueprint) {
    stack.set_stack("blueprint")
  }
  stack.blueprint_snap_to_grid = settings.snapToGrid
  stack.blueprint_absolute_snapping = settings.absoluteSnapping
  stack.blueprint_position_relative_to_grid = settings.positionRelativeToGrid

  const bpMapping = stack.create_blueprint({
    surface,
    force: "player",
    area: BBox.coords(-5000, -5000, 5000, 5000),
  })
  if (isEmpty(bpMapping)) {
    return false
  }

  const firstEntityOriginalPosition = bpMapping[1].position

  if (markOriginalPosition) stack.set_blueprint_entity_tag(1, OriginalPositionTag, firstEntityOriginalPosition)

  const entities = stack.get_blueprint_entities()!
  const firstEntityPosition = entities[0].position
  const expectedPosition = Pos.plus(firstEntityOriginalPosition, settings.positionOffset)
  if (!Pos.equals(firstEntityPosition, expectedPosition)) {
    const adjustment = Pos.minus(expectedPosition, firstEntityPosition)
    for (const entity of entities) {
      const pos = entity.position as Mutable<Position>
      pos.x += adjustment.x
      pos.y += adjustment.y
    }
    stack.set_blueprint_entities(entities)
  }
  return true
}
export interface OpenedBlueprintInfo {
  blueprint: BlueprintItemStack
  settings: BlueprintSettings
  numEntities: number
  firstEntityOriginalPosition: Position
}
declare global {
  interface PlayerData {
    lastOpenedBlueprint?: OpenedBlueprintInfo
  }
}
declare const global: GlobalWithPlayers
export function editBlueprintSettings(
  player: LuaPlayer,
  blueprint: BlueprintItemStack,
  settings: BlueprintSettings,
): boolean {
  if (!blueprint.valid || !blueprint.valid_for_read || !blueprint.is_blueprint) return false
  const numEntities = blueprint.get_blueprint_entity_count()
  if (numEntities === 0) return false

  let firstEntityOriginalPosition: Position

  const firstEntityTag = blueprint.get_blueprint_entity_tag(1, OriginalPositionTag) as any
  if (
    typeof firstEntityTag === "object" &&
    typeof firstEntityTag.x === "number" &&
    typeof firstEntityTag.y === "number"
  ) {
    firstEntityOriginalPosition = firstEntityTag
  } else {
    const blueprintPosition = blueprint.get_blueprint_entities()![0].position
    // Original position + offset = blueprint position
    // Original position = blueprint position - offset
    firstEntityOriginalPosition = Pos.minus(blueprintPosition, settings.positionOffset)
  }

  global.players[player.index].lastOpenedBlueprint = {
    blueprint,
    settings,
    numEntities,
    firstEntityOriginalPosition,
  }
  player.opened = blueprint as LuaItemStack

  return true
}
export function onBlueprintUpdated(player: LuaPlayer, blueprint: BlueprintItemStack): void {
  const data = global.players[player.index]
  const info = data.lastOpenedBlueprint
  delete data.lastOpenedBlueprint
  if (!info || info.blueprint !== blueprint) return

  const { settings, numEntities, firstEntityOriginalPosition } = info
  if (blueprint.get_blueprint_entity_count() !== numEntities) {
    player.create_local_flying_text({
      text: [L_Interaction.BlueprintEntitiesRemoved],
      create_at_cursor: true,
    })
    return
  }
  const entities = blueprint.get_blueprint_entities()!
  const firstEntityBlueprintPosition = entities[0].position
  // original position + offset = blueprint position
  // offset = blueprint position - original position
  const offset = Pos.minus(firstEntityBlueprintPosition, firstEntityOriginalPosition)
  if (!offset.equals(settings.positionOffset)) {
    // set new offset
    settings.positionOffset = offset
  }
  settings.absoluteSnapping = blueprint.blueprint_absolute_snapping
  settings.snapToGrid = blueprint.blueprint_snap_to_grid
  settings.positionRelativeToGrid = blueprint.blueprint_position_relative_to_grid
}
