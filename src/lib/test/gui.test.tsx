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

import { FactorioJsx, GuiEventHandler } from "../factoriojsx"
import { getDescription, isRoot, makeWrapper, testRender } from "./gui"
import { getPlayer } from "./misc"

describe("makeWrapper", () => {
  let element: BaseGuiElement
  test("create", () => {
    element = makeWrapper()
    assert.true(isRoot(element))
    assert.equal(element.parent, getPlayer().gui.screen)
  })
  test("after create", () => {
    assert.false(element.valid)
  })
})

describe("getDescription", () => {
  it("with name", () => {
    const element = makeWrapper().add({
      type: "label",
      name: "test-label",
    })
    assert.same("<root>.test-label", getDescription(element))
  })
  it("without name", () => {
    const element = makeWrapper().add({
      type: "label",
    })
    assert.same("<root>.[1, label]", getDescription(element))
  })
})

test("testRender", () => {
  const element = testRender(<flow name="test-flow" />)
  assert.true(element.isRoot())
  assert.equal(element.native.parent, getPlayer().gui.screen)
})

describe("findSatisfying", () => {
  it("finds element", () => {
    const element = testRender(
      <flow>
        <flow caption="hi" />
      </flow>,
    )
    const found = element.findSatisfying((x) => x.caption === "hi").native
    const flow = element.native.children[0]
    assert.equal(flow, found)
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
    const found = element.findSatisfying((x) => x.caption === "baz").native
    const flow = element.native.children[0].children[0].children[1]
    assert.equal(flow, found)
  })
})

test("simulateEvent", () => {
  const fn = spy<GuiEventHandler["invoke"]>()
  const button = testRender(<button on_gui_click={{ invoke: fn }} />)
  assert.spy(fn).not_called()
  button.simulateClick()
  assert.spy(fn).called(1)
})
