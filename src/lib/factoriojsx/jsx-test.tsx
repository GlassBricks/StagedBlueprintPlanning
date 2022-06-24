import { RegisterClass } from "../references"
import { FactorioJsx, FCSpec, FlowElementSpec, SpecChildren } from "./index"
import { Component, Spec } from "./spec"

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

test("basic element with undefined children", () => {
  const el = <flow>{undefined}</flow>
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

test("Function component with undefined children", () => {
  const el = <Foo>{undefined}</Foo>
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

test("Class component with undefined children", () => {
  const el = <FooClass>{undefined}</FooClass>
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

  test("basic fragment with undefined children", () => {
    const el = <>{undefined}</>
    assert.same({ type: "fragment", children: undefined }, el)
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
