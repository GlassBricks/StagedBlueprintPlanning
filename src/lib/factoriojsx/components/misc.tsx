// Copyright (c) 2022-2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Element, FactorioJsx } from "../index"

export const HorizontalPusher = (): Element => (
  <empty-widget
    styleMod={{
      horizontally_stretchable: true,
      horizontally_squashable: true,
    }}
  />
)

export const VerticalPusher = (): Element => (
  <empty-widget
    styleMod={{
      vertically_stretchable: true,
      vertically_squashable: true,
    }}
  />
)

export const HorizontalSpacer = ({ width }: { width: number }): Element => (
  <empty-widget styleMod={{ natural_width: width }} />
)
export const VerticalSpacer = ({ height }: { height: number }): Element => (
  <empty-widget styleMod={{ natural_height: height }} />
)
