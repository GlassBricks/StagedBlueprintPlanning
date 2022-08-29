/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of 100% Blueprint Planning.
 *
 * 100% Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * 100% Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with 100% Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { Func, RegisterClass } from "../references"
import { shallowCopy } from "../util"
import { Subscription } from "./Subscription"

export interface Subscribable<L extends Func> {
  subscribe(context: Subscription, observer: L): Subscription
  subscribeIndependently(observer: L): Subscription
}

export interface Observer<T> {
  invoke(value: T): void
}

export interface Observable<T> {
  subscribe(context: Subscription, observer: Observer<T>): Subscription
  subscribeIndependently(observer: Observer<T>): Subscription
}

@RegisterClass("ObserverList")
export class ObserverList<L extends Func<(...args: any) => void>> implements Subscribable<L> {
  private declare get: LuaTableGetMethod<ObserverSubscription, L | undefined>
  private declare set: LuaTableSetMethod<ObserverSubscription, L>
  private declare has: LuaTableHasMethod<ObserverSubscription>
  private declare delete: LuaTableDeleteMethod<ObserverSubscription>

  subscribeIndependently(observer: L): Subscription {
    const subscription = new ObserverSubscription(this as any)
    this.set(subscription, observer)
    return subscription
  }

  subscribe(context: Subscription, observer: L): Subscription {
    const subscription = this.subscribeIndependently(observer)
    context.add(subscription)
    return subscription
  }

  raise(...args: Parameters<L["invoke"]>): void
  raise(...args: any[]): void {
    for (const [subscription, observer] of shallowCopy(this as unknown as LuaMap<ObserverSubscription, L>)) {
      if (this.has(subscription)) observer.invoke(...args)
    }
  }

  closeAll(): void {
    for (const [subscription] of shallowCopy(this as unknown as LuaMap<ObserverSubscription, L>)) {
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

export type EventListener<T> = Observer<T>
export type Event<T> = ObserverList<EventListener<T>>
export const Event: new <T>() => Event<T> = ObserverList
