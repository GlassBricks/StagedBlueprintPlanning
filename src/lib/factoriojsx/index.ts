// eslint-disable-next-line @typescript-eslint/triple-slash-reference
///<reference path="./jsx.d.ts" />

import _createElement from "./createElement"
import "./render"

export * from "./spec"
export * from "./render"

export namespace FactorioJsx {
  export const createElement = _createElement
  // noinspection JSUnusedGlobalSymbols
  export const Fragment = "fragment"
}

export type ElemProps<T extends GuiElementType> = JSX.IntrinsicElements[T]
