/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of BBPP3.
 *
 * BBPP3 is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * BBPP3 is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with Foobar. If not, see <https://www.gnu.org/licenses/>.
 */

import { BaseElementSpec, ComponentClass, ElementSpec, FunctionComponent, Spec } from "./spec"

const _select = select

function flattenChildren(...children: Array<false | nil | Spec> | [Array<false | nil | Spec>]): Spec[] | nil {
  let childrenLen = _select("#", ...children)
  if (childrenLen === 0) return nil
  let childArray: (false | Spec | nil)[]
  if (childrenLen === 1) {
    // optimize for the common case
    const [child] = children
    if (!child) return nil
    if (!Array.isArray(child)) {
      if (child.type === "fragment") return child.children
      return [child]
    }
    childArray = child
    const n = (childArray as any).n
    childrenLen = typeof n === "number" ? n : childArray.length
  } else {
    childArray = [...children] as any
  }

  const result: Spec[] = []
  for (const i of $range(1, childrenLen)) {
    const child = childArray[i - 1]
    if (child) {
      if (child.type === "fragment") {
        if (child.children) {
          result.push(...child.children)
        }
      } else {
        result.push(child)
      }
    }
  }
  return result
}

function flattenChildrenToProp(...children: Array<false | nil | Spec>): unknown {
  const childrenLen = _select("#", ...children)
  if (childrenLen === 0) return nil
  if (childrenLen === 1) {
    const [child] = children
    if (child && child.type === "fragment") return child.children ?? []
    return child
  }
  const result: unknown[] = []
  for (const i of $range(1, childrenLen)) {
    const child = children[i - 1]
    if (child && child.type === "fragment") {
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
  this: unknown,
  type: string | FunctionComponent<any> | ComponentClass<any>,
  props?: unknown,
  ...children: any[]
): Spec {
  const typeofType = _type(type)
  if (typeofType === "string") {
    const result = (props || {}) as BaseElementSpec
    result.type = type as GuiElementType
    result.children = flattenChildren(...children)
    return result as ElementSpec
  }
  props ||= {}
  ;(props as any).children ??= flattenChildrenToProp(...children)
  return {
    type: type as FunctionComponent<any> | ComponentClass<any>,
    props,
  }
}
