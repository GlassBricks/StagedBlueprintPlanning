// Copyright (c) 2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

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
