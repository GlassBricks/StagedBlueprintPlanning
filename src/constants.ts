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
  EntityInfoLocation = "bp100_entity-info-location",
  UpgradeOnPaste = "bp100_upgrade-on-paste",
  GpsTagTeleport = "bp100_gps-tag-teleport",
  UnhideInfinityItems = "bp100_unhide-infinity-items",
}

// noinspection JSUnusedGlobalSymbols
export enum FlexibleOffshorePumpPlacement {
  Disabled = "disabled",
  Enabled = "anywhere",
}

export const enum Prototypes {
  // used to handle blueprints
  EntityMarker = "bp100_entity-marker",
  PreviewEntityPrefix = "bp100_preview-entity-",
  UndoReference = "bp100_undo-reference",

  UtilityGroup = "bp100_utility",
  PreviewEntitySubgroup = "bp100_preview-entity",
  BlueprintSubgroup = "bp100_blueprint-utility",

  CleanupTool = "bp100_cleanup-tool",

  StageMoveTool = "bp100_stage-move-tool",
  FilteredStageMoveTool = "bp100_filtered-stage-move-tool",
  StageDeconstructTool = "bp100_stage-deconstruct-tool",

  StagedCopyTool = "bp100_staged-copy-tool",
  StagedCutTool = "bp100_staged-cut-tool",
  ForceDeleteTool = "bp100_force-delete-tool",

  StageReference = "bp100_blueprint-reference",
  StageReferenceData = "bp100_blueprint-reference-data",

  PassedPrototypeInfo = "bp100_passed-prototype-info",

  BANANA = "bp100_banana",
}

export const enum Constants {
  MAX_UNDO_ENTRIES = 100,
}

export const enum Styles {
  FakeListBox = "bp100_fake-list-box",
  FakeListBoxItem = "bp100_fake-list-box-item",
  FakeListBoxItemActive = "bp100_fake-list-box-item-active",
}

export const enum Sprites {
  CollapseLeft = "bp100_collapse-left",
  CollapseLeftDark = "bp100_collapse-left-dark",
  BlueprintStages = "bp100_blueprint-stages",
  NewBlueprint = "bp100_new-blueprint",
}

export const enum CustomInputs {
  Build = "bp100_build",
  RemovePoleCables = "bp100_remove-pole-cables",
  ConfirmGui = "bp100_confirm-gui",

  NextStage = "bp100_next-stage",
  PreviousStage = "bp100_previous-stage",
  GoToEntityFirstStage = "bp100_go-to-first-stage",
  GoToProjectFirstStage = "bp100_go-to-project-first-stage",
  GoToProjectLastStage = "bp100_go-to-project-last-stage",

  ExitProject = "bp100_exit-project",
  ReturnToLastProject = "bp100_return-to-last-project",

  NextProject = "bp100_next-project",
  PreviousProject = "bp100_previous-project",

  GetStageBlueprint = "bp100_get-stage-blueprint",
  GetBlueprintBook = "bp100_get-blueprint-book",

  NewStageAfterCurrent = "bp100_new-stage-after-current",
  NewStageAtFront = "bp100_new-stage-at-front",

  MoveToThisStage = "bp100_move-to-this-stage",

  ForceDelete = "bp100_force-delete",

  StageSelectNext = "bp100_stage-select-next",
  StageSelectPrevious = "bp100_stage-select-previous",

  ToggleStagedCopy = "bp100_toggle-staged-copy",
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
  "curved-rail-a" = "curved-rail-a",
  "curved-rail-b" = "curved-rail-b",
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
