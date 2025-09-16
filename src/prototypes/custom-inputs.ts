// Copyright (c) 2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { PrototypeData } from "factorio:common"
import { CustomInputPrototype } from "factorio:prototype"
import { CustomInputs } from "../constants"

declare const data: PrototypeData

const buildInput: CustomInputPrototype = {
  type: "custom-input",
  name: CustomInputs.Build,

  key_sequence: "",
  linked_game_control: "build",
}
const removePoleCablesInput: CustomInputPrototype = {
  type: "custom-input",
  name: CustomInputs.RemovePoleCables,

  key_sequence: "",
  linked_game_control: "remove-pole-cables",
}
const confirmGuiInput: CustomInputPrototype = {
  type: "custom-input",
  name: CustomInputs.ConfirmGui,

  key_sequence: "",
  linked_game_control: "confirm-gui",
}
data.extend([buildInput, removePoleCablesInput, confirmGuiInput])

data.extend<CustomInputPrototype>(
  [
    [CustomInputs.NextStage, "CONTROL + mouse-wheel-down"],
    [CustomInputs.PreviousStage, "CONTROL + mouse-wheel-up"],
    [CustomInputs.GoToProjectFirstStage],
    [CustomInputs.GoToProjectLastStage],
    [CustomInputs.NextProject],
    [CustomInputs.PreviousProject],
    [CustomInputs.ExitProject],
    [CustomInputs.ReturnToLastProject],
    [CustomInputs.GoToEntityFirstStage, "CONTROL + mouse-button-3"],
    [CustomInputs.MoveToThisStage, "CONTROL + ALT + mouse-button-3"],
    [CustomInputs.ForceDelete, "CONTROL + SHIFT + mouse-button-2"],
    [CustomInputs.StageSelectNext, "SHIFT + mouse-wheel-down"],
    [CustomInputs.StageSelectPrevious, "SHIFT + mouse-wheel-up"],
    [CustomInputs.ToggleStagedCopy],
    [CustomInputs.NewStageAfterCurrent],
    [CustomInputs.NewStageAtFront],
    [CustomInputs.GetStageBlueprint],
    [CustomInputs.GetBlueprintBook],
  ].map(
    ([name, key_sequence], index) =>
      ({
        type: "custom-input",
        name,
        key_sequence: key_sequence ?? "",
        order: tostring(index),
      }) satisfies CustomInputPrototype,
  ),
)
