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
import expect, { mock } from "tstl-expect"

test("Protected action with no error", () => {
  const result = protectedAction(() => "test")
  expect(result).to.equal("test")
})

test("Protected action with unexpected error", () => {
  const sp = mock.fnNoSelf()
  rawset(game, "print", sp)
  after_test(() => rawset(game, "print", nil!))

  const result = protectedAction(() => error("test1231"))
  expect(result).to.be.nil()
  expect(sp).to.be.calledWith([L_Interaction.UnexpectedError, expect.stringMatching("test1231")])
})
