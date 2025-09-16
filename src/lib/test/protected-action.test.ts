// Copyright (c) 2022 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import expect, { mock } from "tstl-expect"
import { L_Interaction } from "../../locale"
import { protectedAction } from "../protected-action"
import { proxyGlobalInTest } from "./proxy"

test("Protected action with no error", () => {
  const result = protectedAction(() => "test")
  expect(result).toEqual("test")
})

test("Protected action with unexpected error", () => {
  proxyGlobalInTest("game")
  const sp = mock.fnNoSelf()
  rawset(game, "print", sp)

  const result = protectedAction(() => error("test1231"))
  expect(result).toBeNil()
  expect(sp).toHaveBeenCalledWith([L_Interaction.UnexpectedError, expect.stringMatching("test1231")])
})
