// Copyright (c) 2022 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { GuiElementType } from "factorio:runtime"
import { BaseElement, ComponentClass, Element, FactorioElement, FunctionComponent } from "./element"

const _select = select

function flattenChildren(...children: Array<false | nil | Element | Array<false | nil | Element>>): Element[] | nil {
  let childrenLen = _select("#", ...children)
  if (childrenLen == 0) return nil
  let childArray: typeof children
  if (childrenLen == 1) {
    // optimize for the common case
    const [child] = [...children]
    if (!child) return nil
    if (!Array.isArray(child)) {
      if (child.type == "fragment") return child.children
      return [child]
    }
    childArray = child
    const n = (childArray as any).n
    childrenLen = typeof n == "number" ? n : childArray.length
  } else {
    childArray = [...children]
  }

  const result: Element[] = []
  function pushSingleChild(child: Element | false | nil) {
    if (child) {
      if (child.type == "fragment") {
        const children = child.children
        if (children) {
          result.push(...children)
        }
      } else {
        result.push(child)
      }
    }
  }
  for (const i of $range(1, childrenLen)) {
    const child = childArray[i - 1]
    if (Array.isArray(child)) {
      for (const child2 of child) {
        pushSingleChild(child2)
      }
    } else {
      pushSingleChild(child)
    }
  }
  return result
}

function flattenChildrenToProp(...children: Array<false | nil | Element>): unknown {
  const childrenLen = _select("#", ...children)
  if (childrenLen == 0) return nil
  if (childrenLen == 1) {
    const [child] = [...children]
    if (child && child.type == "fragment") return child.children ?? []
    return child
  }
  const children2 = [...children]
  const result: unknown[] = []
  for (const i of $range(1, childrenLen)) {
    const child = children2[i - 1]
    if (child && child.type == "fragment") {
      if (child.children) {
        result.push(...child.children)
      }
    } else {
      result.push(child)
    }
  }
  return result
}

const _type = type
export default function createElement(
  type: string | FunctionComponent<any> | ComponentClass<any>,
  props?: unknown,
  ...children: any[]
): Element {
  const typeofType = _type(type)
  if (typeofType == "string") {
    const result = (props || {}) as BaseElement
    result.type = type as GuiElementType
    result.children = flattenChildren(...children)
    return result as FactorioElement
  }
  props ||= {}
  ;(props as any).children ??= flattenChildrenToProp(...children)
  return {
    type: type as FunctionComponent<any> | ComponentClass<any>,
    props,
  }
}
