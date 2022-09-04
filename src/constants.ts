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

export const enum CustomInputs {
  Build = "bp100:build",
  RemovePoleCables = "bp100:remove-pole-cables",

  NextStage = "bp100:next-stage",
  PreviousStage = "bp100:previous-stage",
  GoToFirstStage = "bp100:go-to-first-stage",
  GoToNextNotableStage = "bp100:go-to-next-notable-stage",

  MoveToThisStage = "bp100:move-to-this-stage",
}

export const enum Settings {
  CyclicNavigation = "bp100:cyclic-navigation",
}

export const enum Prototypes {
  // used to handle blueprints
  EntityMarker = "bp100:entity-marker",
  GridEnforcer = "bp100:blueprint-grid-enforcer",

  PreviewEntityPrefix = "bp100:preview-entity-",
  SelectionProxyPrefix = "bp100:selection-proxy-",

  UtilityGroup = "bp100:utility",
  PreviewEntitySubgroup = "bp100:preview-entity",
  SelectionProxySubgroup = "bp100:selection-proxy",
  BlueprintSubgroup = "bp100:blueprint-utility",

  CleanupTool = "bp100:cleanup-tool",
}

export const enum Sprites {
  ExternalLinkWhite = "bp100:external-link-white",
  ExternalLinkBlack = "bp100:external-link-black",
}

export namespace Colors {
  export const ErrorHighlight: ColorArray = [0.9, 0.2, 0.2]
  export const AreaPreview: ColorArray = [0.5, 0.5, 0.9, 0.5]
}

export const enum BuildableEntityTypes {
  accumulator = "accumulator",
  "artillery-turret" = "artillery-turret",
  beacon = "beacon",
  boiler = "boiler",
  "burner-generator" = "burner-generator",
  "arithmetic-combinator" = "arithmetic-combinator",
  "decider-combinator" = "decider-combinator",
  "constant-combinator" = "constant-combinator",
  container = "container",
  "logistic-container" = "logistic-container",
  "infinity-container" = "infinity-container",
  "assembling-machine" = "assembling-machine",
  "rocket-silo" = "rocket-silo",
  furnace = "furnace",
  "electric-energy-interface" = "electric-energy-interface",
  "electric-pole" = "electric-pole",
  // skip unit-spawner
  // skip flying robots
  gate = "gate",
  generator = "generator",
  "heat-interface" = "heat-interface",
  "heat-pipe" = "heat-pipe",
  inserter = "inserter",
  lab = "lab",
  lamp = "lamp",
  "land-mine" = "land-mine",
  "linked-container" = "linked-container",
  market = "market",
  "mining-drill" = "mining-drill",
  "offshore-pump" = "offshore-pump",
  pipe = "pipe",
  "infinity-pipe" = "infinity-pipe",
  "pipe-to-ground" = "pipe-to-ground",
  "player-port" = "player-port",
  "power-switch" = "power-switch",
  "programmable-speaker" = "programmable-speaker",
  pump = "pump",
  radar = "radar",
  "curved-rail" = "curved-rail",
  "straight-rail" = "straight-rail",
  "rail-chain-signal" = "rail-chain-signal",
  "rail-signal" = "rail-signal",
  reactor = "reactor",
  roboport = "roboport",
  "simple-entity-with-owner" = "simple-entity-with-owner",
  "simple-entity-with-force" = "simple-entity-with-force",
  "solar-panel" = "solar-panel",
  "storage-tank" = "storage-tank",
  "train-stop" = "train-stop",
  "linked-belt" = "linked-belt",
  "loader-1x1" = "loader-1x1",
  "loader" = "loader",
  splitter = "splitter",
  "transport-belt" = "transport-belt",
  "underground-belt" = "underground-belt",
  turret = "turret",
  "ammo-turret" = "ammo-turret",
  "electric-turret" = "electric-turret",
  "fluid-turret" = "fluid-turret",
  // vehicles ignored
  wall = "wall",
}

export const enum L_Game {
  CantBeRotated = "cant-be-rotated",
}
