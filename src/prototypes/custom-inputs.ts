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
