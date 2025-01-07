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

import { Color, EntityType } from "factorio:prototype"

export const enum Settings {
  EntityInfoLocation = "bp100_entity-info-location",
  GpsTagTeleport = "bp100_gps-tag-teleport",
  UnhideInfinityItems = "bp100_unhide-infinity-items",

  FlexibleOffshorePumpPlacement = "bp100_flexible-offshore-pump-placement",
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

function set<T extends EntityType>(...args: T[]): Record<T, true> {
  const result: Record<T, true> = {} as Record<T, true>
  for (const arg of args) result[arg] = true
  return result
}

// noinspection JSUnusedGlobalSymbols
export const BuildableEntityTypes = set(
  "accumulator",
  "artillery-turret",
  "asteroid-collector",
  "beacon",
  "boiler",
  "burner-generator",
  "cargo-bay",
  "cargo-landing-pad",
  "arithmetic-combinator",
  "decider-combinator",
  "selector-combinator",
  "constant-combinator",
  "container",
  "logistic-container",
  "infinity-container",
  "assembling-machine",
  "rocket-silo",
  "furnace",
  "display-panel",
  "electric-energy-interface",
  "electric-pole",
  "fusion-generator",
  "fusion-reactor",
  "gate",
  "generator",
  "heat-interface",
  "heat-pipe",
  "inserter",
  "lab",
  "lamp",
  "land-mine",
  "lightning-attractor",
  "linked-container",
  "mining-drill",
  "offshore-pump",
  "pipe",
  "infinity-pipe",
  "pipe-to-ground",
  "player-port",
  "power-switch",
  "programmable-speaker",
  "pump",
  "radar",
  "straight-rail",
  "half-diagonal-rail",
  "curved-rail-a",
  "curved-rail-b",
  "elevated-straight-rail",
  "elevated-half-diagonal-rail",
  "elevated-curved-rail-a",
  "elevated-curved-rail-b",
  "legacy-curved-rail",
  "legacy-straight-rail",
  "rail-ramp",
  "rail-support",
  "rail-chain-signal",
  "rail-signal",
  "reactor",
  "roboport",
  "simple-entity-with-owner",
  "simple-entity-with-force",
  "solar-panel",
  "space-platform-hub",
  "storage-tank",
  "thruster",
  "train-stop",
  "lane-splitter",
  "linked-belt",
  "loader-1x1",
  "loader",
  "splitter",
  "transport-belt",
  "underground-belt",
  "turret",
  "ammo-turret",
  "electric-turret",
  "fluid-turret",
  "artillery-wagon",
  "cargo-wagon",
  "fluid-wagon",
  "locomotive",
  "wall",
)

export type BuildableEntityType = keyof typeof BuildableEntityTypes

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
