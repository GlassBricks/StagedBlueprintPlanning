import { Classes } from "../references"
import { SingleSubscribable } from "./Observers"

@Classes.register()
export class Event<T> extends SingleSubscribable<T> {
  public raise(value: T): void {
    this.fire(value)
  }
}

export class GlobalEvent<T> {
  private readonly listeners: Array<(value: T) => void> = []
  public raise(value: T): void {
    for (const listener of this.listeners) {
      listener(value)
    }
  }
  public subscribe(listener: (value: T) => void): void {
    this.listeners.push(listener)
  }
}
