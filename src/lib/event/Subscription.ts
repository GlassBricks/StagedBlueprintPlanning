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

import { Func, RegisterClass } from "../references"

export interface Unsubscribable {
  close(): void
}

export class UnsubscriptionError extends Error {
  constructor(readonly errors: any[]) {
    super(errors.map((err, i) => `${i + 1}) ${err.toString()}`).join("\n  "))
    this.name = "UnsubscriptionError"
  }
}

export type UnsubscribeAction = Unsubscribable | Func<() => void>

export interface ObserveOnlySubscription {
  isClosed(): boolean
  add(action: UnsubscribeAction): void
  hasActions(): boolean
}

@RegisterClass("Subscription")
export class Subscription implements Unsubscribable, ObserveOnlySubscription {
  // if nil, is closed
  _children: LuaSet<UnsubscribeAction> | nil = new LuaSet()
  _parents: LuaSet<Subscription> | nil = new LuaSet()

  isClosed(): boolean {
    return this._children == nil
  }

  add(subscription: UnsubscribeAction): void {
    if (subscription == this) return
    const { _children } = this
    if (!_children) {
      this.callUnsubscription(subscription)
      return
    }
    if (isSubscription(subscription)) {
      if (subscription.isClosed()) return
      subscription._parents!.add(this)
    }
    _children.add(subscription)
  }

  hasActions(): boolean {
    return this._children != nil && next(this._children)[0] != nil
  }

  private removeChild(subscription: Unsubscribable): void {
    this._children?.delete(subscription)
  }

  private callUnsubscription(subscription: UnsubscribeAction): void {
    if ("close" in subscription) {
      subscription.close()
    } else {
      subscription.invoke()
    }
  }

  public tryClose(): UnsubscriptionError | nil {
    const { _children } = this
    if (!_children) return

    // remove self from parents
    for (const parent of this._parents!) {
      parent.removeChild(this)
    }
    this._children = nil
    this._parents = nil

    // close children
    let errors: any[] | nil = nil
    for (const subscription of _children) {
      const [success, result] = pcall(this.callUnsubscription, this, subscription)
      if (!success) {
        errors ??= []
        if ((result as unknown) instanceof UnsubscriptionError) {
          errors.push(...(result as unknown as UnsubscriptionError).errors)
        } else {
          errors.push(result)
        }
      }
    }
    if (errors) {
      return new UnsubscriptionError(errors)
    }
  }
  close(): void {
    const error = this.tryClose()
    if (error) throw error
  }
}

const getMeta = getmetatable
export function isSubscription(subscription: unknown): subscription is Subscription {
  return getMeta(subscription) == Subscription.prototype
}
