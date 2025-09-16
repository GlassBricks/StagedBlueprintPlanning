// Copyright (c) 2024 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

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

export function ManualRevertButton(props: ElemProps<"sprite-button">): Element {
  return <sprite-button style="mini_button" sprite="utility/reset" tooltip={[L_Game.Reset]} {...props} />
}

export function MaybeRevertButton(property: Property<unknown>): Element | nil {
  if (property instanceof DiffedProperty) {
    return <RevertButton property={property} />
  }
}
