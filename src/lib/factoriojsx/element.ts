// noinspection JSUnusedGlobalSymbols

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
  LuaGuiElement,
  OnGuiCheckedStateChangedEvent,
  OnGuiClickEvent,
  OnGuiClosedEvent,
  OnGuiConfirmedEvent,
  OnGuiElemChangedEvent,
  OnGuiLocationChangedEvent,
  OnGuiOpenedEvent,
  OnGuiSelectedTabChangedEvent,
  OnGuiSelectionStateChangedEvent,
  OnGuiSwitchStateChangedEvent,
  OnGuiTextChangedEvent,
  OnGuiValueChangedEvent,
  PlayerIndex,
} from "factorio:runtime"
import { Subscription } from "../event"
import { Func, RegisterClass } from "../references"
import type { FactorioElement } from "./factorio-elements"

export type * from "./factorio-elements"

export interface RenderContext {
  /**
   * This does not have to be a registered func.
   */
  onMount(callback: (this: unknown, firstElement: LuaGuiElement) => void): void

  /**
   * This is closed when the element is destroyed.
   */
  getSubscription(): Subscription

  readonly playerIndex: PlayerIndex
}

export type FunctionComponent<T> = (props: T, context: RenderContext) => Element

@RegisterClass("FactorioJsxComponent")
export abstract class Component<P = EmptyProps> {
  abstract render(props: P, context: RenderContext): Element
  // noinspection JSUnusedGlobalSymbols
  declare _props: P
}

export type EmptyProps = { _?: never }

export interface ComponentClass<P> {
  name: string
  new (): Component<P>
}

export interface ClassComponent<T> {
  type: ComponentClass<T>
  props: T
}

export interface FunctionalComponent<T> {
  type: FunctionComponent<T>
  props: T
}

export interface FragmentElement {
  type: "fragment"
  children?: Element[]
}

export type Element = FactorioElement | FragmentElement | FunctionalComponent<any> | ClassComponent<any>
export type SingleChild = Element | false | nil
export type OneOrMoreChildren = SingleChild | SingleChild[]
export type ElementChildren = SingleChild | Array<OneOrMoreChildren>

export type GuiEvent =
  | OnGuiCheckedStateChangedEvent
  | OnGuiClosedEvent
  | OnGuiClickEvent
  | OnGuiConfirmedEvent
  | OnGuiElemChangedEvent
  | OnGuiLocationChangedEvent
  | OnGuiOpenedEvent
  | OnGuiSelectedTabChangedEvent
  | OnGuiSelectionStateChangedEvent
  | OnGuiSwitchStateChangedEvent
  | OnGuiTextChangedEvent
  | OnGuiValueChangedEvent

export type GuiEventHandler<T extends GuiEvent = GuiEvent> = Func<(event: T) => void>
export type CheckedStateChangedEventHandler = GuiEventHandler<OnGuiCheckedStateChangedEvent>
export type ClosedEventHandler = GuiEventHandler<OnGuiClosedEvent>
export type ClickEventHandler = GuiEventHandler<OnGuiClickEvent>
export type ConfirmedEventHandler = GuiEventHandler<OnGuiConfirmedEvent>
export type ElemChangedEventHandler = GuiEventHandler<OnGuiElemChangedEvent>
export type LocationChangedEventHandler = GuiEventHandler<OnGuiLocationChangedEvent>
export type OpenedEventHandler = GuiEventHandler<OnGuiOpenedEvent>
export type SelectedTabChangedEventHandler = GuiEventHandler<OnGuiSelectedTabChangedEvent>
export type SelectionStateChangedEventHandler = GuiEventHandler<OnGuiSelectionStateChangedEvent>
export type SwitchStateChangedEventHandler = GuiEventHandler<OnGuiSwitchStateChangedEvent>
export type TextChangedEventHandler = GuiEventHandler<OnGuiTextChangedEvent>
export type ValueChangedEventHandler = GuiEventHandler<OnGuiValueChangedEvent>

export type OnCreateHandler<T extends BaseGuiElement> = (this: unknown, element: T) => void
