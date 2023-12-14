/*
 * Copyright (c) 2022-2023 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import {
  BaseGuiElement,
  LocalisedString,
  LuaGuiElement,
  OnGuiClickEvent,
  OnGuiOpenedEvent,
  OnGuiTextChangedEvent,
} from "factorio:runtime"
import expect, { mock } from "tstl-expect"
import { _numObservers, property } from "../../event"
import {
  ChooseElemButtonElement,
  ClassComponent,
  Component,
  destroy,
  Element,
  FlowElement,
  FunctionalComponent,
  getComponentInstance,
  GuiEventHandler,
  RenderContext,
  SliderElement,
  TabbedPaneElement,
  TextBoxElement,
  TextFieldElement,
} from "../../factoriojsx"
import { RegisterClass } from "../../references"
import { testRender } from "../gui"

describe("create", () => {
  test("Sets spec property", () => {
    const spec: FlowElement = {
      type: "flow",
      direction: "vertical",
    }
    expect(testRender(spec).element.direction).toEqual("vertical")
  })

  test("Sets element property", () => {
    const spec: ChooseElemButtonElement = {
      type: "choose-elem-button",
      elem_type: "item",
      locked: true,
    }
    expect(testRender(spec).element.locked).toBe(true)
  })

  test("Listens to source property", () => {
    const v = property<LocalisedString>("one")
    const spec: FlowElement = {
      type: "flow",
      caption: v,
    }
    const element = testRender(spec).element
    expect(element.caption).toBe("one")
    v.set("two")
    expect(element.caption).toBe("two")
  })

  test("Call method property", () => {
    const value = property(1)
    const spec: SliderElement = {
      type: "slider",
      value_step: value,
    }
    const element = testRender(spec).element
    expect(element.get_slider_value_step()).toBe(1)
    value.set(2)
    expect(element.get_slider_value_step()).toBe(2)
  })

  test("Slider minimum", () => {
    const value = property(1)
    const spec: SliderElement = {
      type: "slider",
      minimum_value: value,
      maximum_value: 5,
    }
    const element = testRender(spec).element
    expect(element.get_slider_minimum()).toBe(1)
    expect(element.get_slider_maximum()).toBe(5)
    value.set(2)
    expect(element.get_slider_minimum()).toBe(2)
    expect(element.get_slider_maximum()).toBe(5)
  })

  test("Slider maximum", () => {
    const value = property(5)
    const spec: SliderElement = {
      type: "slider",
      minimum_value: 1,
      maximum_value: value,
    }
    const element = testRender(spec).element
    expect(element.get_slider_minimum()).toBe(1)
    expect(element.get_slider_maximum()).toBe(5)
    value.set(6)
    expect(element.get_slider_minimum()).toBe(1)
    expect(element.get_slider_maximum()).toBe(6)
  })

  test("Does not allow source on create-only property", () => {
    const v = property<"vertical" | "horizontal">("vertical")
    const spec: FlowElement = {
      type: "flow",
      direction: v as any,
    }
    expect(() => {
      testRender(spec)
    }).toError()
  })

  test("can specify children", () => {
    const spec: FlowElement = {
      type: "flow",
      children: [
        {
          type: "button",
          caption: "hi",
        },
      ],
    }
    const element = testRender(spec).element
    expect(element.children[0].type).toBe("button")
    expect(element.children[0].caption).toBe("hi")
  })

  test("can specify multiple children", () => {
    const spec: FlowElement = {
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
    const element = testRender(spec).element
    expect(element.children[0].type).toBe("button")
    expect(element.children[0].caption).toBe("hi")
    expect(element.children[1].type).toBe("button")
    expect(element.children[1].caption).toBe("bye")
  })
})

describe("styleMod", () => {
  test("sets property", () => {
    const spec: FlowElement = {
      type: "flow",
      styleMod: {
        left_padding: 3,
      },
    }
    expect(testRender(spec).element.style.left_padding).toEqual(3)
  })

  test("sets setter property", () => {
    const spec: FlowElement = {
      type: "flow",
      styleMod: {
        padding: [3, 3],
      },
    }
    expect(testRender(spec).element.style.left_padding).toEqual(3)
  })

  test("listens to source property", () => {
    const value = property(1)
    const spec: FlowElement = {
      type: "flow",
      styleMod: {
        padding: value,
      },
    }
    const element = testRender(spec).element
    expect(element.style.left_padding).toEqual(1)
    value.set(2)
    expect(element.style.left_padding).toEqual(2)
  })
})

describe("destroy", () => {
  test("calling destroy sets invalid to false", () => {
    const spec: FlowElement = {
      type: "flow",
      direction: "vertical",
    }
    const element = testRender(spec).element
    destroy(element)
    expect(element.valid).toBe(false)
  })

  test("calling destroy ends subscriptions", () => {
    const source = property("hi")
    const spec: FlowElement = {
      type: "flow",
      caption: source,
    }
    const element = testRender(spec).element
    expect(_numObservers(source)).toEqual(1)
    destroy(element)
    expect(_numObservers(source)).toEqual(0)
  })

  test("calling destroy ends child subscriptions", () => {
    const source = property("hi")
    const spec: FlowElement = {
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
    const element = testRender(spec).element

    expect(_numObservers(source)).toEqual(1)
    destroy(element)
    expect(_numObservers(source)).toEqual(0)
  })
})

test("events", () => {
  const func = mock.fn<GuiEventHandler["invoke"]>()
  const spec: TextFieldElement = {
    type: "textfield",
    on_gui_click: { invoke: func },
    on_gui_opened: { invoke: func },
    on_gui_text_changed: { invoke: func },
  }
  const element = testRender(spec).element

  expect(func).not.toHaveBeenCalled()

  const fakeClickEvent: OnGuiClickEvent = {
    element: element as LuaGuiElement,
    name: defines.events.on_gui_click,
    player_index: element.player_index,
    tick: game.tick,
    alt: false,
    button: defines.mouse_button_type.left,
    control: false,
    shift: false,
    cursor_display_location: nil!,
  }
  script.get_event_handler(defines.events.on_gui_click)(fakeClickEvent)
  expect(func).toHaveBeenCalledWith(fakeClickEvent)

  const fakeOpenEvent: OnGuiOpenedEvent = {
    element: element as LuaGuiElement,
    name: defines.events.on_gui_opened,
    player_index: element.player_index,
    tick: game.tick,
    gui_type: defines.gui_type.custom,
  }
  script.get_event_handler(defines.events.on_gui_opened)(fakeOpenEvent)
  expect(func).toHaveBeenCalledWith(fakeOpenEvent)

  const fakeTextChangeEvent: OnGuiTextChangedEvent = {
    element: element as LuaGuiElement,
    name: defines.events.on_gui_text_changed,
    player_index: element.player_index,
    tick: game.tick,
    text: "hi",
  }
  script.get_event_handler(defines.events.on_gui_text_changed)(fakeTextChangeEvent)
  expect(func).toHaveBeenCalledWith(fakeTextChangeEvent)
})

test("observable value", () => {
  const val = property("one")
  const spec: TextBoxElement = {
    type: "text-box",
    text: val,
  }
  const element = testRender(spec).element

  expect(val.get()).toEqual("one")
  expect(element.text).toEqual("one")

  element.text = "two"
  const fakeEvent: OnGuiTextChangedEvent = {
    element: element as LuaGuiElement,
    name: defines.events.on_gui_text_changed,
    player_index: element.player_index,
    tick: game.tick,
    text: "two",
  }
  script.get_event_handler(defines.events.on_gui_text_changed)(fakeEvent)

  expect(val.get()).toEqual("two")

  val.set("three")
  expect(element.text).toEqual("three")
})

test("onCreate", () => {
  let element1: unknown
  const spec: FlowElement = {
    type: "flow",
    onCreate(e) {
      element1 = e
    },
  }

  expect(testRender(spec).element).toBe(element1)
})

test("context onMount", () => {
  const fn = mock.fn<(this: unknown) => void>()
  const spec: FunctionalComponent<any> = {
    type(_, context) {
      context.onMount(fn)
      return { type: "flow" }
    },
    props: {},
  }
  const element = testRender(spec).element
  expect(fn).toHaveBeenCalledTimes(1)
  expect(fn).toHaveBeenCalledWith(element)
})

test("context onDestroy", () => {
  const fn = mock.fn()
  const spec: FunctionalComponent<any> = {
    type(_, context) {
      context.getSubscription().add({ invoke: fn })

      return { type: "flow" }
    },
    props: {},
  }

  const element = testRender(spec).element
  expect(fn).not.toHaveBeenCalled()
  destroy(element)
  expect(fn).toHaveBeenCalled()
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

    render(props: Props, context: RenderContext): Element {
      context.onMount((element) => {
        expect(element.type).toBe("flow")
        results.push("onMount")
      })
      context.getSubscription().add({ invoke: () => results.push("destroyed") })
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

    render(props: Props, context: RenderContext): Element {
      context.onMount((element) => {
        expect(element.type).toBe("flow")
        results.push("onMount2")
      })
      context.getSubscription().add({ invoke: () => results.push("destroyed2") })
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
    const spec: ClassComponent<any> = {
      type: Foo,
      props: { cb },
    }
    const element = testRender(spec).element

    expect(element.type).toBe("flow")
    expect(results).toEqual(["constructed", "render", "cb flow", "onMount"])
    results.length = 0
    destroy(element)
    expect(results).toEqual(["destroyed"])
  })

  test("create2", () => {
    const spec: ClassComponent<any> = {
      type: Foo2,
      props: { cb },
    }
    const element = testRender(spec).element

    expect(element.type).toBe("flow")
    expect(results).toEqual(["constructed2", "render2", "constructed", "render", "cb flow", "onMount", "onMount2"])
    results.length = 0
    destroy(element)
    expect(results).toEqual(["destroyed2", "destroyed"])
  })

  test("unregistered components give error", () => {
    class C extends Component {
      render(): Element {
        return { type: "flow" }
      }
    }
    const spec: ClassComponent<any> = {
      type: C,
      props: {},
    }
    expect(() => testRender(spec)).toError()
  })

  describe("getComponentInstance", () => {
    test("returns component instance", () => {
      const spec: ClassComponent<any> = {
        type: Foo,
        props: {},
      }
      const instance = getComponentInstance(testRender(spec).element)
      expect(instance).toBeA(Foo)
    })
    test("returns outer component if nested", () => {
      const spec: ClassComponent<any> = {
        type: Foo2,
        props: {},
      }
      const instance = getComponentInstance(testRender(spec).element)
      expect(instance).toBeA(Foo2)
    })
  })
})

describe("function component", () => {
  const results: unknown[] = []
  before_each(() => {
    results.length = 0
  })

  function Component(props: { cb: (element: BaseGuiElement) => void }, context: RenderContext): FlowElement {
    results.push("render")
    context.onMount(() => results.push("mountA"))
    context.onMount(() => results.push("mountB"))
    context.getSubscription().add({ invoke: () => results.push("destroyed") })
    return {
      type: "flow",
      onCreate: props.cb,
    }
  }

  function Component2(props: { cb: (element: BaseGuiElement) => void }, context: RenderContext): Element {
    results.push("render2")
    context.onMount(() => results.push("mount2A"))
    context.onMount(() => results.push("mount2B"))
    context.getSubscription().add({ invoke: () => results.push("destroyed2") })
    return {
      type: Component,
      props: { cb: props.cb },
    }
  }

  const cb = function (this: unknown, element: BaseGuiElement) {
    results.push(element.type)
  }

  test("render 1", () => {
    const spec: FunctionalComponent<any> = {
      type: Component,
      props: { cb },
    }
    const element = testRender(spec).element

    expect(element.type).toBe("flow")
    expect(results).toEqual(["render", "flow", "mountA", "mountB"])
    results.length = 0
    destroy(element)
    expect(results).toEqual(["destroyed"])
  })

  test("render 2", () => {
    const spec: FunctionalComponent<any> = {
      type: Component2,
      props: { cb },
    }
    const element = testRender(spec).element

    expect(element.type).toBe("flow")
    expect(results).toEqual(["render2", "render", "flow", "mount2A", "mount2B", "mountA", "mountB"])
    results.length = 0
    destroy(element)
    expect(results).toEqual(["destroyed2", "destroyed"])
  })
})

describe("Fragments", () => {
  test("rendering fragment with multiple children at root is error", () => {
    const spec: Element = {
      type: "fragment",
      children: [{ type: "flow" }, { type: "flow" }],
    }
    expect(() => testRender(spec as any)).toError()
  })

  test("Fragment with multiple children inside another element is ok", () => {
    const spec: Element = {
      type: "flow",
      children: [{ type: "fragment", children: [{ type: "flow" }, { type: "flow" }] }],
    }
    const element = testRender(spec).element
    expect(element.type).toBe("flow")
    expect(element.children.length).toBe(2)
    expect(element.children[0].type).toBe("flow")
    expect(element.children[1].type).toBe("flow")
  })

  test("fragment with multiple children as result of functional component", () => {
    function Comp(): Element {
      return {
        type: "fragment",
        children: [{ type: "flow" }, { type: "flow" }],
      }
    }
    expect(() => testRender({ type: Comp, props: {} })).toError()

    const spec2: Element = {
      type: "flow",
      children: [{ type: Comp, props: {} }],
    }
    const element = testRender(spec2).element
    expect(element.type).toBe("flow")
    expect(element.children.length).toBe(2)
    expect(element.children[0].type).toBe("flow")
    expect(element.children[1].type).toBe("flow")
  })
})

test("tabbed-pane", () => {
  const spec: TabbedPaneElement = {
    type: "tabbed-pane",
    children: [
      { type: "tab", caption: "one" },
      { type: "label", caption: "one content" },
      { type: "tab", caption: "two" },
      { type: "label", caption: "two content" },
    ],
    selected_tab_index: 2,
  }
  const element = testRender(spec).element
  expect(element.tabs.length).toBe(2)
  expect(element.tabs[0].tab.caption).toBe("one")
  expect(element.tabs[0].content.caption).toBe("one content")
  expect(element.tabs[1].tab.caption).toBe("two")
  expect(element.tabs[1].content.caption).toBe("two content")
  expect(element.selected_tab_index).toBe(2)
})
