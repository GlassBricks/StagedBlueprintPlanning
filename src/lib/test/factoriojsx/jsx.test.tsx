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

import { Component, FactorioJsx, FCSpec, FlowElementSpec, Spec, SpecChildren } from "../../factoriojsx"
import { RegisterClass } from "../../references"

test("Basic element", () => {
  const el = <flow />
  assert.same(
    {
      type: "flow",
    },
    el,
  )
})

test("Basic element with props", () => {
  const el = <flow caption="foo" />

  assert.same({ type: "flow", caption: "foo" }, el)
})

test("Basic element with children", () => {
  const el = (
    <flow>
      <flow name="bob" />
    </flow>
  )

  assert.same({ type: "flow", children: [{ type: "flow", name: "bob" }] }, el)
})

test("basic element with multiple children", () => {
  const el = (
    <flow>
      <flow name="bob" />
      <flow name="joe" />
    </flow>
  )

  assert.same(
    {
      type: "flow",
      children: [
        { type: "flow", name: "bob" },
        { type: "flow", name: "joe" },
      ],
    },
    el,
  )
})

test("basic element with nil children", () => {
  const el = <flow>{nil}</flow>
  assert.same({ type: "flow" }, el)
})

test("basic element with array children", () => {
  const array = [<flow name="bob" />, <flow name="joe" />]
  const el = <flow>{array}</flow>
  assert.same(
    {
      type: "flow",
      children: [
        { type: "flow", name: "bob" },
        { type: "flow", name: "joe" },
      ],
    },
    el,
  )
})

type TestProps = { me?: string; children?: SpecChildren }
function Foo(props: TestProps) {
  return <flow caption={props.me}>{props.children}</flow>
}

test("Function component", () => {
  const el = <Foo />
  assert.same({ type: Foo, props: {} }, el)
})

test("Function component with props", () => {
  const el = <Foo me="bob" />
  assert.same({ type: Foo, props: { me: "bob" } }, el)
})

test("Function component with children", () => {
  const el = (
    <Foo>
      <flow name="bob" />
    </Foo>
  )
  assert.same(
    {
      type: Foo,
      props: {
        children: { type: "flow", name: "bob" },
      },
    },
    el,
  )
})

test("Function component with multiple children", () => {
  const el = (
    <Foo>
      <flow name="bob" />
      <flow name="joe" />
    </Foo>
  )
  assert.same(
    {
      type: Foo,
      props: {
        children: [
          { type: "flow", name: "bob" },
          { type: "flow", name: "joe" },
        ],
      },
    },
    el,
  )
})

test("Function component with nil children", () => {
  const el = <Foo>{nil}</Foo>
  assert.same({ type: Foo, props: {} }, el)
})

@RegisterClass("Test component: jsx Foo")
class FooClass extends Component<TestProps> {
  render(props: TestProps): Spec {
    return <flow caption={props.me}>{props.children}</flow>
  }
}

test("Class component", () => {
  const el = <FooClass />
  assert.same({ type: FooClass, props: {} }, el)
})

test("Class component with props", () => {
  const el = <FooClass me="bob" />
  assert.same({ type: FooClass, props: { me: "bob" } }, el)
})

test("Class component with children", () => {
  const el = (
    <FooClass>
      <flow name="bob" />
    </FooClass>
  )
  assert.same(
    {
      type: FooClass,
      props: {
        children: { type: "flow", name: "bob" },
      },
    },
    el,
  )
})

test("Class component with multiple children", () => {
  const el = (
    <FooClass>
      <flow name="bob" />
      <flow name="joe" />
    </FooClass>
  )
  assert.same(
    {
      type: FooClass,
      props: {
        children: [
          { type: "flow", name: "bob" },
          { type: "flow", name: "joe" },
        ],
      },
    },
    el,
  )
})

test("Class component with nil children", () => {
  const el = <FooClass>{nil}</FooClass>
  assert.same({ type: FooClass, props: {} }, el)
})

describe("fragment", () => {
  test("basic fragment", () => {
    const el = (
      <>
        <flow name="bob" />
        <flow name="joe" />
      </>
    )
    assert.same(
      {
        type: "fragment",
        children: [
          { type: "flow", name: "bob" },
          { type: "flow", name: "joe" },
        ],
      },
      el,
    )
  })

  test("basic fragment with nil children", () => {
    const el = <>{nil}</>
    assert.same({ type: "fragment", children: nil }, el)
  })

  test("basic fragment with array children", () => {
    const array = [<flow name="bob" />, <flow name="joe" />]
    const el = <>{array}</>
    assert.same(
      {
        type: "fragment",
        children: [
          { type: "flow", name: "bob" },
          { type: "flow", name: "joe" },
        ],
      },
      el,
    )
  })

  test("fragment is spread in parent in normal element", () => {
    const el = (
      <flow>
        <flow name="1" />
        <>
          <flow name="2" />
          <flow name="3" />
        </>
        <flow name="4" />
      </flow>
    )
    assert.same(
      [
        { type: "flow", name: "1" },
        { type: "flow", name: "2" },
        { type: "flow", name: "3" },
        { type: "flow", name: "4" },
      ],
      (el as FlowElementSpec).children,
    )
  })

  test("fragment only is spread in parent in function component", () => {
    const el = (
      <Foo>
        <>
          <flow name="2" />
          <flow name="3" />
        </>
      </Foo>
    )
    assert.same(
      [
        { type: "flow", name: "2" },
        { type: "flow", name: "3" },
      ],
      (el as FCSpec<any>).props.children,
    )
  })

  test("fragment with neighbors is spread in parent in function component", () => {
    const el = (
      <Foo>
        <flow name="1" />
        <>
          <flow name="2" />
          <flow name="3" />
        </>
        <flow name="4" />
      </Foo>
    )
    assert.same(
      [
        { type: "flow", name: "1" },
        { type: "flow", name: "2" },
        { type: "flow", name: "3" },
        { type: "flow", name: "4" },
      ],
      (el as FCSpec<any>).props.children,
    )
  })
})
