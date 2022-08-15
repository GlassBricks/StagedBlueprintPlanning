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

import { Data } from "typed-factorio/data/types"
import { CustomInputs, Prototypes } from "./constants"

declare const data: Data

interface CustomInput {
  type: "custom-input"
  name: string

  key_sequence: string
  linked_game_control?: string
}

const buildInput: CustomInput = {
  type: "custom-input",
  name: CustomInputs.Build,

  key_sequence: "",
  linked_game_control: "build",
}
const removePoleCablesInput: CustomInput = {
  name: CustomInputs.RemovePoleCables,
  type: "custom-input",

  key_sequence: "",
  linked_game_control: "remove-pole-cables",
}

data.extend([buildInput, removePoleCablesInput])

interface Sprite {
  filename: string
  width: number
  height: number
  priority?: SpritePriority
}
type SpritePriority = "extra-high-no-scale" | "extra-high" | "high" | "medium" | "low" | "very-low" | "no-atlas"

const emptySprite: Sprite = {
  filename: "__core__/graphics/empty.png",
  width: 1,
  height: 1,
}

interface SimpleEntity {
  type: "simple-entity"
  name: string

  // picture?: Sprite
  pictures?: Sprite | [Sprite, Sprite, Sprite, Sprite]
  flags: Array<keyof EntityPrototypeFlags>
  collision_mask: Array<keyof CollisionMaskWithFlags>
}

const entityMarker: SimpleEntity = {
  type: "simple-entity",
  name: Prototypes.EntityMarker,
  pictures: [emptySprite, emptySprite, emptySprite, emptySprite],
  flags: ["hidden", "player-creation", "placeable-off-grid"],
  collision_mask: [],
}

interface Item {
  type: "item"
  name: string
  icon: string
  icon_size: number
  stack_size: number
  flags: Array<keyof ItemPrototypeFlags>
  place_result?: string
}

const entityMarkerItem: Item = {
  type: "item",
  name: Prototypes.EntityMarker,
  icon: "__core__/graphics/spawn-flag.png",
  icon_size: 64,
  stack_size: 1,
  flags: ["hidden"],
  place_result: Prototypes.EntityMarker,
}

data.extend([entityMarker, entityMarkerItem])
