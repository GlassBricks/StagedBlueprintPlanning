// Copyright (c) 2022 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { LocalisedString } from "factorio:runtime"
import expect from "tstl-expect"
import { MutableProperty, property } from "../../../event"
import { FactorioJsx } from "../../../factoriojsx"
import { If } from "../../../factoriojsx/components"
import { ElementWrapper, testRender } from "../../gui"

let condition: MutableProperty<boolean>

before_each(() => {
  condition = property(true)
})

function findAllLabels(root: ElementWrapper): LocalisedString[] {
  return root.findAllSatisfying((x) => x.type == "label").map((x) => x.element.caption)
}
test("single then", () => {
  const component = testRender(<If condition={condition} then={{ invoke: () => <label caption="true" /> }} />)
  expect(findAllLabels(component)).toEqual(["true"])

  condition.set(false)
  expect(findAllLabels(component)).toEqual([])
})

test("then and else", () => {
  const component = testRender(
    <If
      condition={condition}
      then={{ invoke: () => <label caption="true" /> }}
      else={{ invoke: () => <label caption="false" /> }}
    />,
  )
  expect(findAllLabels(component)).toEqual(["true"])

  condition.set(false)
  expect(findAllLabels(component)).toEqual(["false"])

  condition.set(true)
  expect(findAllLabels(component)).toEqual(["true"])
})
