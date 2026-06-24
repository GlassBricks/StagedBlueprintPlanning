// Copyright (c) 2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import expect from "tstl-expect"
import { getLastDebugPrintCall } from "../lib/test/misc"

test("debugPrint not in released code", () => {
  expect(getLastDebugPrintCall()).toBeNil()
})
