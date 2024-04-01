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

import expect, { mock } from "tstl-expect"
import { withTileEventsDisabled } from "../project/tile-events"

test("withTileEventsDisabled", () => {
  const oldHandler = script.get_event_handler(defines.events.script_raised_set_tiles)
  const fn = mock.fnNoSelf()
  withTileEventsDisabled(fn, 1, 2, 3)
  expect(script.get_event_handler(defines.events.script_raised_set_tiles)).toBe(oldHandler)
  expect(fn).toHaveBeenCalledWith(1, 2, 3)
})
