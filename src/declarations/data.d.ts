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

export interface PrototypeBase {
  name: string
  type: string
  localised_name?: LocalisedString
}
export interface Sound {
  // stub type
  _sound: never
}

export interface EntityPrototype extends PrototypeBase {
  flags?: Array<keyof EntityPrototypeFlags>

  icons?: IconData[]
  icon_size?: number
  icon_mipmaps?: number
  icon?: string

  order?: string
  subgroup?: string

  selection_box?: BoundingBoxWrite | BoundingBoxArray
  collision_box?: BoundingBoxWrite | BoundingBoxArray
  collision_mask?: Array<keyof CollisionMaskWithFlags>
  tile_height?: number
  tile_width?: number
  selectable_in_game?: boolean

  open_sound?: Sound
  close_sound?: Sound

  placeable_by?: ItemToPlace

  map_color?: Color
  friendly_map_color?: Color
  enemy_map_color?: Color

  remains_when_mined?: string
}
export interface SimpleEntityPrototype extends EntityPrototype {
  type: "simple-entity"
  picture?: Sprite
}
export interface SimpleEntityWithOwnerPrototype extends EntityPrototype {
  type: "simple-entity-with-owner"
  create_ghost_on_death?: boolean
  picture?: Sprite | Sprite4Way
  render_layer?: RenderLayer
}
export interface ItemPrototype extends PrototypeBase {
  icons?: IconData[]
  icon_size?: number
  icon_mipmaps?: number
  icon?: string

  subgroup?: string
  order?: string

  stack_size: number
  flags?: Array<keyof ItemPrototypeFlags>
  place_result?: string
}
export interface SelectionToolPrototype extends Omit<ItemPrototype, "type"> {
  type: "selection-tool"
  selection_color: Color | ColorArray
  alt_selection_color: Color | ColorArray
  selection_mode: SelectionMode[]
  alt_selection_mode: SelectionMode[]
  selection_cursor_box_type: CursorBoxRenderType
  alt_selection_cursor_box_type: CursorBoxRenderType

  reverse_selection_color?: Color | ColorArray
  reverse_selection_mode?: SelectionMode[]
  reverse_selection_cursor_box_type?: CursorBoxRenderType

  entity_filters?: string[]
  alt_entity_filters?: string[]
  reverse_entity_filters?: string[]
}
type SelectionMode =
  | "blueprint"
  | "deconstruct"
  | "cancel-deconstruct"
  | "items"
  | "trees"
  | "buildable-type"
  | "nothing"
  | "items-to-place"
  | "any-entity"
  | "any-tile"
  | "same-force"
  | "not-same-force"
  | "friend"
  | "enemy"
  | "upgrade"
  | "cancel-upgrade"
  | "downgrade"
  | "entity-with-health"
  | "entity-with-force"
  | "entity-with-owner"
  | "avoid-rolling-stock"

export interface CustomInputPrototype extends PrototypeBase {
  type: "custom-input"

  key_sequence: string
  linked_game_control?: string
}

export interface ItemGroupPrototype extends PrototypeBase {
  type: "item-group"
  icon: string
  icon_size: number
  order?: string
}
export interface ItemSubgroupPrototype extends PrototypeBase {
  type: "item-subgroup"
  group: string
  order?: string
}

export interface BasicSprite {
  filename: string
  priority?: SpritePriority

  width?: number
  height?: number
  size?: number | MapPosition | MapPositionArray
  shift?: MapPosition | MapPositionArray
  scale?: number

  mipmap_count?: number

  tint?: Color | ColorArray

  flags?: SpriteFlag[]
}
export interface SpriteWithLayers {
  layers: Sprite[]
}
export type Sprite = BasicSprite | SpriteWithLayers
export type SpritePriority = "extra-high-no-scale" | "extra-high" | "high" | "medium" | "low" | "very-low" | "no-atlas"
export type SpriteFlag = "icon"
export interface Sprite4Way {
  north: Sprite
  east: Sprite
  south: Sprite
  west: Sprite
}

export interface IconData {
  icon: string
  icon_size?: number
  tint?: Color | ColorArray
  shift?: MapPosition | MapPositionArray
  scale?: number
  icon_mipmaps?: number
}

export interface ItemToPlace {
  item: string
  count: number
}

export interface UtilityConstants {
  chart: {
    default_friendly_color: Color
    default_friendly_color_by_type: Partial<Record<string, Color>>
  }
}
