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
