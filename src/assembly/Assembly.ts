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

import { StageNumber } from "../entity/AssemblyEntity"
import { bind, Event, Events, globalEvent, Mutable, MutableState, PRecord, RegisterClass, state, State } from "../lib"
import { BBox, Position } from "../lib/geometry"
import { Migrations } from "../lib/migration"
import { L_Bp100 } from "../locale"
import { Assembly, AssemblyId, GlobalAssemblyEvent, LocalAssemblyEvent, Stage } from "./AssemblyDef"
import {
  BlueprintSettings,
  editBlueprintSettings,
  getDefaultBlueprintSettings,
  tryTakeBlueprintWithSettings,
} from "./blueprint-take"
import { newEntityMap } from "./EntityMap"
import { createStageSurface, prepareArea } from "./surfaces"

declare const global: {
  nextAssemblyId: AssemblyId
  assemblies: LuaMap<AssemblyId, AssemblyImpl>
  surfaceIndexToStage: LuaMap<SurfaceIndex, StageImpl>
}
Events.on_init(() => {
  global.nextAssemblyId = 1 as AssemblyId
  global.assemblies = new LuaMap()
  global.surfaceIndexToStage = new LuaMap()
})

const GlobalAssemblyEvents = globalEvent<GlobalAssemblyEvent>()
export { GlobalAssemblyEvents as AssemblyEvents }

declare const luaLength: LuaLength<Record<number, any>, number>

@RegisterClass("Assembly")
class AssemblyImpl implements Assembly {
  name: MutableState<string>
  displayName: State<LocalisedString>

  content = newEntityMap()
  localEvents = new Event<LocalAssemblyEvent>()

  lastPlayerPosition: PRecord<
    PlayerIndex,
    {
      stageNumber: StageNumber
      position: Position
    }
  > = {}

  blueprintInventory?: LuaInventory
  private blueprintSettings?: BlueprintSettings

  valid = true

  private readonly stages: Record<number, StageImpl> = {}

  constructor(readonly id: AssemblyId, name: string, initialNumStages: number) {
    this.name = state(name)
    this.displayName = this.name.map(bind(AssemblyImpl.getDisplayName, id))
    this.stages = {}
    for (const i of $range(1, initialNumStages)) {
      this.stages[i] = StageImpl.create(this, i, `<Stage ${i}>`)
    }
  }
  private static getDisplayName(this: void, id: AssemblyId, name: string): LocalisedString {
    return name !== "" ? name : [L_Bp100.UnnamedAssembly, id]
  }

  static create(name: string, initialNumStages: number): AssemblyImpl {
    const assembly = new AssemblyImpl(global.nextAssemblyId++ as AssemblyId, name, initialNumStages)
    AssemblyImpl.onAssemblyCreated(assembly)

    return assembly
  }

  getStage(stageNumber: StageNumber): Stage | nil {
    return this.stages[stageNumber]
  }
  numStages(): number {
    return luaLength(this.stages)
  }
  iterateStages(start?: StageNumber, end?: StageNumber): LuaIterable<LuaMultiReturn<[StageNumber, Stage]>>
  iterateStages(start: StageNumber = 1, end: StageNumber = this.numStages()): any {
    function next(stages: Stage[], i: number) {
      if (i >= end) return
      i++
      return $multi(i, stages[i - 1])
    }
    return $multi(next, this.stages, start - 1)
  }

  getAllStages(): readonly Stage[] {
    return this.stages as unknown as readonly Stage[]
  }
  getStageName(stageNumber: StageNumber): LocalisedString {
    return this.stages[stageNumber].name.get()
  }

  insertStage(index: StageNumber): Stage {
    this.assertValid()
    assert(index >= 1 && index <= this.numStages() + 1, "Invalid new stage number")

    const newStage = StageImpl.create(this, index, this.getNewStageName())
    table.insert(this.stages as unknown as Stage[], index, newStage)
    // update stages
    for (const i of $range(index, luaLength(this.stages))) {
      this.stages[i].stageNumber = i
    }
    this.content.insertStage(index)

    this.raiseEvent({ type: "stage-added", assembly: this, stage: newStage })
    return newStage
  }

  deleteStage(index: StageNumber): void {
    this.assertValid()
    const stage = this.stages[index]
    assert(stage !== nil, "invalid stage number")
    if (this.numStages() === 1) {
      this.delete()
      return
    }

    this.raiseEvent({ type: "pre-stage-deleted", assembly: this, stage })

    stage._doDelete()
    table.remove(this.stages as unknown as Stage[], index)
    // update stages
    for (const i of $range(index, this.numStages())) {
      this.stages[i].stageNumber = i
    }
    this.content.deleteStage(index)

    this.raiseEvent({ type: "stage-deleted", assembly: this, stage })
  }

  delete() {
    if (!this.valid) return
    global.assemblies.delete(this.id)
    this.valid = false
    for (const [, stage] of pairs(this.stages)) {
      stage._doDelete()
    }
    this.raiseEvent({ type: "assembly-deleted", assembly: this })
    this.localEvents.closeAll()
    this.blueprintInventory?.destroy()
  }

  getNewBlueprintInventoryStack(): LuaItemStack {
    if (this.blueprintInventory === nil) {
      this.blueprintInventory = game.create_inventory(8)
    }
    let [stack] = this.blueprintInventory.find_empty_stack()
    if (!stack) {
      this.blueprintInventory.resize(this.blueprintInventory.length * 2)
      ;[stack] = this.blueprintInventory.find_empty_stack()
      assert(stack, "Failed to find empty stack")
    }
    stack!.set_stack("blueprint")
    return stack!
  }

  getBlueprintSettings(): BlueprintSettings {
    return (this.blueprintSettings ??= getDefaultBlueprintSettings())
  }

  public makeBlueprintBook(stack: LuaItemStack): void {
    stack.clear()
    stack.set_stack("blueprint-book")
    stack.label = this.name.get()

    const inventory = stack.get_inventory(defines.inventory.item_main)!
    assert(inventory, "Failed to get blueprint book inventory")

    for (const [, stage] of ipairs(this.stages)) {
      const blueprint = stage.takeBlueprint()
      if (blueprint) inventory.insert(blueprint)
    }
  }

  private getNewStageName(): string {
    let subName = ""
    for (let i = 1; ; i++) {
      const name = `<New stage>${subName}`
      if ((this.stages as unknown as Stage[]).some((stage) => stage.name.get() === name)) {
        subName = ` (${i})`
      } else {
        return name
      }
    }
  }
  static onAssemblyCreated(assembly: AssemblyImpl): void {
    global.assemblies.set(assembly.id, assembly)
    GlobalAssemblyEvents.raise({ type: "assembly-created", assembly })
  }
  private raiseEvent(event: LocalAssemblyEvent): void {
    // local first, more useful event order
    this.localEvents.raise(event)
    GlobalAssemblyEvents.raise(event)
  }
  private assertValid(): void {
    if (!this.valid) error("Assembly is invalid")
  }
}

export function createAssembly(name: string, initialNumStages: number): Assembly {
  return AssemblyImpl.create(name, initialNumStages)
}

export function _deleteAllAssemblies(): void {
  for (const [, assembly] of global.assemblies) {
    assembly.delete()
  }
  global.nextAssemblyId = 1 as AssemblyId
}

const initialPreparedArea = BBox.around({ x: 0, y: 0 }, 5 * 32)

@RegisterClass("Stage")
class StageImpl implements Stage {
  name: MutableState<string>
  readonly valid = true

  readonly surfaceIndex: SurfaceIndex
  blueprintStack?: LuaItemStack

  public constructor(
    public readonly assembly: AssemblyImpl,
    public readonly surface: LuaSurface,
    public stageNumber: StageNumber,
    name: string,
  ) {
    this.name = state(name)
    this.surfaceIndex = surface.index
    if (assembly.id !== 0) global.surfaceIndexToStage.set(this.surfaceIndex, this)
  }

  static create(assembly: AssemblyImpl, stageNumber: StageNumber, name: string): StageImpl {
    const surface = createStageSurface()
    prepareArea(surface, initialPreparedArea)
    return new StageImpl(assembly, surface, stageNumber, name)
  }

  takeBlueprint(): BlueprintItemStack | nil {
    const stack = (this.blueprintStack ??= this.assembly.getNewBlueprintInventoryStack())
    const takeSuccessful = tryTakeBlueprintWithSettings(stack, this.assembly.getBlueprintSettings(), this.surface)
    if (!takeSuccessful) return nil
    stack.label = this.name.get()
    return stack
  }

  editBlueprint(player: LuaPlayer): boolean {
    const blueprint = this.takeBlueprint()
    if (blueprint === nil) return false
    editBlueprintSettings(player, blueprint, this.assembly.getBlueprintSettings())
    return true
  }

  public deleteInAssembly(): void {
    if (!this.valid) return
    this.assembly.deleteStage(this.stageNumber)
  }

  _doDelete(): void {
    if (!this.valid) return
    ;(this as Mutable<Stage>).valid = false
    global.surfaceIndexToStage.delete(this.surfaceIndex)
    if (this.surface.valid) game.delete_surface(this.surface)
    if (this.blueprintStack) this.blueprintStack.clear()
  }
}

export function getStageAtSurface(surfaceIndex: SurfaceIndex): Stage | nil {
  return global.surfaceIndexToStage.get(surfaceIndex)
}

Events.on_pre_surface_deleted((e) => {
  const stage = getStageAtSurface(e.surface_index)
  if (stage !== nil) stage.deleteInAssembly()
})

Migrations.to("0.2.1", () => {
  for (const [, assembly] of global.assemblies) {
    assembly.lastPlayerPosition = {}
  }
})
