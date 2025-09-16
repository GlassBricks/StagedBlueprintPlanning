// Copyright (c) 2022-2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Func, RegisterClass } from "../references"

export interface Unsubscribable {
  close(): void
}

export class UnsubscriptionError {
  message: string
  constructor(readonly errors: any[]) {
    // super(errors.map((err, i) => `${i + 1}) ${err.toString()}`).join("\n  "))
    this.message = errors.map((err, i) => `${i + 1}) ${err.toString()}`).join("\n  ")
  }

  __tostring(): string {
    return this.message
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
  // if nil, then is closed
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

  tryClose(): UnsubscriptionError | nil {
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
