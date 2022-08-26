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
import { shallowCopy } from "../util"
import { Subscription } from "./Subscription"

export interface Subscribable<L extends Func> {
  subscribe(context: Subscription, observer: L): Subscription
  subscribeIndependently(observer: L): Subscription
}

export interface Observer<T> {
  invoke(subscription: Subscription, value: T): void
}

export interface Observable<T> {
  subscribe(context: Subscription, observer: Observer<T>): Subscription
  subscribeIndependently(observer: Observer<T>): Subscription
}

type AdditionalArgs<L extends Func> = L["invoke"] extends (this: any, arg1: any, ...args: infer A) => void ? A : never

@RegisterClass("ObserverList")
export class ObserverList<L extends Func<(subscription: Subscription, ...args: any) => void>>
  implements Subscribable<L>
{
  private deleteQueue?: LuaSet<ObserverSubscription>
  private declare get: LuaTableGetMethod<ObserverSubscription, L | undefined>
  private declare set: LuaTableSetMethod<ObserverSubscription, L>
  private declare has: LuaTableHasMethod<ObserverSubscription>
  private declare delete: LuaTableDeleteMethod<ObserverSubscription>

  subscribeIndependently(observer: L): Subscription {
    const subscription = new ObserverSubscription(this)
    this.set(subscription, observer)
    return subscription
  }

  subscribe(context: Subscription, observer: L): Subscription {
    const subscription = this.subscribeIndependently(observer)
    context.add(subscription)
    return subscription
  }

  raise(...args: AdditionalArgs<L>): void
  raise(...args: any[]): void {
    for (const [subscription, observer] of shallowCopy(this as unknown as LuaMap<ObserverSubscription, L>)) {
      if (this.has(subscription)) observer.invoke(subscription, ...args)
    }
  }

  closeAll(): void {
    for (const [subscription] of shallowCopy(this as unknown as LuaMap<ObserverSubscription, L>)) {
      subscription.close()
    }
  }

  _delete(subscription: ObserverSubscription): void {
    if (!this.deleteQueue) this.delete(subscription)
    else this.deleteQueue.add(subscription)
  }
}

@RegisterClass("ObserverSubscription")
class ObserverSubscription extends Subscription {
  constructor(private readonly observers: ObserverList<any>) {
    super()
  }
  override close() {
    this.observers._delete(this)
    super.close()
  }
}

export type EventListener<T> = Observer<T>
export type Event<T> = ObserverList<EventListener<T>>
export const Event: new <T>() => Event<T> = ObserverList
