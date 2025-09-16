// Copyright (c) 2022 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { GuiElementType } from "factorio:runtime"
import _createElement from "./createElement"
import {
  ButtonElement,
  CameraElement,
  CheckboxElement,
  ChooseElemButtonElement,
  DropDownElement,
  ElementChildren,
  EmptyWidgetElement,
  EntityPreviewElement,
  FlowElement,
  FrameElement,
  LabelElement,
  LineElement,
  ListBoxElement,
  MinimapElement,
  ProgressBarElement,
  RadioButtonElement,
  ScrollPaneElement,
  SliderElement,
  SpriteButtonElement,
  SwitchElement,
  TabbedPaneElement,
  TabElement,
  TableElement,
  TextBoxElement,
  TextFieldElement,
} from "./element"
import { FactorioElement } from "./factorio-elements"

export * from "./element"
export * from "./render"
export * from "./util"

export namespace FactorioJsx {
  export const createElement = _createElement

  // noinspection JSUnusedGlobalSymbols
  export const Fragment = "fragment"

  export namespace JSX {
    type IntrinsicElement<T extends FactorioElement> = Omit<T, "type" | "children"> & {
      children?: ElementChildren
    }
    export type Element = import("./element").Element

    // noinspection JSUnusedGlobalSymbols
    export interface ElementAttributesProperty {
      _props: any
    }
    // noinspection JSUnusedGlobalSymbols
    export interface ElementChildrenAttribute {
      children: any
    }

    export interface IntrinsicElements {
      "choose-elem-button": IntrinsicElement<ChooseElemButtonElement>
      "drop-down": IntrinsicElement<DropDownElement>
      "empty-widget": IntrinsicElement<EmptyWidgetElement>
      "entity-preview": IntrinsicElement<EntityPreviewElement>
      "list-box": IntrinsicElement<ListBoxElement>
      "scroll-pane": IntrinsicElement<ScrollPaneElement>
      "sprite-button": IntrinsicElement<SpriteButtonElement>
      "tabbed-pane": IntrinsicElement<TabbedPaneElement>
      "text-box": IntrinsicElement<TextBoxElement>
      button: IntrinsicElement<ButtonElement>
      camera: IntrinsicElement<CameraElement>
      checkbox: IntrinsicElement<CheckboxElement>
      flow: IntrinsicElement<FlowElement>
      frame: IntrinsicElement<FrameElement>
      label: IntrinsicElement<LabelElement>
      line: IntrinsicElement<LineElement>
      minimap: IntrinsicElement<MinimapElement>
      progressbar: IntrinsicElement<ProgressBarElement>
      radiobutton: IntrinsicElement<RadioButtonElement>
      slider: IntrinsicElement<SliderElement>
      sprite: IntrinsicElement<SpriteButtonElement>
      switch: IntrinsicElement<SwitchElement>
      tab: IntrinsicElement<TabElement>
      table: IntrinsicElement<TableElement>
      textfield: IntrinsicElement<TextFieldElement>
      fragment: {
        children?: ElementChildren
      }
    }
  }
}

export type ElemProps<T extends GuiElementType> = FactorioJsx.JSX.IntrinsicElements[T]
