---
date: 2025-11-28T12:00:00+00:00
git_commit: 1a55206
branch: main
repository: StagedBlueprintPlanning
topic: "Function References System for Storage-Safe Functions"
tags: [research, codebase, function-references, storage, observers, gui, factoriojsx]
status: complete
last_updated: 2025-11-28
---

# Research: Function References for Storage-Safe Functions

**Date**: 2025-11-28
**Git Commit**: 1a55206
**Branch**: main
**Repository**: StagedBlueprintPlanning

## Research Question

How are "function references" handled in the project to create `storage`-safe functions, and how are they used in observers and GUI patterns?

## Summary

The function reference system solves a fundamental Factorio modding constraint: **raw Lua functions cannot be stored in `storage`** (the global table that persists across save/load). The system provides three core mechanisms:

1. **`funcRef()`** - Wraps registered standalone functions by storing their name
2. **`bind()`** - Partial application that stores bound arguments
3. **`ibind()`** - Instance method binding via TSTL compiler plugin transformation

All mechanisms produce objects implementing the `Func<F>` interface with an `.invoke()` method, enabling storage-safe callbacks throughout the event system and GUI framework.

## Detailed Findings

### Core Architecture

#### The Func Interface

The foundation is the `Func<F>` interface (`src/lib/references.ts:71-74`):

```typescript
export interface Func<F extends ContextualFun = ContextualFun> {
  invoke: F extends (...args: infer A) => infer R ? (this: this, ...args: A) => R : never
}
```

All callbacks in the event system and GUI use this interface instead of raw functions. The `.invoke()` method is called at runtime to execute the underlying function.

#### Registry System

Functions are stored in a global `Registry<AnyFunction>` (`src/lib/references.ts:78-80`):

```typescript
export const Functions = new Registry<AnyFunction>("function", ...)
```

The registry maintains bidirectional mappings:
- `nameToItem`: string → function (for invocation)
- `itemToName`: function → string (for registration)

Registration happens at script load time only (`src/lib/registry.ts:18-19`).

### Function Reference Mechanisms

#### 1. funcRef - Standalone Function References

Creates a storage-safe reference to a registered function by storing only its name:

```typescript
@RegisterClass("FuncRef")
class FuncRef implements Func {
  funcName: string

  constructor(func: SelflessFun) {
    this.funcName = Functions.nameOf(func)
  }

  invoke(...args: any[]): any {
    return (_nameToItem[this.funcName] as SelflessFun)(...args)
  }
}
```

**Usage pattern:**
```typescript
// Registration (at module load)
registerFunctions("gui:project-selector", { onModButtonClick })

// Usage
<button on_gui_click={funcRef(onModButtonClick)} />
```

#### 2. bind - Partial Application

Binds arguments to a function, creating specialized `Bound1`-`Bound4` or `BoundN` classes:

```typescript
@RegisterClass("FuncBound1")
class Bound1 {
  constructor(public func: Func, public arg1: unknown) {}
  invoke(...args: any[]): any {
    return this.func.invoke(this.arg1, ...args)
  }
}
```

**Usage patterns:**
```typescript
// Bind standalone function with argument
bind(closeParentAtLevel, frameLevel)

// Combined with ibind for instance methods
bind(ibind(this.setDropDownItem), stage.stageNumber)

// Property mapping
this.name.map(bind(UserProjectImpl.getDisplayName, this.id))
```

#### 3. ibind - Instance Method Binding

The TSTL plugin (`tstlPlugin/plugin.cts`) transforms `ibind(this.method)` to `ibind(this, "method")`:

```typescript
@RegisterClass("KeyFunc")
class KeyFunc implements Func {
  constructor(
    private readonly instance: Record<keyof any, ContextualFun>,
    private readonly key: keyof any,
  ) {}

  invoke(...args: unknown[]) {
    const fn = this.instance[this.key]
    return fn.call(this.instance, ...args)
  }
}
```

**Usage patterns:**
```typescript
// GUI event handlers
<button on_gui_click={ibind(this.rebuildStage)} />

// Property subscriptions
this.name.subscribe(subscription, ibind(this.onNameChange))

// Reactive rendering
<Fn from={property} map={ibind(this.renderStageSettings)} />
```

### Class Registration

The `@RegisterClass` decorator (`src/lib/references.ts:41-43`) registers a class's prototype with Factorio's `script.register_metatable()`:

```typescript
function registerClass(name: string, _class: Class<any>) {
  script.register_metatable(name, _class.prototype)
  // ...flattens prototype chain
  // ...registers static methods automatically
}
```

Registration ensures:
1. Instances survive save/load via metatable preservation
2. `ibind` can find methods through registered metatables
3. Static methods are auto-registered as functions

### Event System Integration

#### Event Subscriptions

The event system (`src/lib/event/Event.ts`) requires all observers to be `Func`:

```typescript
type AnyObserver = Func<(...args: any) => void>

_subscribeIndependently(observer: O): Subscription {
  const subscription = new EventSubscription(thisAsMap)
  thisAsMap.set(subscription, observer)
  return subscription
}

raise(...args: Parameters<O["invoke"]>): void {
  for (const [subscription, observer] of shallowCopy(thisAsMap)) {
    if (thisAsMap.has(subscription)) observer.invoke(...(args as any[]))
  }
}
```

#### Property Observers

Properties (`src/lib/event/Property.ts`) use `ibind` for internal listeners:

```typescript
this.sourceSubscription = source._subscribeIndependently(ibind(this.sourceListener))
```

And `bind` for utility functions:

```typescript
and<V>(other: MaybeProperty<V>): Property<V | nil> {
  return this.flatMap(bind(Property.andFn<MaybeProperty<V>>, other))
}
```

### GUI Framework Integration

#### Event Handler Storage

GUI event handlers are stored per-element in `storage.players[index].guiElements`:

```typescript
interface ElementInstance {
  readonly element: BaseGuiElement
  readonly events: PRecord<GuiEventName, Func<any>>
  readonly componentInstance?: Component<any>
  // ...
}
```

#### Automatic Function Wrapping

During rendering (`src/lib/factoriojsx/render.ts:218`), raw functions are auto-converted:

```typescript
if (typeof value == "function") value = funcRef(value as any)
```

#### Event Dispatch

When Factorio fires events, the system retrieves and invokes stored `Func` objects:

```typescript
Events.on(id, (e) => {
  const instance = getInstance(element)
  const event = instance.events[name]
  if (event) {
    protectedAction(event.invoke, event, e)
  }
})
```

#### Two-Way Property Binding

For mutable properties on GUI elements, automatic handlers are created:

```typescript
if (isMutableProperty<any>(value)) {
  events[stateEvent] = bind(setStateFunc, value, key)
}
// And subscribe property to update GUI
value.subscribeAndRaise(subscription, bind(setPropObserver, factorioElement, key))
```

### LazyLoad Pattern

For closure-based code that can't be stored directly, `LazyLoadClass` (`src/lib/LazyLoad.ts`) provides on-demand loading:

```typescript
const UserActionsClass = LazyLoadClass<HasProject, UserActions>(
  "UserActions",
  ({ project }) => UserActions(project, ...)
)
```

The container object is registered and stored; the closure code loads on first property access.

## Code References

- `src/lib/references.ts:71-74` - Func interface definition
- `src/lib/references.ts:93-104` - FuncRef implementation
- `src/lib/references.ts:111-173` - Bound1-BoundN implementations
- `src/lib/references.ts:213-244` - KeyFunc and NoSelfKeyFunc
- `src/lib/references.ts:254-255` - ibind export
- `src/lib/registry.ts:17-39` - Registry.registerAs
- `tstlPlugin/plugin.cts:34-44` - AccessSplit transformation
- `src/lib/event/Event.ts:19-37` - Event subscription and raise
- `src/lib/event/Property.ts:173` - Property internal ibind usage
- `src/lib/factoriojsx/render.ts:218` - Automatic funcRef wrapping
- `src/lib/factoriojsx/render.ts:463-475` - Event dispatch

## Architecture Insights

### Design Principles

1. **String-based indirection**: Functions are referenced by registered names, not raw function pointers
2. **Composable wrappers**: `bind()` can wrap `funcRef()` or `ibind()` results
3. **Automatic registration**: Static class methods auto-register; decorators handle classes
4. **Compile-time transformation**: TSTL plugin transforms `ibind(this.x)` to `ibind(this, "x")`

### Storage Safety Rules

For any object stored in `storage`:
- Never store raw functions
- Use `funcRef()` for standalone functions
- Use `ibind()` for instance methods
- Use `bind()` for partial application
- All containing classes must use `@RegisterClass`

### Common Patterns Summary

| Pattern | Use Case | Example |
|---------|----------|---------|
| `funcRef(fn)` | Module-level event handlers | `on_gui_click={funcRef(onModButtonClick)}` |
| `ibind(this.method)` | Component event handlers | `on_gui_click={ibind(this.onConfirm)}` |
| `bind(fn, arg)` | Pre-fill arguments | `bind(closeParentAtLevel, frameLevel)` |
| `bind(ibind(...), arg)` | Instance method + args | `bind(ibind(this.setItem), stageNum)` |
| `prop.map(funcRef(...))` | Property transformation | `prop.map(funcRef(Property.truthyFn))` |
| `prop.subscribe(sub, ibind(...))` | Property observation | `name.subscribe(sub, ibind(this.onChange))` |

## Open Questions

1. **Performance**: What's the overhead of the `.invoke()` indirection compared to direct function calls?
2. **Memory**: How do orphaned `Func` objects get garbage collected?
3. **Debugging**: Error messages from `KeyFunc.invoke` include useful context, but stack traces may be harder to follow
