// Copyright (c) 2022 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { OnGuiClosedEvent } from "factorio:runtime"
import { registerFunctions } from "../references"
import { destroy } from "./render"

export function destroyOnClose(event: OnGuiClosedEvent): void {
  destroy(event.element)
}

registerFunctions("gui:util", {
  destroyOnClose,
})
