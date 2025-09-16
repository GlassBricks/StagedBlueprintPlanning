// Copyright (c) 2024 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import expect from "tstl-expect"
import { property } from "../../lib"
import { FactorioJsx } from "../../lib/factoriojsx"
import { testRender } from "../../lib/test/gui"
import { DiffedProperty } from "../../utils/DiffedProperty"
import { RevertButton } from "../../utils/RevertButton"

test("RevertButton", () => {
  const overrideProp = new DiffedProperty(property(nil), property(true))
  overrideProp.set(false)

  expect(overrideProp.get()).toBe(false)
  expect(overrideProp.overrideValue.get()).toBe(false)

  const button = testRender<"sprite-button">(<RevertButton property={overrideProp} />)
  expect(button.element.sprite).toBe("utility/reset")
  expect(button.element.visible).toBe(true)

  button.click()

  expect(overrideProp.get()).toBe(true)
  expect(overrideProp.overrideValue.get()).toBe(nil)

  expect(button.element.visible).toBe(false)
})
