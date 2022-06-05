// noinspection JSUnusedGlobalSymbols

import {
  ButtonElementSpec,
  CameraElementSpec,
  CheckboxElementSpec,
  ChooseElemButtonElementSpec,
  DropDownElementSpec,
  ElementSpec,
  EmptyWidgetElementSpec,
  EntityPreviewElementSpec,
  FlowElementSpec,
  FrameElementSpec,
  LabelElementSpec,
  LineElementSpec,
  ListBoxElementSpec,
  MinimapElementSpec,
  ProgressBarElementSpec,
  RadioButtonElementSpec,
  ScrollPaneElementSpec,
  SliderElementSpec,
  Spec,
  SpecChildren,
  SpriteButtonElementSpec,
  SwitchElementSpec,
  TabbedPaneElementSpec,
  TabElementSpec,
  TableElementSpec,
  TextBoxElementSpec,
  TextFieldElementSpec,
} from "./spec"

declare global {
  namespace JSX {
    type IntrinsicElement<T extends ElementSpec> = Omit<T, "type" | "children"> & {
      children?: SpecChildren
    }
    export type Element = Spec

    export interface ElementAttributesProperty {
      _props: any
    }
    export interface ElementChildrenAttribute {
      children: any
    }

    export interface IntrinsicElements {
      "choose-elem-button": IntrinsicElement<ChooseElemButtonElementSpec>
      "drop-down": IntrinsicElement<DropDownElementSpec>
      "empty-widget": IntrinsicElement<EmptyWidgetElementSpec>
      "entity-preview": IntrinsicElement<EntityPreviewElementSpec>
      "list-box": IntrinsicElement<ListBoxElementSpec>
      "scroll-pane": IntrinsicElement<ScrollPaneElementSpec>
      "sprite-button": IntrinsicElement<SpriteButtonElementSpec>
      "tabbed-pane": IntrinsicElement<TabbedPaneElementSpec>
      "text-box": IntrinsicElement<TextBoxElementSpec>
      button: IntrinsicElement<ButtonElementSpec>
      camera: IntrinsicElement<CameraElementSpec>
      checkbox: IntrinsicElement<CheckboxElementSpec>
      flow: IntrinsicElement<FlowElementSpec>
      frame: IntrinsicElement<FrameElementSpec>
      label: IntrinsicElement<LabelElementSpec>
      line: IntrinsicElement<LineElementSpec>
      minimap: IntrinsicElement<MinimapElementSpec>
      progressbar: IntrinsicElement<ProgressBarElementSpec>
      radiobutton: IntrinsicElement<RadioButtonElementSpec>
      slider: IntrinsicElement<SliderElementSpec>
      sprite: IntrinsicElement<SpriteButtonElementSpec>
      switch: IntrinsicElement<SwitchElementSpec>
      tab: IntrinsicElement<TabElementSpec>
      table: IntrinsicElement<TableElementSpec>
      textfield: IntrinsicElement<TextFieldElementSpec>
    }
  }
}
