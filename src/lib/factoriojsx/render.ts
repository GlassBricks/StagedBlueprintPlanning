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

import { Events } from "../Events"
import { MutableState, Observer, State, Subscription } from "../observable"
import { onPlayerInit } from "../player-init"
import { protectedAction } from "../protected-action"
import { assertIsRegisteredClass, bind, Func, funcRef, registerFunctions, SelflessFun } from "../references"
import { isEmpty } from "../util"
import { PRecord } from "../util-types"
import * as propInfo from "./propInfo.json"
import { ClassComponentSpec, ElementSpec, FCSpec, FragmentSpec, GuiEvent, GuiEventHandler, Spec, Tracker } from "./spec"

type GuiEventName = Extract<keyof typeof defines.events, `on_gui_${string}`>

interface ElementInstance {
  readonly element: BaseGuiElement
  readonly subscription: Subscription | nil
  readonly events: PRecord<GuiEventName, Func<any>>
}

function setValueObserver(elem: LuaGuiElement | LuaStyle, key: string, subscription: Subscription, value: any) {
  if (!elem.valid) {
    if (elem.object_name === "LuaGuiElement") destroy(elem)
    return subscription.close()
  }
  ;(elem as any)[key] = value
}

function callSetterObserver(elem: LuaGuiElement, key: string, subscription: Subscription, value: any) {
  if (!elem.valid) {
    destroy(elem)
    return subscription.close()
  }
  if (key === "slider_minimum") {
    ;(elem as SliderGuiElement).set_slider_minimum_maximum(value, (elem as SliderGuiElement).get_slider_maximum())
  } else if (key === "slider_maximum") {
    ;(elem as SliderGuiElement).set_slider_minimum_maximum((elem as SliderGuiElement).get_slider_minimum(), value)
  } else {
    ;(elem as any as Record<any, SelflessFun>)[key](value)
  }
}

function setStateFunc(state: MutableState<unknown>, key: string, event: GuiEvent) {
  state.set((event as any)[key] || event.element![key])
}

registerFunctions("factoriojsx render", { setValueObserver, callSetterObserver, setStateFunc })

interface TrackerInternal extends Tracker {
  parent: TrackerInternal | nil
  firstIndex: number | nil

  subscriptionContext?: Subscription
  onMountCallbacks: ((this: unknown, element: LuaGuiElement) => void)[]
}

function _newTracker(parent: TrackerInternal | nil, playerIndex: PlayerIndex, firstIndex?: number): TrackerInternal {
  return {
    playerIndex,
    firstIndex,
    parent,
    onMountCallbacks: [],
    subscriptionContext: parent && parent.subscriptionContext,
    onMount(callback: (this: unknown, firstElement: LuaGuiElement) => void) {
      this.onMountCallbacks.push(callback)
    },
    getSubscription(): Subscription {
      const { subscriptionContext } = this
      if (subscriptionContext) return subscriptionContext
      return (this.subscriptionContext = parent?.getSubscription() ?? new Subscription())
    },
  }
}
function newRootTracker(playerIndex: PlayerIndex, firstIndex: number | nil): TrackerInternal {
  return _newTracker(nil, playerIndex, firstIndex)
}
function newTracker(parent: TrackerInternal, firstIndex: number | nil): TrackerInternal {
  return _newTracker(parent, parent.playerIndex, firstIndex)
}

function callOnMount(tracker: TrackerInternal, element: LuaGuiElement): void {
  for (const callback of tracker.onMountCallbacks) callback(element)
  if (tracker.parent) return callOnMount(tracker.parent, element)
}

function isLuaGuiElement(element: unknown): element is LuaGuiElement {
  return typeof element === "object" && (element as LuaGuiElement).object_name === "LuaGuiElement"
}

declare global {
  interface PlayerData {
    guiElements: PRecord<GuiElementIndex, ElementInstance>
  }
}
declare const global: GlobalWithPlayers
onPlayerInit((index) => {
  global.players[index].guiElements = {}
})
let players: typeof global.players
Events.onInitOrLoad(() => {
  players = global.players
})

const type = _G.type

function renderInternal(
  parent: BaseGuiElement,
  element: Spec,
  tracker: TrackerInternal,
): LuaGuiElement | LuaGuiElement[] | nil {
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

function renderFragment(parent: BaseGuiElement, spec: FragmentSpec, tracker: TrackerInternal): LuaGuiElement[] | nil {
  const children = spec.children || []
  let usedTracker: TrackerInternal = tracker
  const elements: LuaGuiElement[] = []
  for (const child of children) {
    const childResult = renderInternal(parent, child, usedTracker)
    if (!childResult || isEmpty(childResult)) continue
    usedTracker = newRootTracker(usedTracker.playerIndex, nil)
    if (isLuaGuiElement(childResult)) {
      elements.push(childResult)
    } else {
      elements.push(...childResult)
    }
  }
  if (elements.length === 0) {
    tracker.subscriptionContext?.close()
    return
  }
  return elements
}

function renderElement(
  parent: BaseGuiElement,
  spec: ElementSpec | FragmentSpec,
  tracker: TrackerInternal,
): LuaGuiElement | LuaGuiElement[] | nil {
  if (spec.type === "fragment") {
    return renderFragment(parent, spec, tracker)
  }

  const guiSpec: Record<string, any> = {}
  const elemProps = new LuaTable<string | [string], unknown>()
  const events: ElementInstance["events"] = {}

  // eslint-disable-next-line prefer-const
  for (let [key, value] of pairs(spec)) {
    const propProperties = propInfo[key]
    if (!propProperties) continue
    if (typeof value === "function") value = funcRef(value as any)
    if (propProperties === "event") {
      assert((value as Func).invoke, "Gui event handler must be a function")
      events[key as GuiEventName] = value as GuiEventHandler
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

  for (const [key, value] of pairs(elemProps)) {
    if (value instanceof State) {
      let observer: Observer<unknown>
      let name: string
      if (typeof key !== "object") {
        observer = bind(setValueObserver, element, key)
        name = key
      } else {
        name = key[0]
        observer = bind(callSetterObserver, element, name)
      }
      value.subscribeAndFire(tracker.getSubscription(), observer)
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
        value.subscribeAndFire(tracker.getSubscription(), bind(setValueObserver, style, key))
      } else {
        ;(style as any)[key] = value
      }
    }
  }

  const children = spec.children
  if (children) {
    for (const child of children as Spec[]) {
      renderInternal(element, child, newRootTracker(tracker.playerIndex, nil))
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
  callOnMount(tracker, element)

  const subscription = tracker.subscriptionContext
  if ((subscription && subscription.hasActions()) || !isEmpty(events)) {
    players[element.player_index].guiElements[element.index] = {
      element,
      events,
      subscription,
    }
  }
  return element
}

function renderFunctionComponent<T>(parent: BaseGuiElement, spec: FCSpec<T>, tracker: TrackerInternal) {
  return renderInternal(parent, spec.type(spec.props, tracker), tracker)
}

function renderClassComponent<T>(parent: BaseGuiElement, spec: ClassComponentSpec<T>, tracker: TrackerInternal) {
  const childTracker = newTracker(tracker, tracker.firstIndex)

  const Component = spec.type
  assertIsRegisteredClass(Component)
  const instance = new Component()

  const resultSpec = instance.render(spec.props, childTracker)
  return renderInternal(parent, resultSpec, childTracker)
}

export function render<T extends GuiElementType>(
  spec: ElementSpec & { type: T },
  parent: BaseGuiElement,
  index?: number,
): Extract<LuaGuiElement, { type: T }>
export function render(element: Spec, parent: BaseGuiElement, index?: number): LuaGuiElement | nil
export function render(element: Spec, parent: BaseGuiElement, index?: number): LuaGuiElement | nil {
  const result = renderInternal(parent, element, newRootTracker(parent.player_index, index))
  if (!result || isLuaGuiElement(result)) return result
  if (result.length > 1) {
    error("cannot render multiple elements at root. Try wrapping them in another element.")
  }
  return result[0]
}

export function renderMultiple(elements: Spec, parent: BaseGuiElement): LuaGuiElement[] | nil {
  const result = renderInternal(parent, elements, newRootTracker(parent.player_index, nil))
  return !result || isLuaGuiElement(result) ? [result as LuaGuiElement] : result
}

/**
 * Replaces if another element with the same name already exists.
 */
export function renderNamed(element: Spec, parent: LuaGuiElement, name: string): LuaGuiElement | nil {
  destroy(parent[name])
  const result = render(element, parent)
  if (result) result.name = name
  return result
}

export function renderOpened(player: LuaPlayer, spec: Spec): LuaGuiElement | nil {
  const element = render(spec, player.gui.screen)
  if (element) {
    player.opened = element
  }
  return element
}

function getInstance(element: BaseGuiElement): ElementInstance | nil {
  return !element.valid ? nil : players[element.player_index].guiElements[element.index]
}

export function destroy(element: BaseGuiElement | nil, destroyElement = true): void {
  if (!element || !element.valid) return
  // is lua gui element
  const instance = players[element.player_index].guiElements[element.index]
  if (!instance) {
    for (const child of element.children) {
      destroy(child, false)
    }
    if (destroyElement) {
      element.destroy()
    }
    return
  }

  const { subscription } = instance
  const { player_index, index } = element
  if (element.valid) {
    for (const child of element.children) {
      destroy(child, false)
    }
  }
  subscription?.close()
  if (destroyElement && element.valid) element.destroy()
  players[player_index].guiElements[index] = nil!
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
      protectedAction(e.player_index, event.invoke, event, e)
    }
  })
}

export function cleanGuiInstances(): number {
  let count = 0
  for (const [, data] of pairs(global.players)) {
    for (const [, instance] of pairs(data.guiElements)) {
      const element = instance.element
      if (!element.valid) {
        destroy(element)
        count++
      }
    }
  }
  return count
}

if (script.active_mods.debugadapter !== nil) {
  commands.add_command("clean-gui-instances", "", () => {
    const count = cleanGuiInstances()
    if (count > 0) {
      game.print(`found ${count} invalid gui elements`)
    } else {
      game.print("No improperly destroyed GUI elements found")
    }
  })
}
