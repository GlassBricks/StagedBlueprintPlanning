/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of 100% Blueprint Planning.
 *
 * 100% Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * 100% Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with 100% Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

// noinspection JSUnusedGlobalSymbols

import { Subscription } from "../observable"
import { Func, RegisterClass } from "../references"
import { ElementSpec } from "./element-specs"

export * from "./element-specs"

export interface Tracker {
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

export type FunctionComponent<T> = (props: T, tracker: Tracker) => Spec

@RegisterClass("FactorioJsxComponent")
export abstract class Component<P = EmptyProps> {
  abstract render(props: P, tracker: Tracker): Spec
  // noinspection JSUnusedGlobalSymbols
  declare _props: P
}

export type EmptyProps = Record<any, never>

export interface ComponentClass<P> {
  name: string
  new (): Component<P>
}

export interface FCSpec<T> {
  type: FunctionComponent<T>
  props: T
}

export interface ClassComponentSpec<T> {
  type: ComponentClass<T>
  props: T
}

export interface FragmentSpec {
  type: "fragment"
  children?: Spec[]
}

export type Spec = ElementSpec | FragmentSpec | FCSpec<any> | ClassComponentSpec<any>
export type SpecChildren = Spec | false | nil | Array<Spec | false | nil>

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
