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

import { BaseGuiElement } from "factorio:runtime"
import expect, { mock } from "tstl-expect"
import { FactorioJsx, GuiEventHandler } from "../factoriojsx"
import { getDescription, isRoot, makeWrapper, testRender } from "./gui"
import { getPlayer } from "./misc"

describe("makeWrapper", () => {
  let element: BaseGuiElement
  test("create", () => {
    element = makeWrapper()
    expect(isRoot(element)).to.equal(true)
    expect(getPlayer().gui.screen).to.equal(element.parent)
  })
  test("after create", () => {
    expect(element.valid).to.equal(false)
  })
})

describe("getDescription", () => {
  it("with name", () => {
    const element = makeWrapper().add({
      type: "label",
      name: "test-label",
    })
    expect(getDescription(element)).to.equal("<root>.test-label")
  })
  it("without name", () => {
    const element = makeWrapper().add({
      type: "label",
    })
    expect(getDescription(element)).to.equal("<root>.[1, label]")
  })
})

test("testRender", () => {
  const element = testRender(<flow name="test-flow" />)
  expect(element.isRoot()).to.equal(true)
  expect(getPlayer().gui.screen).to.equal(element.element.parent)
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
    expect(found).to.equal(flow)
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
    expect(found).to.equal(flow)
  })
})

test("simulateEvent", () => {
  const fn = mock.fn<GuiEventHandler["invoke"]>()
  const button = testRender(<button on_gui_click={{ invoke: fn }} />)
  expect(fn).not.called()
  button.simulateClick()
  expect(fn).calledTimes(1)
})
