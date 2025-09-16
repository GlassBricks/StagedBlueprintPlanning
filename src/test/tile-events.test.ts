// Copyright (c) 2024 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import expect, { mock } from "tstl-expect"
import { withTileEventsDisabled } from "../project/tile-events"

test("withTileEventsDisabled", () => {
  const oldHandler = script.get_event_handler(defines.events.script_raised_set_tiles)
  const fn = mock.fnNoSelf()
  withTileEventsDisabled(fn, 1, 2, 3)
  expect(script.get_event_handler(defines.events.script_raised_set_tiles)).toBe(oldHandler)
  expect(fn).toHaveBeenCalledWith(1, 2, 3)
})
