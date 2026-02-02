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
data.extend([
  {
    type: "electric-pole",
    name: Prototypes.PastePole,
    icon: "__core__/graphics/spawn-flag.png",
    icon_size: 64,
    hidden: true,
    flags: ["not-deconstructable", "player-creation", "placeable-off-grid"],
    collision_mask: { layers: {} },
    tile_buildability_rules: [
      {
        area: [
          [-0.5, -0.5],
          [0.5, 0.5],
        ],
        required_tiles: { layers: { water_tile: true } },
        colliding_tiles: { layers: { water_tile: true } },
      },
    ],
    supply_area_distance: 0,
    connection_points: [{ wire: {}, shadow: {} }],
    maximum_wire_distance: 64,
  },
  {
    type: "item",
    name: Prototypes.PastePole,
    icon: "__core__/graphics/spawn-flag.png",
    icon_size: 64,
    stack_size: 1,
    hidden: true,
    flags: [],
    place_result: Prototypes.PastePole,
  } satisfies ItemPrototype,
])

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
