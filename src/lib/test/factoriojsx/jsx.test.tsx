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

import expect from "tstl-expect"
import { Component, Element, ElementChildren, FactorioJsx, FlowElement, FunctionalComponent } from "../../factoriojsx"
import { RegisterClass } from "../../references"

test("Basic element", () => {
  const el = <flow />
  expect(el).toEqual({
    type: "flow",
  })
})

test("Basic element with props", () => {
  const el = <flow caption="foo" />

  expect(el).toEqual({ type: "flow", caption: "foo" })
})

test("Basic element with children", () => {
  const el = (
    <flow>
      <flow name="bob" />
    </flow>
  )

  expect(el).toEqual({ type: "flow", children: [{ type: "flow", name: "bob" }] })
})

test("basic element with multiple children", () => {
  const el = (
    <flow>
      <flow name="bob" />
      <flow name="joe" />
    </flow>
  )

  expect(el).toEqual({
    type: "flow",
    children: [
      { type: "flow", name: "bob" },
      { type: "flow", name: "joe" },
    ],
  })
})

test("basic element with nil children", () => {
  const el = <flow>{nil}</flow>
  expect(el).toEqual({ type: "flow" })
})

test("basic element with array children", () => {
  const array = [<flow name="bob" />, <flow name="joe" />]
  const el = <flow>{array}</flow>
  expect(el).toEqual({
    type: "flow",
    children: [
      { type: "flow", name: "bob" },
      { type: "flow", name: "joe" },
    ],
  })
})

type TestProps = { me?: string; children?: ElementChildren }
function Foo(props: TestProps) {
  return <flow caption={props.me}>{props.children}</flow>
}

test("Function component", () => {
  const el = <Foo />
  expect(el).toEqual({ type: Foo, props: {} })
})

test("Function component with props", () => {
  const el = <Foo me="bob" />
  expect(el).toEqual({ type: Foo, props: { me: "bob" } })
})

test("Function component with children", () => {
  const el = (
    <Foo>
      <flow name="bob" />
    </Foo>
  )
  expect(el).toEqual({
    type: Foo,
    props: {
      children: { type: "flow", name: "bob" },
    },
  })
})

test("Function component with multiple children", () => {
  const el = (
    <Foo>
      <flow name="bob" />
      <flow name="joe" />
    </Foo>
  )
  expect(el).toEqual({
    type: Foo,
    props: {
      children: [
        { type: "flow", name: "bob" },
        { type: "flow", name: "joe" },
      ],
    },
  })
})

test("Function component with nil children", () => {
  const el = <Foo>{nil}</Foo>
  expect(el).toEqual({ type: Foo, props: {} })
})

@RegisterClass("Test component: jsx Foo")
class FooClass extends Component<TestProps> {
  render(props: TestProps): Element {
    return <flow caption={props.me}>{props.children}</flow>
  }
}

test("Class component", () => {
  const el = <FooClass />
  expect(el).toEqual({ type: FooClass, props: {} })
})

test("Class component with props", () => {
  const el = <FooClass me="bob" />
  expect(el).toEqual({ type: FooClass, props: { me: "bob" } })
})

test("Class component with children", () => {
  const el = (
    <FooClass>
      <flow name="bob" />
    </FooClass>
  )
  expect(el).toEqual({
    type: FooClass,
    props: {
      children: { type: "flow", name: "bob" },
    },
  })
})

test("Class component with multiple children", () => {
  const el = (
    <FooClass>
      <flow name="bob" />
      <flow name="joe" />
    </FooClass>
  )
  expect(el).toEqual({
    type: FooClass,
    props: {
      children: [
        { type: "flow", name: "bob" },
        { type: "flow", name: "joe" },
      ],
    },
  })
})

test("Class component with nil children", () => {
  const el = <FooClass>{nil}</FooClass>
  expect(el).toEqual({ type: FooClass, props: {} })
})

describe("fragment", () => {
  test("basic fragment", () => {
    const el = (
      <>
        <flow name="bob" />
        <flow name="joe" />
      </>
    )
    expect(el).toEqual({
      type: "fragment",
      children: [
        { type: "flow", name: "bob" },
        { type: "flow", name: "joe" },
      ],
    })
  })

  test("basic fragment with nil children", () => {
    const el = <>{nil}</>
    expect(el).toEqual({ type: "fragment", children: nil })
  })

  test("basic fragment with array children", () => {
    const array = [<flow name="bob" />, <flow name="joe" />]
    const el = <>{array}</>
    expect(el).toEqual({
      type: "fragment",
      children: [
        { type: "flow", name: "bob" },
        { type: "flow", name: "joe" },
      ],
    })
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
    expect((el as FlowElement).children).toEqual([
      { type: "flow", name: "1" },
      { type: "flow", name: "2" },
      { type: "flow", name: "3" },
      { type: "flow", name: "4" },
    ])
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
    expect((el as FunctionalComponent<any>).props.children).toEqual([
      { type: "flow", name: "2" },
      { type: "flow", name: "3" },
    ])
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
    expect((el as FunctionalComponent<any>).props.children).toEqual([
      { type: "flow", name: "1" },
      { type: "flow", name: "2" },
      { type: "flow", name: "3" },
      { type: "flow", name: "4" },
    ])
  })
})
