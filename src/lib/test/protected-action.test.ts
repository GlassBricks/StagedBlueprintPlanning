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

import { L_Interaction } from "../../locale"
import { protectedAction } from "../protected-action"

test("Protected action with no error", () => {
  const result = protectedAction(() => "test")
  assert.same("test", result)
})

test("Protected action with unexpected error", () => {
  const sp = spy()
  rawset(game, "print", sp)
  after_test(() => rawset(game, "print", nil!))

  const result = protectedAction(() => error("test1231"))
  assert.is_nil(result)
  const called = sp.calls[0].refs[0] as [string, string]
  assert.equal(L_Interaction.UnexpectedError, called[0])
  const data = called[1]
  assert.is_string(data)
  assert.match("test1231", data)
})
