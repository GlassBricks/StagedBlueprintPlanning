/*
 * Copyright (c) 2024 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { L_Game } from "../constants"
import { Property, Props } from "../lib"
import { Element, ElemProps, FactorioJsx } from "../lib/factoriojsx"
import { DiffedProperty } from "./DiffedProperty"

export function RevertButton(
  props: {
    property: DiffedProperty<unknown>
  } & ElemProps<"sprite-button">,
): Element {
  const prop = props.property
  return (
    <sprite-button
      style="mini_button"
      sprite="utility/reset"
      tooltip={[L_Game.Reset]}
      visible={prop.overrideValue.notNil()}
      on_gui_click={Props.setValueFn(prop.overrideValue, nil)}
      {...props}
    />
  )
}

export function MaybeRevertButton(property: Property<unknown>): Element | nil {
  if (property instanceof DiffedProperty) {
    return <RevertButton property={property} />
  }
}
