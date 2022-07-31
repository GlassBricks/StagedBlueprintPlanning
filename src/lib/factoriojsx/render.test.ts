/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of BBPP3.
 *
 * BBPP3 is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * BBPP3 is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with BBPP3. If not, see <https://www.gnu.org/licenses/>.
 */

import { State, state } from "../observable"
import { RegisterClass } from "../references"
import { testRender } from "../test-util/gui"
import { destroy } from "./render"
import {
  ButtonElementSpec,
  ChooseElemButtonElementSpec,
  ClassComponentSpec,
  Component,
  EmptyProps,
  FCSpec,
  FlowElementSpec,
  GuiEventHandler,
  SliderElementSpec,
  Spec,
  TabbedPaneElementSpec,
  TextBoxElementSpec,
  Tracker,
} from "./spec"

describe("create", () => {
  test("Sets spec property", () => {
    const spec: FlowElementSpec = {
      type: "flow",
      direction: "vertical",
    }
    const element = testRender(spec).native
    assert.same("vertical", element.direction)
  })

  test("Sets element property", () => {
    const spec: ChooseElemButtonElementSpec = {
      type: "choose-elem-button",
      elem_type: "item",
      locked: true,
    }
    const element = testRender(spec).native
    assert.is_true(element.locked)
  })

  test("Listens to source property", () => {
    const v = state<LocalisedString>("one")
    const spec: FlowElementSpec = {
      type: "flow",
      caption: v,
    }
    const element = testRender(spec).native
    assert.equal("one", element.caption)
    v.set("two")
    assert.equal("two", element.caption)
  })

  test("Call method property", () => {
    const value = state(1)
    const spec: SliderElementSpec = {
      type: "slider",
      value_step: value,
    }
    const element = testRender(spec).native
    assert.equal(1, element.get_slider_value_step())
    value.set(2)
    assert.equal(2, element.get_slider_value_step())
  })

  test("Slider minimum", () => {
    const value = state(1)
    const spec: SliderElementSpec = {
      type: "slider",
      minimum_value: value,
      maximum_value: 5,
    }
    const element = testRender(spec).native
    assert.equal(1, element.get_slider_minimum())
    assert.equal(5, element.get_slider_maximum())
    value.set(2)
    assert.equal(2, element.get_slider_minimum())
    assert.equal(5, element.get_slider_maximum())
  })

  test("Slider maximum", () => {
    const value = state(5)
    const spec: SliderElementSpec = {
      type: "slider",
      minimum_value: 1,
      maximum_value: value,
    }
    const element = testRender(spec).native
    assert.equal(1, element.get_slider_minimum())
    assert.equal(5, element.get_slider_maximum())
    value.set(6)
    assert.equal(1, element.get_slider_minimum())
    assert.equal(6, element.get_slider_maximum())
  })

  test("Does not allow source on create-only property", () => {
    const v = state<"vertical" | "horizontal">("vertical")
    const spec: FlowElementSpec = {
      type: "flow",
      direction: v as any,
    }
    assert.error(() => {
      testRender(spec)
    })
  })

  test("can specify children", () => {
    const spec: FlowElementSpec = {
      type: "flow",
      children: [
        {
          type: "button",
          caption: "hi",
        },
      ],
    }
    const element = testRender(spec).native
    assert.equal("button", element.children[0].type)
    assert.equal("hi", element.children[0].caption)
  })

  test("can specify multiple children", () => {
    const spec: FlowElementSpec = {
      type: "flow",
      children: [
        {
          type: "button",
          caption: "hi",
        },
        {
          type: "button",
          caption: "bye",
        },
      ],
    }
    const element = testRender(spec).native
    assert.equal("button", element.children[0].type)
    assert.equal("hi", element.children[0].caption)
    assert.equal("button", element.children[1].type)
    assert.equal("bye", element.children[1].caption)
  })
})

describe("styleMod", () => {
  test("sets property", () => {
    const spec: FlowElementSpec = {
      type: "flow",
      styleMod: {
        left_padding: 3,
      },
    }
    const element = testRender(spec).native
    assert.equals(3, element.style.left_padding)
  })

  test("sets setter property", () => {
    const spec: FlowElementSpec = {
      type: "flow",
      styleMod: {
        padding: [3, 3],
      },
    }
    const element = testRender(spec).native
    assert.equals(3, element.style.left_padding)
  })

  test("listens to source property", () => {
    const value = state(1)
    const spec: FlowElementSpec = {
      type: "flow",
      styleMod: {
        padding: value,
      },
    }
    const element = testRender(spec).native
    assert.equals(1, element.style.left_padding)
    value.set(2)
    assert.equals(2, element.style.left_padding)
  })
})

describe("destroy", () => {
  test("calling destroy sets invalid to false", () => {
    const spec: FlowElementSpec = {
      type: "flow",
      direction: "vertical",
    }
    const element = testRender(spec).native
    destroy(element)
    assert.is_false(element.valid)
  })

  test("calling destroy ends subscriptions", () => {
    const source = state("hi")
    const spec: FlowElementSpec = {
      type: "flow",
      caption: source,
    }
    const element = testRender(spec).native
    assert.equals(1, State._numObservers(source))
    destroy(element)
    assert.equals(0, State._numObservers(source))
  })

  test("calling destroy ends child subscriptions", () => {
    const source = state("hi")
    const spec: FlowElementSpec = {
      type: "flow",
      children: [
        {
          type: "flow",
          children: [
            {
              type: "button",
              caption: source,
            },
          ],
        },
      ],
    }
    const element = testRender(spec).native

    assert.equals(1, State._numObservers(source))
    destroy(element)
    assert.equals(0, State._numObservers(source))
  })
})

test("events", () => {
  const func = spy<GuiEventHandler["invoke"]>()
  const spec: ButtonElementSpec = {
    type: "button",
    on_gui_click: { invoke: func },
    on_gui_opened: { invoke: func },
  }
  const element = testRender(spec).native

  assert.spy(func).not_called()

  const fakeClickEvent: OnGuiClickEvent = {
    element: element as LuaGuiElement,
    name: defines.events.on_gui_click,
    player_index: element.player_index,
    tick: game.tick,
    alt: false,
    button: defines.mouse_button_type.left,
    control: false,
    shift: false,
  }
  script.get_event_handler(defines.events.on_gui_click)(fakeClickEvent)
  assert.spy(func).called_with(match._, fakeClickEvent)

  const fakeOpenEvent: OnGuiOpenedEvent = {
    element: element as LuaGuiElement,
    name: defines.events.on_gui_opened,
    player_index: element.player_index,
    tick: game.tick,
    gui_type: defines.gui_type.custom,
  }
  script.get_event_handler(defines.events.on_gui_opened)(fakeOpenEvent)
  assert.spy(func).called_with(match._, fakeOpenEvent)
})

test("observable value", () => {
  const val = state("one")
  const spec: TextBoxElementSpec = {
    type: "text-box",
    text: val,
  }
  const element = testRender(spec).native

  assert.same("one", val.get())
  assert.same("one", element.text)

  element.text = "two"
  const fakeEvent: OnGuiTextChangedEvent = {
    element: element as LuaGuiElement,
    name: defines.events.on_gui_text_changed,
    player_index: element.player_index,
    tick: game.tick,
    text: element.text,
  }
  script.get_event_handler(defines.events.on_gui_text_changed)(fakeEvent)

  assert.same("two", val.get())

  val.set("three")
  assert.same("three", element.text)
})

test("onCreate", () => {
  let element1: unknown
  const spec: FlowElementSpec = {
    type: "flow",
    onCreate(e) {
      element1 = e
    },
  }

  const element = testRender(spec).native
  assert.equal(element1, element)
})

test("tracker onMount", () => {
  const fn = spy<(this: unknown) => void>()
  const spec: FCSpec<any> = {
    type(props, tracker) {
      tracker.onMount(fn)
      return { type: "flow" }
    },
    props: {},
  }
  const element = testRender(spec).native
  assert.spy(fn).called()
  assert.same(fn.calls[0].refs[1], element)
})

test("tracker onDestroy", () => {
  const fn = spy()
  const spec: FCSpec<any> = {
    type(props, tracker) {
      tracker.getSubscription().add({ invoke: fn })

      return { type: "flow" }
    },
    props: {},
  }

  const element = testRender(spec).native
  assert.spy(fn).not_called()
  destroy(element)
  assert.spy(fn).called()
})

describe("Class component", () => {
  const results: unknown[] = []
  before_each(() => {
    results.length = 0
  })

  interface Props {
    cb: (element: BaseGuiElement) => void
  }

  @RegisterClass("Test component: Foo")
  class Foo extends Component<Props> {
    constructor() {
      super()
      results.push("constructed")
    }

    render(props: Props, tracker: Tracker): Spec {
      tracker.onMount((element) => {
        assert.equal("flow", element.type)
        results.push("onMount")
      })
      tracker.getSubscription().add({ invoke: () => results.push("destroyed") })
      results.push("render")
      return {
        type: "flow",
        onCreate: props.cb,
      }
    }
  }

  @RegisterClass("Test component: Foo2")
  class Foo2 extends Component<Props> {
    constructor() {
      super()
      results.push("constructed2")
    }

    render(props: Props, tracker: Tracker): Spec {
      tracker.onMount((element) => {
        assert.equal("flow", element.type)
        results.push("onMount2")
      })
      tracker.getSubscription().add({ invoke: () => results.push("destroyed2") })
      results.push("render2")
      return {
        type: Foo,
        props: { cb: props.cb },
      }
    }
  }

  const cb = function (this: unknown, element: BaseGuiElement) {
    results.push("cb " + element.type)
  }

  test("create1", () => {
    const spec: ClassComponentSpec<any> = {
      type: Foo,
      props: { cb },
    }
    const element = testRender(spec).native

    assert.equal("flow", element.type)
    assert.same(["constructed", "render", "cb flow", "onMount"], results)
    results.length = 0
    destroy(element)
    assert.same(["destroyed"], results)
  })

  test("create2", () => {
    const spec: ClassComponentSpec<any> = {
      type: Foo2,
      props: { cb },
    }
    const element = testRender(spec).native

    assert.equal("flow", element.type)
    assert.same(["constructed2", "render2", "constructed", "render", "cb flow", "onMount", "onMount2"], results)
    results.length = 0
    destroy(element)
    assert.same(["destroyed2", "destroyed"], results)
  })

  test("unregistered components give error", () => {
    class C extends Component<EmptyProps> {
      render(): Spec {
        return { type: "flow" }
      }
    }
    const spec: ClassComponentSpec<any> = {
      type: C,
      props: {},
    }
    assert.error(() => testRender(spec))
  })
})

describe("function component", () => {
  const results: unknown[] = []
  before_each(() => {
    results.length = 0
  })

  function Component(props: { cb: (element: BaseGuiElement) => void }, tracker: Tracker): FlowElementSpec {
    results.push("render")
    tracker.onMount(() => results.push("mountA"))
    tracker.onMount(() => results.push("mountB"))
    tracker.getSubscription().add({ invoke: () => results.push("destroyed") })
    return {
      type: "flow",
      onCreate: props.cb,
    }
  }

  function Component2(props: { cb: (element: BaseGuiElement) => void }, tracker: Tracker): Spec {
    results.push("render2")
    tracker.onMount(() => results.push("mount2A"))
    tracker.onMount(() => results.push("mount2B"))
    tracker.getSubscription().add({ invoke: () => results.push("destroyed2") })
    return {
      type: Component,
      props: { cb: props.cb },
    }
  }

  const cb = function (this: unknown, element: BaseGuiElement) {
    results.push(element.type)
  }

  test("render 1", () => {
    const spec: FCSpec<any> = {
      type: Component,
      props: { cb },
    }
    const element = testRender(spec).native

    assert.equal("flow", element.type)
    assert.same(["render", "flow", "mountA", "mountB"], results)
    results.length = 0
    destroy(element)
    assert.same(["destroyed"], results)
  })

  test("render 2", () => {
    const spec: FCSpec<any> = {
      type: Component2,
      props: { cb },
    }
    const element = testRender(spec).native

    assert.equal("flow", element.type)
    assert.same(["render2", "render", "flow", "mount2A", "mount2B", "mountA", "mountB"], results)
    results.length = 0
    destroy(element)
    assert.same(["destroyed2", "destroyed"], results)
  })
})

describe("Fragments", () => {
  test("rendering fragment with multiple children at root is error", () => {
    const spec: Spec = {
      type: "fragment",
      children: [{ type: "flow" }, { type: "flow" }],
    }
    assert.error(() => testRender(spec as any))
  })

  test("Fragment with multiple children inside another element is ok", () => {
    const spec: Spec = {
      type: "flow",
      children: [{ type: "fragment", children: [{ type: "flow" }, { type: "flow" }] }],
    }
    const element = testRender(spec).native
    assert.equal("flow", element.type)
    assert.equal(2, element.children.length)
    assert.equal("flow", element.children[0].type)
    assert.equal("flow", element.children[1].type)
  })

  test("fragment with multiple children as result of functional component", () => {
    function Comp(): Spec {
      return {
        type: "fragment",
        children: [{ type: "flow" }, { type: "flow" }],
      }
    }
    assert.error(() => testRender({ type: Comp, props: {} }))

    const spec2: Spec = {
      type: "flow",
      children: [{ type: Comp, props: {} }],
    }
    const element = testRender(spec2).native
    assert.equal("flow", element.type)
    assert.equal(2, element.children.length)
    assert.equal("flow", element.children[0].type)
    assert.equal("flow", element.children[1].type)
  })
})

test("tabbed-pane", () => {
  const spec: TabbedPaneElementSpec = {
    type: "tabbed-pane",
    children: [
      { type: "tab", caption: "one" },
      { type: "label", caption: "one content" },
      { type: "tab", caption: "two" },
      { type: "label", caption: "two content" },
    ],
  }
  const element = testRender(spec).native
  assert.equal(2, element.tabs.length)
  assert.equal("one", element.tabs[0].tab.caption)
  assert.equal("one content", element.tabs[0].content.caption)
  assert.equal("two", element.tabs[1].tab.caption)
  assert.equal("two content", element.tabs[1].content.caption)
})
