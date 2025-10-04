# The Lib: Reusable Modular Utilities

This document catalogs all individual, potentially modular features provided by `/src/lib` that may be useful in other Factorio mods or TypeScript projects using TypeScriptToLua (TSTL).

**License:** LGPL-3.0-or-later (as indicated in file headers)

---

## Table of Contents

1. [Event System](#1-event-system)
2. [References System](#2-references-system)
3. [FactorioJSX Framework](#3-factoriojsx-framework)
4. [Geometry Utilities](#4-geometry-utilities)
5. [Events Registration](#5-events-registration)
6. [Migration Framework](#6-migration-framework)
7. [Task System](#7-task-system)
8. [Registry](#8-registry)
9. [LazyLoad](#9-lazyload)
10. [Selection Tool Handlers](#10-selection-tool-handlers)
11. [Player Initialization](#11-player-initialization)
12. [Protected Actions](#12-protected-actions)
13. [Utility Functions](#13-utility-functions)
14. [Build Scripts](#build-scripts)

---

## 1. Event System

**Purpose:** A reactive event/property system similar to observables/signals in other frameworks. Provides type-safe, memory-efficient event handling with automatic subscription management.

### Features

- **Event** - Observable event emitter with subscription management
- **Property** - Reactive state containers with change notifications
- **MutableProperty** - Writable reactive properties
- **Subscription** - Hierarchical subscription management with automatic cleanup
- **GlobalEvent** - Lightweight global event bus

### Key Files

- `src/lib/event/Event.ts` - Event emitter implementation
- `src/lib/event/Property.ts` - Reactive property system with map/flatMap
- `src/lib/event/Subscription.ts` - Subscription lifecycle management
- `src/lib/event/GlobalEvent.ts` - Global event implementation
- `src/lib/event/index.ts` - Public API exports

### Core API

```typescript
// Events
const event = new Event<SimpleObserver<string>>()
const subscription = event.subscribe(context, { invoke: (value) => game.print(value) })
event.raise("Hello")

// Properties
const count = property(0)
count.subscribe(context, { invoke: (newVal, oldVal) => game.print(`${oldVal} -> ${newVal}`) })
count.set(5)

// Derived properties
const doubled = count.map(funcRef((x) => x * 2))
const message = count.map(funcRef((x) => `Count: ${x}`))
```

### Dependencies

- `src/lib/references.ts` - For `Func`, `RegisterClass`, function storage
- `src/lib/_util.ts` - For `shallowCopy`, `isEmpty`

### Usage Notes

- Properties automatically unsubscribe from upstream when they have no subscribers (memory efficient)
- Supports map, flatMap, and other reactive operators
- `subscribeAndRaise` immediately invokes observer with current value
- Use with `Subscription` for automatic cleanup when GUI elements are destroyed

---

## 2. References System

**Purpose:** Enables persistent storage of functions in Factorio's global state by registering them with unique names. Includes a custom TSTL plugin for special calling conventions.

### Features

- Function registry with name-based lookup
- Class registration for metatables
- Partial application via `bind()` with optimized bound function classes
- Instance method binding via `ibind()` (requires TSTL plugin)
- Automatic static method registration

### Key Files

- `src/lib/references.ts` - Core function/class registration system
- `tstlPlugin/plugin.cts` - TSTL compiler plugin for `ibind` transformation
- `tstlPlugin/extensions.d.ts` - Type definitions for plugin features
- `tstlPlugin/tsconfig.json` - Plugin build configuration

### Core API

```typescript
// Register functions
registerFunctions("myMod", {
  onClick: function() { /* ... */ },
  onClose: function() { /* ... */ }
})

// Function references
const ref = funcRef(myFunction) // myFunction must be registered

// Partial application
const onClick = bind(handleClick, entity, "left")

// Instance binding (transformed by TSTL plugin)
const callback = ibind(this.handleUpdate) // becomes: ibind(this, "handleUpdate")

// Class registration
@RegisterClass("MyClass")
class MyComponent { /* ... */ }
```

### TSTL Plugin Details

The plugin (`tstlPlugin/plugin.cts`) provides:

1. **AccessSplit transformation** - Transforms `ibind(this.method)` → `ibind(this, "method")`
2. **@beforeImports support** - Allows code blocks to run before imports
3. **File name sanitization** - Replaces dots with hyphens in output filenames
4. **Test rerun trigger** - Sends UDP packet to test runner on rebuild

### Dependencies

- `src/lib/registry.ts` - For Registry class
- `src/lib/_util.ts` - For PRRecord type
- TypeScript compiler API and TSTL for plugin

### Build Scripts

```bash
npm run build:tstlPlugin  # Compiles the TSTL plugin
```

Configuration in `tsconfig.json`:
```json
{
  "tstl": {
    "luaPlugins": [{ "name": "./tstlPlugin/plugin.cts", "hasTests": true }]
  }
}
```

---

## 3. FactorioJSX Framework

**Purpose:** A React-like JSX framework for creating Factorio GUI elements with reactive properties, component lifecycle, and event handling.

### Features

- JSX/TSX syntax for GUI creation
- Functional and class-based components
- Reactive properties with automatic UI updates
- Event handler registration
- Component lifecycle (onMount, cleanup via subscriptions)
- Pre-built reusable components

### Key Files

**Core:**
- `src/lib/factoriojsx/index.ts` - Main exports
- `src/lib/factoriojsx/createElement.ts` - JSX transformation
- `src/lib/factoriojsx/render.ts` - Rendering engine with subscriptions
- `src/lib/factoriojsx/element.ts` - Element and component type definitions
- `src/lib/factoriojsx/factorio-elements.ts` - GUI element specifications
- `src/lib/factoriojsx/util.ts` - Utility functions

**Components:**
- `src/lib/factoriojsx/components/Dialog.tsx` - Modal dialog component
- `src/lib/factoriojsx/components/TitleBar.tsx` - Draggable title bars with close button
- `src/lib/factoriojsx/components/buttons.tsx` - CloseButton, TrashButton, RefreshButton, etc.
- `src/lib/factoriojsx/components/misc.tsx` - HorizontalPusher, VerticalPusher, Spacers
- `src/lib/factoriojsx/components/Fn.tsx` - Map property to rendered elements
- `src/lib/factoriojsx/components/If.tsx` - Conditional rendering component
- `src/lib/factoriojsx/components/index.ts` - Component exports

### Core API

```tsx
// Functional component
function MyButton(props: { caption: string, onClick: ClickEventHandler }) {
  return <button caption={props.caption} on_gui_click={props.onClick} />
}

// Class component
@RegisterClass("MyComponent")
class MyComponent extends Component<{ count: Property<number> }> {
  render(props, context) {
    return (
      <frame caption="Counter">
        <label caption={props.count.map(funcRef(x => `Count: ${x}`))} />
      </frame>
    )
  }
}

// Render
const element = render(<MyButton caption="Click me" onClick={funcRef(handleClick)} />, parent)

// Named rendering (replaces existing)
renderNamed(<MyComponent count={countProperty} />, parent, "my-gui")

// Cleanup
destroy(element) // Automatically closes subscriptions
```

### Built-in Components

```tsx
// Dialog
showDialog(player, {
  title: "Confirm",
  message: ["Are you sure?"],
  backCaption: "Cancel",
  confirmCaption: "OK",
  onConfirm: funcRef(() => game.print("Confirmed"))
})

// Title bar with close button
<SimpleTitleBar title="My Window" />

// Conditional rendering
<If condition={isVisibleProperty} then={funcRef(() => <label caption="Visible!" />)} />

// Dynamic content from property
<Fn uses="flow" from={itemsProperty} map={funcRef((items) =>
  items.map(item => <label caption={item.name} />)
)} />

// Layout helpers
<flow>
  <label caption="Left" />
  <HorizontalPusher />
  <label caption="Right" />
</flow>
```

### TSX Configuration

In `tsconfig.json`:
```json
{
  "compilerOptions": {
    "jsx": "react",
    "jsxFactory": "FactorioJsx.createElement",
    "jsxFragmentFactory": "FactorioJsx.Fragment"
  }
}
```

### Dependencies

- Event system (Property, Subscription)
- References system (Func, RegisterClass, bind, ibind)
- `src/lib/Events.ts` - For event registration
- `src/lib/migration.ts` - For GUI cleanup on migration
- `src/lib/player-init.ts` - For player GUI storage

### Build Scripts

```bash
npm run build:gui-specs  # Generates propInfo.json from Factorio API
```

### Usage Notes

- Properties in element props automatically create subscriptions
- `styleMod` allows reactive style properties
- `onCreate` callback receives the created LuaGuiElement
- Subscriptions are automatically cleaned up when elements are destroyed
- Component instances can be retrieved via `getComponentInstance(element)`

---

## 4. Geometry Utilities

**Purpose:** Immutable position and bounding box manipulation with a clean API using metatables.

### Features

- **Position (Pos)** - 2D vector operations
- **BoundingBox (BBox)** - Rectangle operations

### Key Files

- `src/lib/geometry/position.ts` - Position utilities
- `src/lib/geometry/bounding-box.ts` - BoundingBox utilities
- `src/lib/geometry/index.ts` - Exports

### Core API

```typescript
// Position
const pos = Pos(10, 20)
const moved = pos.plus(Pos(5, 5))
const rotated = pos.rotateAboutOrigin(defines.direction.east)
const distance = pos.length()

// BoundingBox
const box = BBox.coords(0, 0, 10, 10)
const expanded = box.expand(5)
const center = box.center()
const translated = box.translate(Pos(10, 0))
const contains = box.contains(Pos(5, 5))

// Iteration
for (const [x, y] of box.iterateTiles()) {
  // Process each tile
}
```

### Dependencies

- `src/lib/_util.ts` - For WithMetatable type
- Factorio `util` module (for positiontostr)

### Usage Notes

- All operations return new instances (immutable)
- Methods are available on instances via metatable
- `normalize()` converts from Factorio array format
- `load()` sets metatable on existing objects without copying

---

## 5. Events Registration

**Purpose:** Enhanced Factorio event registration with better error handling and type safety.

### Features

- Type-safe event handlers
- Multiple handlers per event
- Fake event raising for testing
- Early registration option
- Protected event variants with error handling

### Key Files

- `src/lib/Events.ts` - Core event registration
- `src/lib/ProtectedEvents.ts` - Wrapped with error protection

### Core API

```typescript
// Register single event
Events.on(defines.events.on_built_entity, (e) => {
  game.print(`Built: ${e.entity.name}`)
})

// Register multiple events
Events.onAll({
  on_init: () => game.print("Initialized"),
  on_player_created: (e) => game.print(`Player ${e.player_index} joined`)
})

// Custom input
Events.on("my-custom-input", (e) => {
  game.print("Custom input triggered")
})

// Shorthand
Events.on_tick(() => {
  // Runs every tick
})

// Protected events (errors caught and reported)
ProtectedEvents.on(defines.events.on_gui_click, (e) => {
  // Errors here won't crash the game
})

// Testing
Events.raiseFakeEvent(defines.events.on_built_entity, {
  entity: myEntity,
  player_index: 1
})
```

### Dependencies

- `src/lib/_util.ts` - For PRecord type

### Usage Notes

- `Events` - Raw event registration
- `ProtectedEvents` - Wraps handlers with error catching (recommended for UI)
- `onInitOrLoad` - Runs callback on both on_init and on_load
- Can register multiple handlers for the same event (called in order)

---

## 6. Migration Framework

**Purpose:** Version-based migration system for updating mod data structures across versions.

### Features

- Version-based migration triggers
- Priority-based execution order
- `since()` - Runs on init and migrations
- `fromAny()` - Runs on any migration

### Key Files

- `src/lib/migration.ts` - Migration framework

### Core API

```typescript
// Run on migration to version
Migrations.to("2.0.0", () => {
  // Migrate data structures
  for (const [, data] of pairs(storage.projects)) {
    data.newField = "default"
  }
})

// Run early (before normal migrations)
Migrations.early("2.1.0", () => {
  // Critical migration
})

// Run on init AND migration to version
Migrations.since("2.0.0", () => {
  // Initialize new features
})

// Run on any migration
Migrations.fromAny(() => {
  // Cleanup or validation
})

// Custom priority
Migrations.priority(5, "2.0.0", () => {
  // Priority 5 (default is 9)
})

// Setup hook
Migrations.setMigrationsHook()
```

### Dependencies

- `src/lib/Events.ts` - For on_configuration_changed

### Usage Notes

- Version strings are normalized to XX.XX.XX format
- Execution order: priority → version → registration order
- Lower priority numbers run first (8 = early, 9 = normal)
- Must call `setMigrationsHook()` during load

---

## 7. Task System

**Purpose:** Framework for long-running tasks that need to be split across multiple ticks to avoid game freezes.

### Features

- Multi-tick task execution with progress
- Visual progress UI
- Cancellation support
- Base classes for common patterns

### Key Files

- `src/lib/task.tsx` - Task system and UI

### Core API

```typescript
// Implement Task interface
class MyTask implements Task {
  getTitle() { return "Processing..." }
  step() { /* Do one unit of work */ }
  isDone() { return this.finished }
  cancel() { /* Cleanup */ }
  getNextStepTitle() { return "Step 5/10" }
  getProgress() { return 0.5 } // 0-1, or nil for indeterminate
}

// Or extend base classes
class LoopTaskExample extends LoopTask {
  constructor() { super(100) } // 100 steps
  getTitle() { return "Processing items" }
  protected doStep(i: number) {
    // Process item i
  }
  protected getTitleForStep(step: number) {
    return `Item ${step + 1}/100`
  }
}

class ItemsTaskExample extends EnumeratedItemsTask<Entity> {
  constructor(entities: Entity[]) { super(entities) }
  getTitle() { return "Updating entities" }
  protected doTask(entity: Entity) {
    // Update entity
  }
  protected getTitleForTask(entity: Entity) {
    return entity.name
  }
}

// Submit task (automatically creates GUI)
submitTask(new MyTask())

// Run entire task immediately (when paused)
runEntireTask(new MyTask())

// Cancel current task
cancelCurrentTask()
```

### Dependencies

- FactorioJSX framework
- `src/lib/references.ts`
- `src/lib/protected-action.ts`

### Usage Notes

- Tasks run one `step()` per tick
- Progress UI shown automatically (unless game is paused)
- User can cancel via GUI
- Use `LoopTask` or `EnumeratedItemsTask` for simple iterations

---

## 8. Registry

**Purpose:** Generic registry for storing and retrieving items by string name with validation.

### Key Files

- `src/lib/registry.ts`

### Core API

```typescript
const myRegistry = new Registry<MyType>(
  "MyItem",
  (item) => `debug description of ${item}`
)

// Register (must be done during script load, before game starts)
myRegistry.registerAs("my-item", itemInstance)

// Retrieve
const item = myRegistry.get("my-item") // Throws if not found
const name = myRegistry.nameOf(itemInstance) // Throws if not registered
```

### Dependencies

- `src/lib/_util.ts` - For PRecord

### Usage Notes

- Registration must happen during script load phase
- Throws errors for duplicate names or unregistered items
- Used internally by references system

---

### Usage Notes

- Automatically registers handlers for all four selection event types
- Events are protected (errors caught)
- Handlers are keyed by prototype name

---

## 11. Player Initialization

**Purpose:** Unified system for initializing player data on both mod init and player creation.

### Key Files

- `src/lib/player-init.ts`

### Core API

```typescript
// Run on player init (both on_init for existing players and on_player_created)
onPlayerInit((playerIndex) => {
  storage.players[playerIndex].myData = { count: 0 }
})

// Run on player init for version migrations
onPlayerInitSince("2.0.0", (playerIndex) => {
  storage.players[playerIndex].newFeature = true
})

// Player removal
onPlayerRemoved((playerIndex) => {
  // Cleanup player data
})
```

### Dependencies

- `src/lib/Events.ts`
- `src/lib/migration.ts`

### Usage Notes

- Automatically sets up `storage.players` table
- Each player gets a `PlayerData` entry
- `onPlayerInitSince` runs migration for all players on version upgrade

---

## 12. Protected Actions

**Purpose:** Execute functions with automatic error catching and user-friendly error reporting.

### Key Files

- `src/lib/protected-action.ts`

### Core API

```typescript
// Protect a function call
const result = protectedAction(() => {
  // Code that might throw
  return someValue
})
// Returns result or nil if error occurred

// With arguments
protectedAction((entity, player) => {
  entity.destroy()
}, myEntity, myPlayer)
```

### Dependencies

- Locale for error messages

### Usage Notes

- Logs full stack trace
- Shows user-friendly message to players via `game.print()`
- Returns `nil` on error
- Used internally by ProtectedEvents and task system

---

## Build Scripts

Several features require build scripts to generate code or compile plugins:

### Required Scripts

Add to `package.json`:

```json
{
  "scripts": {
    "build:locale": "tsx scripts/gen-locale-defs.ts",
    "build:gui-specs": "tsx scripts/gen-gui-specs.ts",
    "build:tstlPlugin": "tsc -p tstlPlugin/tsconfig.json",
    "build:scripts": "conc \"npm:build:locale\" \"npm:build:gui-specs\" \"npm:build:tstlPlugin\""
  }
}
```

### Script Purposes

1. **build:locale** - Generates `locale.d.ts` from locale files
   - Required if using localized strings
   - Run when locale files change

2. **build:gui-specs** - Generates `propInfo.json` for FactorioJSX
   - Required for FactorioJSX framework
   - Analyzes Factorio API to determine which props are spec vs element properties
   - Run when Factorio version updates

3. **build:tstlPlugin** - Compiles the TSTL plugin
   - Required for references system (`ibind`, `@beforeImports`)
   - Must be built before main TypeScript compilation

### Typical Build Order

```bash
npm run build:scripts  # Build all support scripts
tstl                   # Compile TypeScript to Lua
```

---

### License Compliance

All files are LGPL-3.0-or-later. When extracting:
- Preserve copyright headers
- Include COPYING and COPYING.LESSER files
- Any modifications must also be LGPL-3.0-or-later
- Can be used in proprietary mods (LGPL allows this for libraries)

---

## Summary

The `/src/lib` directory provides a comprehensive toolkit for Factorio mod development with TypeScript:

- **Reactive Programming:** Event/Property system for data flow
- **UI Framework:** FactorioJSX for declarative GUI construction
- **Type Safety:** Strong typing throughout with TSTL compatibility
- **Error Handling:** Protected actions and events for reliability
- **Testing Support:** Event raising, task execution controls
- **Performance:** Lazy loading, automatic subscription cleanup
- **Maintainability:** Migration framework, registry pattern

Most features are designed to be independently usable with minimal dependencies.
