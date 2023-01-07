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

import { isEmpty } from "../_util"
import { Events } from "../Events"
import { isMutableProperty, MutableProperty, Property, SimpleObserver, Subscription } from "../event"
import { onPlayerInit } from "../player-init"
import { protectedAction } from "../protected-action"
import { assertIsRegisteredClass, bind, Func, funcRef, registerFunctions, SelflessFun } from "../references"
import { PRecord } from "../util-types"
import * as propInfo from "./propInfo.json"
import {
  ClassComponent,
  Element,
  FactorioElement,
  FragmentElement,
  FunctionalComponent,
  GuiEvent,
  GuiEventHandler,
  RenderContext,
} from "./element"
import { Migrations } from "../migration"

type GuiEventName = Extract<keyof typeof defines.events, `on_gui_${string}`>

interface ElementInstance {
  readonly element: BaseGuiElement
  readonly subscription: Subscription | nil
  readonly events: PRecord<GuiEventName, Func<any>>
}

function setStateFunc(state: MutableProperty<unknown>, key: string, event: GuiEvent) {
  state.set((event as any)[key] || event.element![key])
}
function setValueObserver(elem: LuaGuiElement | LuaStyle, key: string, value: any) {
  if (!elem.valid) return
  if (elem.object_name == "LuaGuiElement") {
    const info = propInfo[key as keyof typeof propInfo]
    if (info && info[2] && (elem as any)[key] == value) return
  }
  ;(elem as any)[key] = value
}

function callSetterObserver(elem: LuaGuiElement, key: string, value: any) {
  if (!elem.valid) return
  if (key == "slider_minimum") {
    ;(elem as SliderGuiElement).set_slider_minimum_maximum(value, (elem as SliderGuiElement).get_slider_maximum())
  } else if (key == "slider_maximum") {
    ;(elem as SliderGuiElement).set_slider_minimum_maximum((elem as SliderGuiElement).get_slider_minimum(), value)
  } else {
    ;(elem as any as Record<any, SelflessFun>)[key](value)
  }
}

registerFunctions("factoriojsx render", { setValueObserver, callSetterObserver, setStateFunc })

interface InternalRenderContext extends RenderContext {
  parent: InternalRenderContext | nil
  firstIndex: number | nil

  subscriptionContext?: Subscription
  onMountCallbacks: ((this: unknown, element: LuaGuiElement) => void)[]
}

function _newTracker(
  parent: InternalRenderContext | nil,
  playerIndex: PlayerIndex,
  firstIndex?: number,
): InternalRenderContext {
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
function newRootTracker(playerIndex: PlayerIndex, firstIndex: number | nil): InternalRenderContext {
  return _newTracker(nil, playerIndex, firstIndex)
}
function newTracker(parent: InternalRenderContext, firstIndex: number | nil): InternalRenderContext {
  return _newTracker(parent, parent.playerIndex, firstIndex)
}

function callOnMount(context: InternalRenderContext, element: LuaGuiElement): void {
  for (const callback of context.onMountCallbacks) callback(element)
  if (context.parent) return callOnMount(context.parent, element)
}

function isLuaGuiElement(element: unknown): element is LuaGuiElement {
  return typeof element == "object" && (element as LuaGuiElement).object_name == "LuaGuiElement"
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

const type = _G.type

function renderInternal(
  parent: BaseGuiElement,
  element: Element,
  context: InternalRenderContext,
): LuaGuiElement | LuaGuiElement[] | nil {
  const elemType = element.type
  const elemTypeType = type(elemType)
  if (elemTypeType == "string") {
    return renderElement(parent, element as FactorioElement | FragmentElement, context)
  }
  if (elemTypeType == "table") {
    return renderClassComponent(parent, element as ClassComponent<any>, context)
  }
  if (elemTypeType == "function") {
    return renderFunctionComponent(parent, element as FunctionalComponent<any>, context)
  }
  error("Unknown spec type: " + serpent.block(element))
}

function renderFragment(
  parent: BaseGuiElement,
  element: FragmentElement,
  context: InternalRenderContext,
): LuaGuiElement[] | nil {
  const children = element.children || []
  let usedTracker: InternalRenderContext = context
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
  if (elements.length == 0) {
    context.subscriptionContext?.close()
    return
  }
  return elements
}

function renderElement(
  parent: BaseGuiElement,
  element: FactorioElement | FragmentElement,
  context: InternalRenderContext,
): LuaGuiElement | LuaGuiElement[] | nil {
  if (element.type == "fragment") {
    return renderFragment(parent, element, context)
  }

  const guiSpec: Record<string, any> = {}
  const elemProps = new LuaMap<string | [string], unknown>()
  const events: ElementInstance["events"] = {}

  // eslint-disable-next-line prefer-const
  for (let [key, value] of pairs(element)) {
    const propProperties = propInfo[key]
    if (!propProperties) continue
    if (typeof value == "function") value = funcRef(value as any)
    if (propProperties == "event") {
      assert((value as Func).invoke, "Gui event handler must be a function")
      events[key as GuiEventName] = value as GuiEventHandler
      continue
    }
    const isSpecProp = propProperties[0]
    const isElemProp: string | boolean | null = propProperties[1]
    const stateEvent = propProperties[2] as GuiEventName | null

    const isState = value instanceof Property
    const shouldSetElemProp = !isSpecProp || isState
    if (shouldSetElemProp) {
      if (!isElemProp) {
        // value is state
        error(`${key} cannot be a state value`)
      }
      if (typeof isElemProp == "string") elemProps.set([isElemProp], value)
      else elemProps.set(key, value)
      if (stateEvent && value instanceof Property) {
        if (isMutableProperty<any>(value)) {
          if (events[stateEvent]) {
            error(`Cannot specify both state and gui event for ${stateEvent}`)
          }
          events[stateEvent] = bind(setStateFunc, value, key)
        }
        if (isSpecProp) {
          guiSpec[key] = value.get()
        }
      }
    } else if (isSpecProp) {
      guiSpec[key] = value
    }
  }
  if (context.firstIndex) {
    guiSpec.index = context.firstIndex
  }

  const factorioElement = parent.add(guiSpec as GuiSpec)

  for (const [key, value] of elemProps) {
    if (value instanceof Property) {
      let observer: SimpleObserver<unknown>
      let name: string
      if (typeof key != "object") {
        observer = bind(setValueObserver, factorioElement, key)
        name = key
      } else {
        name = key[0]
        observer = bind(callSetterObserver, factorioElement, name)
      }
      value.subscribeAndRaise(context.getSubscription(), observer)
    } else if (typeof key != "object") {
      // simple value
      ;(factorioElement as any)[key] = value
    } else {
      // setter value
      ;((factorioElement as any)[key[0]] as (this: void, value: unknown) => void)(value)
    }
  }

  const styleMod = element.styleMod
  if (styleMod) {
    const style = factorioElement.style
    for (const [key, value] of pairs(styleMod)) {
      if (value instanceof Property) {
        value.subscribeAndRaise(context.getSubscription(), bind(setValueObserver, style, key))
      } else {
        ;(style as any)[key] = value
      }
    }
  }

  const children = element.children
  if (children) {
    for (const child of children) {
      renderInternal(factorioElement, child, newRootTracker(context.playerIndex, nil))
    }
  }

  // setup tabbed pane
  if (element.type == "tabbed-pane") {
    // alternate indexes tab-content
    const children = factorioElement.children
    for (const i of $range(1, children.length, 2)) {
      const tab = children[i - 1]
      const content = children[i]
      if (tab.type != "tab") {
        error(
          `Tabbed pane must have alternating tab-content children, got types: ${children
            .map((c) => c.type)
            .join(", ")}`,
        )
      }
      ;(factorioElement as TabbedPaneGuiElement).add_tab(tab, content)
    }
  }

  element.onCreate?.(factorioElement as any)
  callOnMount(context, factorioElement)

  const subscription = context.subscriptionContext
  if ((subscription && subscription.hasActions()) || !isEmpty(events)) {
    global.players[factorioElement.player_index].guiElements[factorioElement.index] = {
      element: factorioElement,
      events,
      subscription,
    }
  }
  return factorioElement
}

function renderFunctionComponent<T>(
  parent: BaseGuiElement,
  spec: FunctionalComponent<T>,
  context: InternalRenderContext,
) {
  return renderInternal(parent, spec.type(spec.props, context), context)
}

function renderClassComponent<T>(parent: BaseGuiElement, spec: ClassComponent<T>, context: InternalRenderContext) {
  const childTracker = newTracker(context, context.firstIndex)

  const Component = spec.type
  assertIsRegisteredClass(Component)
  const instance = new Component()

  const resultSpec = instance.render(spec.props, childTracker)
  return renderInternal(parent, resultSpec, childTracker)
}

export function render<T extends GuiElementType>(
  spec: FactorioElement & { type: T },
  parent: BaseGuiElement,
  index?: number,
): Extract<LuaGuiElement, { type: T }>
export function render(element: Element, parent: BaseGuiElement, index?: number): LuaGuiElement | nil
export function render(element: Element, parent: BaseGuiElement, index?: number): LuaGuiElement | nil {
  const result = renderInternal(parent, element, newRootTracker(parent.player_index, index))
  if (!result || isLuaGuiElement(result)) return result
  if (result.length > 1) {
    error("cannot render multiple elements at root. Try wrapping them in another element.")
  }
  return result[0]
}

export function renderMultiple(elements: Element, parent: BaseGuiElement): LuaGuiElement[] | nil {
  const result = renderInternal(parent, elements, newRootTracker(parent.player_index, nil))
  return !result || isLuaGuiElement(result) ? [result as LuaGuiElement] : result
}

/**
 * Replaces if another element with the same name already exists.
 */
export function renderNamed(element: Element, parent: LuaGuiElement, name: string): LuaGuiElement | nil {
  destroy(parent[name])
  const result = render(element, parent)
  if (result) result.name = name
  return result
}

export function renderOpened(player: LuaPlayer, spec: Element): LuaGuiElement | nil {
  const element = render(spec, player.gui.screen)
  if (element) {
    player.opened = element
  }
  return element
}

function getInstance(element: BaseGuiElement): ElementInstance | nil {
  if (!element.valid) return nil
  return global.players[element.player_index].guiElements[element.index]
}

export function destroy(element: BaseGuiElement | nil, destroyElement = true): void {
  if (!element || !element.valid) return
  // is lua gui element
  const { player_index, index } = element
  const guiElements = global.players[player_index].guiElements
  const instance = guiElements[index]
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
  if (element.valid) {
    for (const child of element.children) {
      destroy(child, false)
    }
  }
  subscription?.tryClose()
  if (destroyElement && element.valid) element.destroy()
  guiElements[index] = nil!
}

export function destroyChildren(element: BaseGuiElement): void {
  if (!element.valid) return
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
      protectedAction(event.invoke, event, e)
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

if (script.active_mods.debugadapter != nil) {
  commands.add_command("clean-gui-instances", "", () => {
    const count = cleanGuiInstances()
    if (count > 0) {
      game.print(`found ${count} invalid gui elements`)
    } else {
      game.print("No improperly destroyed GUI elements found")
    }
  })
}

Migrations.fromAny(cleanGuiInstances)
