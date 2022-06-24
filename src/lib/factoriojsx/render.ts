import { Events } from "../Events"
import { MutableState, SingleObserver, State, Unsubscribe } from "../observable"
import { onPlayerInit, onPlayerRemoved } from "../player-init"
import { protectedAction } from "../protected-action"
import { bind, Callback, Classes, Func, funcRef, isCallable, registerFunctions, SelflessFun } from "../references"
import { isEmpty, shallowCopy } from "../util"
import { PRecord } from "../util-types"
import * as propTypes from "./propTypes.json"
import {
  ClassComponentSpec,
  Component,
  ElementSpec,
  FCSpec,
  FragmentSpec,
  GuiEvent,
  GuiEventHandler,
  Spec,
  Tracker,
} from "./spec"

type GuiEventName = Extract<keyof typeof defines.events, `on_gui_${string}`>

interface ElementInstance {
  readonly element: GuiElementMembers
  readonly playerIndex: PlayerIndex
  readonly index: GuiElementIndex
  readonly subscriptions: MutableLuaMap<string, Callback>

  readonly events: PRecord<GuiEventName, Func<any>>
}

interface TrackerInternal extends Tracker {
  firstIndex: number | undefined
  subscriptions: Callback[] & MutableLuaMap<string, Callback>
  onMountCallbacks: ((this: unknown, element: LuaGuiElement) => void)[][]
  groupedElements?: LuaGuiElement[]
  shiftOnMountCallbacks(): void
}

function setValueObserver(this: LuaGuiElement | LuaStyle, element: LuaGuiElement, key: string, value: any) {
  if (!this.valid) {
    destroy(element)
    return Unsubscribe
  }
  ;(this as any)[key] = value
}

function callSetterObserver(this: LuaGuiElement, key: string, value: any) {
  if (!this.valid) {
    destroy(this)
    return Unsubscribe
  }
  if (key === "slider_minimum") {
    ;(this as SliderGuiElement).set_slider_minimum_maximum(value, (this as SliderGuiElement).get_slider_maximum())
  } else if (key === "slider_maximum") {
    ;(this as SliderGuiElement).set_slider_minimum_maximum((this as SliderGuiElement).get_slider_minimum(), value)
  } else {
    ;(this as any as Record<any, SelflessFun>)[key](value)
  }
}

function setStateFunc(this: MutableState<unknown>, key: string, event: GuiEvent) {
  this.set((event as any)[key] || event.element![key])
}

function callComponentOnDestroy(this: Component<any>) {
  this.onDestroy?.()
}

registerFunctions("factoriojsx render", { setValueObserver, callSetterObserver, setStateFunc, callComponentOnDestroy })

function newTracker(index?: number): TrackerInternal {
  const subscriptions = {} as TrackerInternal["subscriptions"]
  const onMountCallbacks: TrackerInternal["onMountCallbacks"] = [[]]
  return {
    firstIndex: index,
    subscriptions,
    onMountCallbacks,
    onMount(callback: (this: unknown, firstElement: LuaGuiElement) => void) {
      onMountCallbacks[onMountCallbacks.length - 1].push(callback)
    },
    shiftOnMountCallbacks() {
      onMountCallbacks.push([])
    },
    onDestroy(callback: Callback) {
      subscriptions.push(callback)
    },
  }
}

function isLuaGuiElement(element: unknown): element is LuaGuiElement {
  return typeof element === "object" && (element as LuaGuiElement).object_name === "LuaGuiElement"
}

declare const global: {
  guiElements: PRecord<PlayerIndex, PRecord<GuiElementIndex, ElementInstance>>
}
Events.on_init(() => {
  global.guiElements = {}
})
onPlayerInit((player) => {
  global.guiElements[player.index] = {}
})
onPlayerRemoved((playerIndex) => {
  delete global.guiElements[playerIndex]
})

const type = _G.type

function renderInternal(
  parent: BaseGuiElement,
  element: Spec,
  tracker: TrackerInternal,
): LuaGuiElement | LuaGuiElement[] | undefined {
  const elemType = element.type
  const elemTypeType = type(elemType)
  if (elemTypeType === "string") {
    return renderElement(parent, element as ElementSpec | FragmentSpec, tracker)
  }
  if (elemTypeType === "table") {
    return renderClassComponent(parent, element as ClassComponentSpec<any>, tracker)
  }
  if (elemTypeType === "function") {
    return renderFunctionComponent(parent, element as FCSpec<any>, tracker)
  }
  error("Unknown spec type: " + serpent.block(element))
}

function renderFragment(
  parent: BaseGuiElement,
  spec: FragmentSpec,
  tracker: TrackerInternal,
): LuaGuiElement[] | undefined {
  const children = spec.children || []
  let usedTracker: TrackerInternal = tracker
  const elements: LuaGuiElement[] = []
  for (const child of children) {
    const childResult = renderInternal(parent, child, usedTracker)
    if (!childResult || isEmpty(childResult)) continue
    usedTracker = newTracker()
    if (isLuaGuiElement(childResult)) {
      elements.push(childResult)
    } else {
      elements.push(...childResult)
    }
  }
  if (elements.length === 0) {
    for (const [, cb] of pairs(shallowCopy(tracker.subscriptions as unknown as Record<any, Callback>))) {
      cb()
    }
    return
  }
  return elements
}

function renderElement(
  parent: BaseGuiElement,
  spec: ElementSpec | FragmentSpec,
  tracker: TrackerInternal,
): LuaGuiElement | LuaGuiElement[] | undefined {
  if (spec.type === "fragment") {
    return renderFragment(parent, spec, tracker)
  }

  const guiSpec: Record<string, any> = {}
  const elemProps = new LuaTable<string | [string], unknown>()
  const events: ElementInstance["events"] = {}

  // eslint-disable-next-line prefer-const
  for (let [key, value] of pairs(spec)) {
    const propProperties = propTypes[key]
    if (!propProperties) continue
    if (typeof value === "function") value = funcRef(value as any)
    if (propProperties === "event") {
      if (!isCallable(value)) error("Gui event handlers must be a function")
      events[key as GuiEventName] = value as unknown as GuiEventHandler
      continue
    }
    const isSpecProp = propProperties[0]
    const isElemProp: string | boolean | null = propProperties[1]
    const stateEvent = propProperties[2] as GuiEventName | null

    const isState = value instanceof State
    const shouldSetElemProp = !isSpecProp || isState
    if (shouldSetElemProp) {
      if (!isElemProp) {
        // value is state
        error(`${key} cannot be a state value`)
      }
      if (typeof isElemProp === "string") elemProps.set([isElemProp], value)
      else elemProps.set(key, value)
      if (stateEvent) {
        events[stateEvent] = bind(setStateFunc, value as MutableState<any>, key)
        if (isSpecProp) {
          guiSpec[key] = (value as State<any>).get()
        }
      }
    } else if (isSpecProp) {
      guiSpec[key] = value
    }
  }
  if (tracker.firstIndex) {
    guiSpec.index = tracker.firstIndex
  }

  const element = parent.add(guiSpec as GuiSpec)
  const subscriptions = tracker.subscriptions

  for (const [key, value] of pairs(elemProps)) {
    if (value instanceof State) {
      let observer: SingleObserver<unknown>
      let name: string
      if (typeof key !== "object") {
        observer = bind(setValueObserver, element, element, key)
        name = key
      } else {
        name = key[0]
        observer = bind(callSetterObserver, element, name)
      }
      subscriptions.set(name, value.subscribeAndFire(observer))
    } else if (typeof key !== "object") {
      // simple value
      ;(element as any)[key] = value
    } else {
      // setter value
      ;((element as any)[key[0]] as (this: void, value: unknown) => void)(value)
    }
  }

  const styleMod = spec.styleMod
  if (styleMod) {
    const style = element.style
    for (const [key, value] of pairs(styleMod)) {
      if (value instanceof State) {
        subscriptions.set(key, value.subscribeAndFire(bind(setValueObserver, style, element, key)))
      } else {
        ;(style as any)[key] = value
      }
    }
  }

  const children = spec.children
  if (children) {
    for (const child of children as Spec[]) {
      renderInternal(element, child, newTracker())
    }
  }

  // setup tabbed pane
  if (spec.type === "tabbed-pane") {
    // alternate indexes tab-content
    const children = element.children
    for (const i of $range(1, children.length, 2)) {
      const tab = children[i - 1]
      const content = children[i]
      ;(element as TabbedPaneGuiElement).add_tab(tab, content)
    }
  }

  spec.onCreate?.(element as any)
  for (const i of $range(tracker.onMountCallbacks.length, 1, -1)) {
    const callbacks = tracker.onMountCallbacks[i - 1]
    for (const callback of callbacks) callback(element as any)
  }

  if (!isEmpty(subscriptions) || !isEmpty(events)) {
    global.guiElements[element.player_index]![element.index] = {
      element,
      events,
      subscriptions,
      playerIndex: element.player_index,
      index: element.index,
    }
  }

  return element
}

function renderFunctionComponent<T>(parent: BaseGuiElement, spec: FCSpec<T>, tracker: TrackerInternal) {
  return renderInternal(parent, spec.type(spec.props, tracker), tracker)
}

function renderClassComponent<T>(parent: BaseGuiElement, spec: ClassComponentSpec<T>, tracker: TrackerInternal) {
  const Component = spec.type
  Classes.nameOf(Component) // assert registered
  const instance = new Component()

  const resultSpec = instance.render(spec.props, tracker)
  if (instance.onMount) tracker.onMount((element) => instance.onMount!.call(instance, element, tracker))
  if (instance.onDestroy) tracker.onDestroy(bind(callComponentOnDestroy, instance))

  tracker.shiftOnMountCallbacks()
  return renderInternal(parent, resultSpec, tracker)
}

export function render<T extends GuiElementType>(
  parent: BaseGuiElement,
  spec: ElementSpec & { type: T },
  index?: number,
): Extract<LuaGuiElement, { type: T }>
export function render(parent: BaseGuiElement, element: Spec, index?: number): LuaGuiElement | undefined
export function render(parent: BaseGuiElement, element: Spec, index?: number): LuaGuiElement | undefined {
  const result = renderInternal(parent, element, newTracker(index))
  if (!result || isLuaGuiElement(result)) return result
  if (result.length > 1) {
    error("cannot render multiple elements at root. Try wrapping them in another element.")
  }
  return result[0]
}

export function renderMultiple(parent: BaseGuiElement, elements: Spec): LuaGuiElement[] | undefined {
  const result = renderInternal(parent, elements, newTracker())
  return !result || isLuaGuiElement(result) ? [result as LuaGuiElement] : result
}

export function renderOpened(player: LuaPlayer, spec: Spec): LuaGuiElement | undefined {
  const element = render(player.gui.screen, spec)
  if (element) {
    player.opened = element
  }
  return element
}

function getInstance(element: BaseGuiElement): ElementInstance | undefined {
  if (!element.valid) return undefined
  return global.guiElements[element.player_index]![element.index]
}

export function destroy(element: BaseGuiElement | undefined, destroyElement = true): void {
  if (!element) return
  // is lua gui element
  const instance = getInstance(element)
  if (!instance) {
    if (!element.valid) return
    for (const child of element.children) {
      destroy(child, false)
    }
    if (destroyElement) {
      element.destroy()
    }
    return
  }

  const { subscriptions, playerIndex, index } = instance
  if (element.valid) {
    for (const child of element.children) {
      destroy(child, false)
    }
  }
  for (const [, subscription] of shallowCopy(subscriptions)) {
    subscription()
  }
  if (destroyElement && element.valid) {
    element.destroy()
  }
  global.guiElements[playerIndex]![index] = undefined!
}

export function destroyChildren(element: BaseGuiElement): void {
  for (const child of element.children) {
    destroy(child, false)
  }
  element.clear()
}

// -- gui events --
const guiEventNames: Record<GuiEventName, true> = {
  on_gui_click: true,
  on_gui_opened: true,
  on_gui_closed: true,
  on_gui_checked_state_changed: true,
  on_gui_selected_tab_changed: true,
  on_gui_elem_changed: true,
  on_gui_value_changed: true,
  on_gui_selection_state_changed: true,
  on_gui_switch_state_changed: true,
  on_gui_location_changed: true,
  on_gui_confirmed: true,
  on_gui_text_changed: true,
}

for (const [name] of pairs(guiEventNames)) {
  const id = defines.events[name]
  Events.on(id, (e) => {
    const element = e.element
    if (!element) return
    const instance = getInstance(element)
    if (!instance) return
    const event = instance.events[name]
    if (event) {
      protectedAction(e.player_index, event, undefined, e)
    }
  })
}

export function cleanGuiInstances(): number {
  let count = 0
  for (const [, byPlayer] of pairs(global.guiElements)) {
    for (const [, instance] of pairs(byPlayer)) {
      const element = instance.element
      if (!element.valid) {
        destroy(element)
        count++
      }
    }
  }
  return count
}

if (script.active_mods.debugadapter) {
  commands.add_command("clean-gui-instances", "", () => {
    const count = cleanGuiInstances()
    if (count > 0) {
      game.print(`found ${count} invalid gui elements`)
    } else {
      game.print("No improperly destroyed GUI elements found")
    }
  })
}
