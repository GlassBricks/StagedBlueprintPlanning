/*
 * Copyright (c) 2022-2023 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { Color } from "factorio:prototype"

export const enum Settings {
  EntityInfoLocation = "bp100:entity-info-location",
  FlexibleOffshorePumpPlacement = "bp100:flexible-offshore-pump-placement",
  MinableLandfill = "bp100:minable-landfill",
  LandLandfill = "bp100:land-landfill",
  UpgradeOnPaste = "bp100:upgrade-on-paste",
}

// noinspection JSUnusedGlobalSymbols
export enum FlexibleOffshorePumpPlacement {
  Disabled = "disabled",
  Enabled = "anywhere",
}

export const enum Prototypes {
  // used to handle blueprints
  EntityMarker = "bp100:entity-marker",
  PreviewEntityPrefix = "bp100:preview-entity-",
  UndoReference = "bp100:undo-reference",

  UtilityGroup = "bp100:utility",
  PreviewEntitySubgroup = "bp100:preview-entity",
  BlueprintSubgroup = "bp100:blueprint-utility",

  CleanupTool = "bp100:cleanup-tool",

  StageMoveTool = "bp100:stage-move-tool",
  FilteredStageMoveTool = "bp100:filtered-stage-move-tool",
  StageDeconstructTool = "bp100:stage-deconstruct-tool",

  StagedCopyTool = "bp100:staged-copy-tool",
  StagedCutTool = "bp100:staged-cut-tool",
  ForceDeleteTool = "bp100:force-delete-tool",

  StageReference = "bp100:blueprint-reference",

  PassedPrototypeInfo = "bp100:passed-prototype-info",

  BANANA = "bp100:banana",
}

export const enum Constants {
  MAX_UNDO_ENTRIES = 100,
}

export const enum Styles {
  FakeListBox = "bp100:fake-list-box",
  FakeListBoxItem = "bp100:fake-list-box-item",
  FakeListBoxItemActive = "bp100:fake-list-box-item-active",
}

export const enum Sprites {
  CollapseLeft = "bp100:collapse-left",
  CollapseLeftDark = "bp100:collapse-left-dark",
  BlueprintStages = "bp100:blueprint-stages",
}

export const enum CustomInputs {
  Build = "bp100:build",
  RemovePoleCables = "bp100:remove-pole-cables",
  ConfirmGui = "bp100:confirm-gui",

  NextStage = "bp100:next-stage",
  PreviousStage = "bp100:previous-stage",
  GoToFirstStage = "bp100:go-to-first-stage",

  MoveToThisStage = "bp100:move-to-this-stage",

  ForceDelete = "bp100:force-delete",

  StageSelectNext = "bp100:stage-select-next",
  StageSelectPrevious = "bp100:stage-select-previous",

  ToggleStagedCopy = "bp100:toggle-staged-copy",

  NextProject = "bp100:next-project",
  PreviousProject = "bp100:previous-project",
}

// noinspection JSUnusedGlobalSymbols
export const enum BuildableEntityTypesDef {
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
  // rolling stock
  "artillery-wagon" = "artillery-wagon",
  "cargo-wagon" = "cargo-wagon",
  "fluid-wagon" = "fluid-wagon",
  "locomotive" = "locomotive",
  wall = "wall",
}
export type BuildableEntityType = keyof typeof BuildableEntityTypesDef

export const enum L_Game {
  CantBeRotated = "cant-be-rotated",
  CantBeMined = "cant-be-mined",
  Reset = "gui.reset",
}

export namespace Colors {
  export const Orange: Color = [255, 155, 65]
  export const Orange2: Color = [255, 200, 65]
  export const Blueish: Color = [65, 200, 255]

  export const OverrideHighlight: Color = [0.4, 1, 0.5]
  export const Green: Color = [0.5, 0.9, 0.5]
  export const Red: Color = [0.9, 0.5, 0.5]
}

export const enum OtherConstants {
  DefaultNumStages = 3,
}
