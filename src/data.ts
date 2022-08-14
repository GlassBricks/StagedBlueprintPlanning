/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of BBPP3.
 *
 * BBPP3 is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * BBPP3 is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with BBPP3. If not, see <https://www.gnu.org/licenses/>.
 */

import { Data } from "typed-factorio/data/types"
import { CustomInputs } from "./constants"

declare const data: Data

interface CustomInput {
  name: string
  type: "custom-input"

  key_sequence: string
  linked_game_control?: string
}

const buildInput: CustomInput = {
  name: CustomInputs.Build,
  type: "custom-input",

  key_sequence: "",
  linked_game_control: "build",
}
const removePoleCablesInput: CustomInput = {
  name: CustomInputs.RemovePoleCables,
  type: "custom-input",

  key_sequence: "",
  linked_game_control: "remove-pole-cables",
}

data.extend([buildInput, removePoleCablesInput])
