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

import { cleanGuiInstances, destroy, Element, FactorioElement, GuiEvent, render } from "../factoriojsx"
import { getPlayer } from "./misc"

const ROOT_TAG = "test-root-element"

export function isRoot(element: BaseGuiElement): boolean {
  return ROOT_TAG in element.tags
}

export function makeTestRoot(element: BaseGuiElement): void {
  element.tags = {
    ...element.tags,
    [ROOT_TAG]: true,
  }
  after_test(() => {
    destroy(element)
    const count = cleanGuiInstances()
    if (count > 0) {
      error(`${count} GUI instances were not cleaned up`)
    }
  })
}

export function makeWrapper(): FlowGuiElement {
  const wrapper = getPlayer().gui.screen.add({ type: "flow" })
  makeTestRoot(wrapper)
  return wrapper
}

export function getDescription(element: LuaGuiElement): string {
  const path = []
  let current: GuiElementMembers | nil = element
  while (current && !isRoot(current)) {
    const name = current.name
    path.push(name == "" ? `[${current.get_index_in_parent()}, ${current.type}]` : name)
    current = current.parent
  }
  path.push("<root>")
  return path.reverse().join(".")
}

export function findElementSatisfying(
  element: LuaGuiElement,
  predicate: (element: LuaGuiElement) => boolean,
): LuaGuiElement | nil {
  if (predicate(element)) return element
  for (const child of element.children) {
    const found = findElementSatisfying(child, predicate)
    if (found) {
      return found
    }
  }
}

export function findAllElementsSatisfying(
  element: LuaGuiElement,
  predicate: (element: LuaGuiElement) => boolean,
  result: LuaGuiElement[] = [],
): LuaGuiElement[] {
  if (predicate(element)) {
    result.push(element)
  }
  for (const child of element.children) {
    findAllElementsSatisfying(child, predicate, result)
  }
  return result
}

export function findWithType<T extends GuiElementType>(
  parent: LuaGuiElement,
  type: T,
  predicate?: (element: Extract<LuaGuiElement, { type: T }>) => boolean,
): Extract<LuaGuiElement, { type: T }> {
  const actualPredicate = predicate ?? (() => true)
  return (
    (findElementSatisfying(parent, (element) => element.type == type && actualPredicate(element as any)) as any) ??
    error(`Could not find element of type "${type}" in ${getDescription(parent)}`)
  )
}

export function findAllWithType<T extends GuiElementType>(
  parent: LuaGuiElement,
  type: T,
  predicate?: (element: Extract<LuaGuiElement, { type: T }>) => boolean,
): Extract<LuaGuiElement, { type: T }>[] {
  const actualPredicate = predicate ?? (() => true)
  return findAllElementsSatisfying(parent, (element) => element.type == type && actualPredicate(element as any)) as any
}

export function simulateEvent<T extends GuiEvent>(
  element: LuaGuiElement,
  event: Omit<T, "element" | "tick" | "player_index">,
): void {
  script.get_event_handler(event.name)?.({
    element,
    player_index: element.player_index,
    tick: game.tick,
    ...event,
  } as T)
}

// fluent API of above
export class ElementWrapper<T extends GuiElementType = GuiElementType> {
  constructor(public readonly element: Extract<LuaGuiElement, { type: T }>) {}

  simulateEvent<T extends GuiEvent>(event: Omit<T, "element" | "tick" | "player_index">): void {
    simulateEvent(this.element, event)
  }

  simulateClick(
    modifiers: {
      button?: defines.mouse_button_type
      alt?: boolean
      control?: boolean
      shift?: boolean
    } = {},
  ): void {
    this.simulateEvent<OnGuiClickEvent>({
      name: defines.events.on_gui_click,
      button: modifiers.button ?? defines.mouse_button_type.left,
      alt: modifiers.alt || false,
      control: modifiers.control || false,
      shift: modifiers.shift || false,
    })
  }

  simulateToggleState(this: ElementWrapper<"checkbox"> | ElementWrapper<"radiobutton">): void {
    this.element.state = !this.element.state
    this.simulateEvent<OnGuiCheckedStateChangedEvent>({
      name: defines.events.on_gui_checked_state_changed,
    })
  }
  setState(this: ElementWrapper<"checkbox"> | ElementWrapper<"radiobutton">, state: boolean): void {
    if (this.element.state != state) {
      this.simulateToggleState()
    }
  }
  find<T extends GuiElementType>(
    type: T,
    predicate?: (element: Extract<LuaGuiElement, { type: T }>) => boolean,
  ): ElementWrapper<T> {
    return new ElementWrapper(findWithType(this.element, type, predicate))
  }

  findAll<T extends GuiElementType>(
    type: T,
    predicate?: (element: Extract<LuaGuiElement, { type: T }>) => boolean,
  ): ElementWrapper<T>[] {
    return findAllWithType(this.element, type, predicate).map((element) => new ElementWrapper(element))
  }

  findSatisfying(predicate: (element: LuaGuiElement) => boolean): ElementWrapper {
    return new ElementWrapper(
      findElementSatisfying(this.element, predicate) ?? error(`Could not find element satisfying predicate`),
    )
  }

  findAllSatisfying(predicate: (element: LuaGuiElement) => boolean): ElementWrapper[] {
    return findAllElementsSatisfying(this.element, predicate).map((element) => new ElementWrapper(element))
  }

  isRoot(): boolean {
    return isRoot(this.element)
  }

  isValid(): boolean {
    return this.element.valid
  }

  // noinspection JSUnusedGlobalSymbols
  __eq(other: unknown): boolean {
    return other instanceof ElementWrapper && other.element == this.element
  }

  toString(): string {
    return getDescription(this.element)
  }
}

// jsx

export function testRender<T extends GuiElementType>(spec: FactorioElement & { type: T }): ElementWrapper<T>
export function testRender<T extends GuiElementType = GuiElementType>(spec: Element): ElementWrapper<T>
export function testRender(spec: Element): ElementWrapper {
  const element = render(spec, getPlayer().gui.screen)
  if (!element) error("no elements rendered")
  makeTestRoot(element)
  return new ElementWrapper(element)
}
