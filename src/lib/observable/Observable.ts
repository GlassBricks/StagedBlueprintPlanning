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

import { shallowCopy } from "../_util"
import { RegisterClass } from "../references"
import { Subscription } from "./Subscription"

export interface Observer<T> {
  invoke(value: T): void
}

export interface Observable<T> {
  subscribe(context: Subscription, observer: Observer<T>): Subscription
  subscribeIndependently(observer: Observer<T>): Subscription
}

export interface MultiObserver<A extends any[]> {
  invoke(...args: A): void
}

export interface MultiObservable<A extends any[]> {
  subscribe(context: Subscription, observer: MultiObserver<A>): Subscription
  subscribeIndependently(observer: MultiObserver<A>): Subscription
}

type AsMap<A extends any[]> = LuaMap<ObserverSubscription, MultiObserver<A>>
@RegisterClass("ObserverList")
export class ObserverList<A extends any[]> implements MultiObservable<A> {
  subscribeIndependently(observer: MultiObserver<A>): Subscription {
    const thisAsMap = this as unknown as AsMap<A>
    const subscription = new ObserverSubscription(thisAsMap)
    thisAsMap.set(subscription, observer)
    return subscription
  }

  subscribe(context: Subscription, observer: MultiObserver<A>): Subscription {
    const subscription = this.subscribeIndependently(observer)
    context.add(subscription)
    return subscription
  }

  raise(...args: A): void {
    const thisAsMap = this as unknown as AsMap<A>
    for (const [subscription, observer] of shallowCopy(thisAsMap)) {
      if (thisAsMap.has(subscription)) observer.invoke(...args)
    }
  }

  closeAll(): void {
    const thisAsMap = this as unknown as AsMap<A>
    for (const [subscription] of shallowCopy(thisAsMap)) {
      subscription.close()
      thisAsMap.delete(subscription)
    }
  }
}

@RegisterClass("ObserverSubscription")
class ObserverSubscription extends Subscription {
  constructor(private readonly observers: LuaMap<ObserverSubscription>) {
    super()
  }
  override close() {
    this.observers.delete(this)
    super.close()
  }
}

export type Event<T> = ObserverList<[T]>
export const Event: new <T>() => Event<T> = ObserverList

export type MultiEvent<A extends any[]> = ObserverList<A>
// noinspection JSUnusedGlobalSymbols
export const MultiEvent: new <A extends any[]>() => MultiEvent<A> = ObserverList
