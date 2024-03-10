import { Color, ColorArray } from "factorio:runtime"
import { Colors } from "../constants"
import {
  bind,
  ChangeObserver,
  funcRef,
  MaybeProperty,
  MutableProperty,
  Property,
  RegisterClass,
  registerFunctions,
  Subscription,
} from "../lib"
import { BaseStyleMod } from "../lib/factoriojsx"
import { DiffValue, getDiff, getResultValue } from "./diff-value"

@RegisterClass("DiffedProperty")
export class DiffedProperty<T> extends Property<T> implements MutableProperty<T> {
  private resultValue: Property<T>
  constructor(
    readonly overrideValue: MutableProperty<DiffValue<T> | nil>,
    readonly defaultValue: Property<T>,
  ) {
    super()
    this.resultValue = overrideValue.flatMap(bind(getResultValue<MaybeProperty<T>>, defaultValue))
  }

  _subscribeIndependently(observer: ChangeObserver<T>): Subscription {
    return this.resultValue._subscribeIndependently(observer)
  }
  get(): T {
    return this.resultValue.get()
  }

  set(value: T): void {
    this.overrideValue.set(getDiff(this.defaultValue.get(), value))
  }

  forceNotify(): void {
    this.resultValue.forceNotify()
  }

  closeAll(): void {
    this.resultValue.closeAll()
  }
}
function coloredIfNotNil(value: unknown): Color | ColorArray {
  return value != nil ? Colors.OverrideHighlight : [1, 1, 1]
}

function boldIfNotNil(value: unknown): string {
  return value != nil ? "default-bold" : "default"
}

registerFunctions("prop-possibly-overriden", {
  coloredIfNotNil,
  boldIfNotNil,
})

export function highlightIfNotNil(prop: Property<unknown>): BaseStyleMod {
  return {
    font_color: prop.map(funcRef(coloredIfNotNil)),
    font: prop.map(funcRef(boldIfNotNil)),
  }
}

export function highlightIfOverriden(prop: MutableProperty<any>): BaseStyleMod {
  if (!(prop instanceof DiffedProperty)) return {}
  return highlightIfNotNil(prop.overrideValue)
}

export function getDefaultValueIfIsOverridenProp<T>(prop: MutableProperty<T>): T | nil {
  if (prop instanceof DiffedProperty) {
    return prop.defaultValue.get()
  }
}
