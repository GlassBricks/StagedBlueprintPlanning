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

import { Data } from "typed-factorio/data/types"
import { CustomInputs } from "../constants"
import { CustomInputPrototype } from "../declarations/data"

declare const data: Data

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
data.extend([buildInput, removePoleCablesInput])

const nextStage: CustomInputPrototype = {
  type: "custom-input",
  name: CustomInputs.NextStage,
  action: "lua",
  key_sequence: "CONTROL + mouse-wheel-down",
  order: "b[navigate]-a[next-stage]",
}
const previousStage: CustomInputPrototype = {
  type: "custom-input",
  name: CustomInputs.PreviousStage,
  action: "lua",
  key_sequence: "CONTROL + mouse-wheel-up",
  order: "b[navigate]-b[previous-stage]",
}
const goToNextNotableStage: CustomInputPrototype = {
  type: "custom-input",
  name: CustomInputs.GoToNextNotableStage,
  action: "lua",
  key_sequence: "CONTROL + mouse-button-3",
  order: "b[navigate]-c[go-to-next-notable-stage]",
}
const goToFirstStage: CustomInputPrototype = {
  type: "custom-input",
  name: CustomInputs.GoToFirstStage,
  action: "lua",
  key_sequence: "CONTROL + SHIFT + mouse-button-3",
  order: "b[navigate]-d[go-to-first-stage]",
}
const moveToThisStage: CustomInputPrototype = {
  type: "custom-input",
  name: CustomInputs.MoveToThisStage,
  action: "lua",
  key_sequence: "CONTROL + ALT + mouse-button-3",
  order: "b[navigate]-e[move-to-this-stage]",
}
const nextAssembly: CustomInputPrototype = {
  name: CustomInputs.NextAssembly,
  type: "custom-input",

  key_sequence: "",
  action: "lua",
  order: "b[navigate]-f[next-assembly]",
}
const previousAssembly: CustomInputPrototype = {
  name: CustomInputs.PreviousAssembly,
  type: "custom-input",

  key_sequence: "",
  action: "lua",
  order: "b[navigate]-g[previous-assembly]",
}

const stageSelectNext: CustomInputPrototype = {
  name: CustomInputs.StageSelectNext,
  type: "custom-input",

  action: "lua",
  key_sequence: "SHIFT + mouse-wheel-down",
  order: "a[tools]-g[stage-move-tool]-a[next]",
}
const stageSelectPrevious: CustomInputPrototype = {
  name: CustomInputs.StageSelectPrevious,
  type: "custom-input",

  key_sequence: "SHIFT + mouse-wheel-up",
  action: "lua",
  order: "a[tools]-g[stage-move-tool]-b[previous]",
}

data.extend([
  nextStage,
  previousStage,
  nextAssembly,
  previousAssembly,
  goToFirstStage,
  goToNextNotableStage,
  moveToThisStage,
  stageSelectNext,
  stageSelectPrevious,
])
