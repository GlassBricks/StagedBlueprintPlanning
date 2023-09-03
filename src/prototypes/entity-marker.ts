/*
 * Copyright (c) 2023 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { PrototypeData } from "factorio:common"
import { ItemPrototype, SimpleEntityWithOwnerPrototype, Sprite } from "factorio:prototype"
import { empty_sprite } from "util"
import { Prototypes } from "../constants"

declare const data: PrototypeData

const entityMarker: SimpleEntityWithOwnerPrototype = {
  type: "simple-entity-with-owner",
  name: Prototypes.EntityMarker,
  icon: "__core__/graphics/spawn-flag.png",
  icon_size: 64,
  subgroup: Prototypes.BlueprintSubgroup,
  picture: empty_sprite() as Sprite,
  flags: ["hidden", "player-creation", "placeable-off-grid"],
  collision_mask: [],
}

const entityMarkerItem: ItemPrototype = {
  type: "item",
  name: Prototypes.EntityMarker,
  icon: "__core__/graphics/spawn-flag.png",
  icon_size: 64,
  stack_size: 1,
  flags: ["hidden"],
  place_result: Prototypes.EntityMarker,
}

data.extend([entityMarker, entityMarkerItem])

// undo reference
const undoReference: SimpleEntityWithOwnerPrototype = {
  type: "simple-entity-with-owner",
  name: Prototypes.UndoReference,
  icon: "__core__/graphics/spawn-flag.png",
  icon_size: 64,
  subgroup: Prototypes.BlueprintSubgroup,
  picture: empty_sprite() as Sprite,
  flags: ["hidden", "player-creation", "placeable-off-grid"],
  collision_mask: [],
}

const undoReferenceItem: ItemPrototype = {
  type: "item",
  name: Prototypes.UndoReference,
  icon: "__core__/graphics/spawn-flag.png",
  icon_size: 64,
  stack_size: 1,
  flags: ["hidden"],
  place_result: Prototypes.UndoReference,
}

data.extend([undoReference, undoReferenceItem])
