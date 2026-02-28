// Copyright (c) 2022 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { shallowCopy } from "../_util"
import { Func, RegisterClass } from "../references"
import { Subscription } from "./Subscription"

type AnyObserver = Func<(...args: any) => void>
export interface Subscribable<O extends AnyObserver> {
  _subscribeIndependently(observer: O): Subscription
  subscribe(context: Subscription, observer: O): Subscription
}

type AsMap = LuaMap<EventSubscription, AnyObserver>
@RegisterClass("ObserverList") // old name so migrations work
export class Event<O extends AnyObserver> implements Subscribable<O> {
  _subscribeIndependently(observer: O): Subscription {
    const thisAsMap = this as unknown as AsMap
    const subscription = new EventSubscription(thisAsMap)
    thisAsMap.set(subscription, observer)
    return subscription
  }

  subscribe(context: Subscription, observer: O): Subscription {
    const subscription = this._subscribeIndependently(observer)
    context.add(subscription)
    return subscription
  }

  raise(...args: Parameters<O["invoke"]>): void {
    const thisAsMap = this as unknown as AsMap
    for (const [subscription, observer] of shallowCopy(thisAsMap)) {
      if (thisAsMap.has(subscription)) observer.invoke(...(args as any[]))
    }
  }

  closeAll(): void {
    const thisAsMap = this as unknown as AsMap
    for (const [subscription] of shallowCopy(thisAsMap)) {
      subscription.close()
      thisAsMap.delete(subscription)
    }
  }
}

@RegisterClass("ObserverSubscription")
class EventSubscription extends Subscription {
  constructor(private readonly observers: LuaMap<EventSubscription>) {
    super()
  }
  override close() {
    this.observers.delete(this)
    super.close()
  }
}

export interface SimpleObserver<T> {
  invoke(value: T): void
}

export type SimpleSubscribable<T> = Subscribable<SimpleObserver<T>>
export type SimpleEvent<T> = Event<SimpleObserver<T>>
export const SimpleEvent: new <T>() => SimpleEvent<T> = Event
