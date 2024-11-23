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
import { BlueprintItemPrototype, ItemPrototype, SimpleEntityWithOwnerPrototype, Sprite } from "factorio:prototype"
import { empty_sprite, table } from "util"
import { Prototypes } from "../constants"

declare const data: PrototypeData

function createHiddenEntity(name: string): (SimpleEntityWithOwnerPrototype | ItemPrototype)[] {
  return [
    {
      type: "simple-entity-with-owner",
      name,
      icon: "__core__/graphics/spawn-flag.png",
      icon_size: 64,
      subgroup: Prototypes.BlueprintSubgroup,
      picture: empty_sprite() as Sprite,
      hidden: true,
      flags: ["player-creation", "placeable-off-grid"],
      collision_mask: { layers: {} },
    } satisfies SimpleEntityWithOwnerPrototype,
    {
      type: "item",
      name,
      icon: "__core__/graphics/spawn-flag.png",
      icon_size: 64,
      stack_size: 1,
      hidden: true,
      flags: [],
      place_result: name,
    } satisfies ItemPrototype,
  ]
}
data.extend(createHiddenEntity(Prototypes.EntityMarker))
data.extend(createHiddenEntity(Prototypes.UndoReference))

const stageReference = table.deepcopy(data.raw.blueprint.blueprint!)
stageReference.subgroup = undefined
Object.assign(stageReference, {
  name: Prototypes.StageReference,
  icon: "__bp100__/graphics/icons/purple-blueprint.png",
  hidden: true,
  flags: ["not-stackable"],
} satisfies Partial<BlueprintItemPrototype>)

data.extend([stageReference])
data.extend(createHiddenEntity(Prototypes.StageReferenceData))
