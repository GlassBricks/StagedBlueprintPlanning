// Copyright (c) 2022 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { BaseGuiElement } from "factorio:runtime"
import expect, { mock } from "tstl-expect"
import { FactorioJsx, GuiEventHandler } from "../factoriojsx"
import { getDescription, isRoot, makeWrapper, testRender } from "./gui"
import { getPlayer } from "./misc"

describe("makeWrapper", () => {
  let element: BaseGuiElement
  test("create", () => {
    element = makeWrapper()
    expect(isRoot(element)).toEqual(true)
    expect(getPlayer().gui.screen).toEqual(element.parent)
  })
  test("after create", () => {
    expect(element.valid).toEqual(false)
  })
})

describe("getDescription", () => {
  it("with name", () => {
    const element = makeWrapper().add({
      type: "label",
      name: "test-label",
    })
    expect(getDescription(element)).toEqual("<root>.test-label")
  })
  it("without name", () => {
    const element = makeWrapper().add({
      type: "label",
    })
    expect(getDescription(element)).toEqual("<root>.[1, label]")
  })
})

test("testRender", () => {
  const element = testRender(<flow name="test-flow" />)
  expect(element.isRoot()).toEqual(true)
  expect(getPlayer().gui.screen).toEqual(element.element.parent)
})

describe("findSatisfying", () => {
  it("finds element", () => {
    const element = testRender(
      <flow>
        <flow caption="hi" />
      </flow>,
    )
    const found = element.findSatisfying((x) => x.caption == "hi").element
    const flow = element.element.children[0]
    expect(found).toEqual(flow)
  })

  it("finds deep element", () => {
    const element = testRender(
      <flow caption={"foo"}>
        <frame>
          <flow caption={"bar"}>
            <flow caption={"biz"} />
            <flow caption={"baz"} />
          </flow>
        </frame>
      </flow>,
    )
    const found = element.findSatisfying((x) => x.caption == "baz").element
    const flow = element.element.children[0].children[0].children[1]
    expect(found).toEqual(flow)
  })
})

test("simulateEvent", () => {
  const fn = mock.fn<GuiEventHandler["invoke"]>()
  const button = testRender(<button on_gui_click={{ invoke: fn }} />)
  expect(fn).not.toHaveBeenCalled()
  button.click()
  expect(fn).toHaveBeenCalledTimes(1)
})
