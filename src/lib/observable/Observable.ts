/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of BBPP3.
 *
 * BBPP3 is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * BBPP3 is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with BBPP3. If not, see <https://www.gnu.org/licenses/>.
 */

import { Func, RegisterClass } from "../references"
import { Subscription } from "./Subscription"

export interface Subscribable<L extends Func> {
  subscribe(context: Subscription, observer: L): Subscription
  subscribeIndependently(observer: L): Subscription
}

export interface ValueListener<T> {
  invoke(subscription: Subscription, value: T): void
}

export type Observer<T> = ValueListener<T>
export type Observable<T> = Subscribable<ValueListener<T>>

type AdditionalArgs<L extends Func> = L["invoke"] extends (this: any, arg1: any, ...args: infer A) => void ? A : never

@RegisterClass("ObserverList")
export class ObserverList<L extends Func<(subscription: Subscription, ...args: any) => void>>
  implements Subscribable<L>
{
  subscribeIndependently(observer: L): Subscription {
    const thisAsMap = this as unknown as LuaMap<ObserverSubscription, L>
    const subscription = new ObserverSubscription(thisAsMap)
    thisAsMap.set(subscription, observer)
    return subscription
  }

  subscribe(context: Subscription, observer: L): Subscription {
    const subscription = this.subscribeIndependently(observer)
    context.add(subscription)
    return subscription
  }

  raise(...args: AdditionalArgs<L>): void
  raise(...args: any[]): void {
    for (const [subscription, observer] of this as unknown as LuaMap<ObserverSubscription, L>) {
      observer.invoke(subscription, ...args)
    }
  }

  closeAll(): void {
    for (const [subscription] of this as unknown as LuaMap<ObserverSubscription, L>) {
      subscription.close()
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

export type EventListener<T> = ValueListener<T>
export type Event<T> = ObserverList<EventListener<T>>
export const Event: new <T>() => Event<T> = ObserverList
