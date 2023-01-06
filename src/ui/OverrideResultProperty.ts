import {
  ChangeObserver,
  deepCompare,
  funcRef,
  ibind,
  MutableProperty,
  Property,
  RegisterClass,
  registerFunctions,
  Subscription,
} from "../lib"
import { BaseStyleMod } from "../lib/factoriojsx"

@RegisterClass("OverrideResultProperty")
export class OverrideResultProperty<T> extends Property<T> implements MutableProperty<T> {
  private resultValue: Property<T>
  constructor(readonly overrideValue: MutableProperty<T | nil>, readonly defaultValue: Property<T>) {
    super()
    this.resultValue = overrideValue.flatMap(ibind(this.defaultIfNil))
  }

  private defaultIfNil<T>(value: T | nil) {
    return value ?? this.defaultValue
  }

  _subscribeIndependently(observer: ChangeObserver<T>): Subscription {
    return this.resultValue._subscribeIndependently(observer)
  }
  get(): T {
    return this.resultValue.get()
  }

  set(value: T): void {
    if (deepCompare(this.defaultValue.get(), value)) {
      this.overrideValue.set(nil)
    } else {
      this.overrideValue.set(value)
    }
  }

  forceNotify(): void {
    this.resultValue.forceNotify()
  }

  closeAll(): void {
    this.resultValue.closeAll()
  }
}
function blueIfNotNil(value: unknown | nil): Color | ColorArray {
  return value != nil ? [0.6, 0.8, 1] : [1, 1, 1]
}

function boldIfNotNil(value: unknown | nil): string {
  return value != nil ? "default-bold" : "default"
}

registerFunctions("prop-possibly-overriden", {
  blueIfNotNil,
  boldIfNotNil,
})

export function highlightIfOverriden<T>(prop: MutableProperty<T>): BaseStyleMod {
  if (!(prop instanceof OverrideResultProperty)) return {}
  return {
    font_color: prop.overrideValue.map(funcRef(blueIfNotNil)),
    font: prop.overrideValue.map(funcRef(boldIfNotNil)),
  }
}

export function getDefaultValueIfIsOverridenProp<T>(prop: MutableProperty<T>): T | nil {
  if (prop instanceof OverrideResultProperty) {
    return prop.defaultValue.get()
  }
}
