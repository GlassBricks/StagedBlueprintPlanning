/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

/* eslint-disable @typescript-eslint/no-empty-function */
/** @noSelfInFile */
import { Events } from "../Events"

const eventId = defines.events.script_raised_set_tiles
after_each(() => {
  Events.clearHandlers(eventId)
})

test("Can register directly", () => {
  const func = () => {}
  Events.on(eventId, func)

  assert.equal(func, script.get_event_handler(eventId))
})

test("Can register multiple", () => {
  const actions: number[] = []
  Events.on(eventId, () => {
    actions.push(1)
  })
  Events.on(eventId, () => {
    actions.push(2)
  })
  Events.on(eventId, () => {
    actions.push(3)
  })
  script.raise_script_set_tiles({ surface_index: 1 as SurfaceIndex, tiles: [] })
  assert.same([1, 2, 3], actions)
})

test("Shorthand register", () => {
  const func = () => {}
  Events.script_raised_set_tiles(func)
  assert.equal(func, script.get_event_handler(eventId))
})

test("Object register", () => {
  const func = () => {}
  Events.onAll({
    script_raised_set_tiles: func,
  })
  assert.equal(func, script.get_event_handler(eventId))
})
