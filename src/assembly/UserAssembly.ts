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

import { StageNumber } from "../entity/AssemblyEntity"
import { newEntityMap } from "../entity/EntityMap"
import {
  bind,
  Event,
  Events,
  globalEvent,
  Mutable,
  MutableState,
  nilIfEmpty,
  RegisterClass,
  state,
  State,
} from "../lib"
import { BBox } from "../lib/geometry"
import { Migrations } from "../lib/migration"
import { L_Bp100 } from "../locale"
import {
  AssemblyBlueprintSettings,
  AssemblyId,
  BlueprintNameMode,
  BookNameMode,
  GlobalAssemblyEvent,
  LocalAssemblyEvent,
  Stage,
  UserAssembly,
} from "./AssemblyDef"
import { editBlueprintSettings } from "./edit-blueprint-settings"
import { createStageSurface, prepareArea } from "./surfaces"
import {
  BlueprintSettings,
  BlueprintTransformations,
  getDefaultBlueprintSettings,
  tryTakeBlueprintWithSettings,
} from "./take-blueprint"
import { AutoSetTilesType, setTiles } from "./tiles"

declare const global: {
  nextAssemblyId: AssemblyId
  assemblies: LuaMap<AssemblyId, UserAssemblyImpl>
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
class UserAssemblyImpl implements UserAssembly {
  name: MutableState<string>
  displayName: State<LocalisedString>

  content = newEntityMap()
  localEvents = new Event<LocalAssemblyEvent>()

  assemblyBlueprintSettings: AssemblyBlueprintSettings = {
    autoLandfill: state(false),
    useNextStageTiles: state(false),
    blueprintNameMode: state(BlueprintNameMode.FromStage),
    bookNameMode: state(BookNameMode.FromAssembly),

    entityFilters: state(nil),
    entityFilterMode: state(nil),
    replaceInfinityWithCombinators: state(false),
  }

  valid = true

  private readonly stages: Record<number, StageImpl> = {}

  constructor(readonly id: AssemblyId, name: string, initialNumStages: number) {
    this.name = state(name)
    this.displayName = this.name.map(bind(UserAssemblyImpl.getDisplayName, id))
    this.stages = {}
    for (const i of $range(1, initialNumStages)) {
      this.stages[i] = StageImpl.create(this, i, `<Stage ${i}>`)
    }
  }
  private static getDisplayName(this: void, id: AssemblyId, name: string): LocalisedString {
    return name != "" ? name : [L_Bp100.UnnamedAssembly, id]
  }

  static create(name: string, initialNumStages: number): UserAssemblyImpl {
    const assembly = new UserAssemblyImpl(global.nextAssemblyId++ as AssemblyId, name, initialNumStages)
    UserAssemblyImpl.onAssemblyCreated(assembly)

    return assembly
  }

  getSurface(stageNum: StageNumber): LuaSurface | nil {
    const stage = this.stages[stageNum]
    return stage && stage.surface
  }
  getStage(stageNumber: StageNumber): Stage | nil {
    return this.stages[stageNumber]
  }
  maxStage(): number {
    return luaLength(this.stages)
  }

  getAllStages(): readonly Stage[] {
    return this.stages as unknown as readonly Stage[]
  }
  getStageName(stageNumber: StageNumber): LocalisedString {
    return this.stages[stageNumber].name.get()
  }

  insertStage(index: StageNumber): Stage {
    this.assertValid()
    assert(index >= 1 && index <= this.maxStage() + 1, "Invalid new stage number")

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
    assert(stage != nil, "invalid stage number")
    if (this.maxStage() == 1) {
      this.delete()
      return
    }

    this.raiseEvent({ type: "pre-stage-deleted", assembly: this, stage })

    stage._doDelete()
    table.remove(this.stages as unknown as Stage[], index)
    // update stages
    for (const i of $range(index, this.maxStage())) {
      this.stages[i].stageNumber = i
    }
    this.content.deleteStage(index)

    this.raiseEvent({ type: "stage-deleted", assembly: this, stage })
  }

  public makeBlueprintBook(stack: LuaItemStack): boolean {
    const bbox = this.content.computeBoundingBox()
    if (!bbox) return false

    stack.clear()
    stack.set_stack("blueprint-book")
    const { useNextStageTiles, bookNameMode } = this.assemblyBlueprintSettings
    if (bookNameMode.get() == BookNameMode.FromAssembly) {
      stack.label = this.name.get()
    } else {
      stack.label = ""
    }

    const inventory = stack.get_inventory(defines.inventory.item_main)!
    assert(inventory, "Failed to get blueprint book inventory")

    for (const [, stage] of ipairs(this.stages)) {
      const nInserted = inventory.insert("blueprint")
      assert(nInserted == 1, "Failed to insert blueprint into blueprint book")
      const stack = inventory[inventory.length - 1]!
      if (!stage.doTakeBlueprint(stack, bbox)) stack.clear()
    }

    if (useNextStageTiles.get()) {
      for (const i of $range(1, inventory.length - 1)) {
        const blueprint = inventory[i - 1]
        const nextBlueprint = inventory[i]
        blueprint.set_blueprint_tiles(nextBlueprint.get_blueprint_tiles()!)
      }
    }

    return true
  }

  syncGridSettings(): void {
    const lastStageSettings = this.stages[this.maxStage()].getBlueprintSettings()
    for (const i of $range(1, this.maxStage() - 1)) {
      const stageSettings = this.stages[i].getBlueprintSettings()
      stageSettings.snapToGrid = lastStageSettings.snapToGrid
      stageSettings.positionOffset = lastStageSettings.positionOffset
      stageSettings.positionRelativeToGrid = lastStageSettings.positionRelativeToGrid
      stageSettings.absoluteSnapping = lastStageSettings.absoluteSnapping
    }
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
  }

  private getNewStageName(): string {
    let subName = ""
    for (let i = 1; ; i++) {
      const name = `<New stage>${subName}`
      if ((this.stages as unknown as Stage[]).some((stage) => stage.name.get() == name)) {
        subName = ` (${i})`
      } else {
        return name
      }
    }
  }

  private raiseEvent(event: LocalAssemblyEvent): void {
    // local first, more useful event order
    this.localEvents.raise(event)
    GlobalAssemblyEvents.raise(event)
  }
  private assertValid(): void {
    if (!this.valid) error("Assembly is invalid")
  }
  static onAssemblyCreated(assembly: UserAssemblyImpl): void {
    global.assemblies.set(assembly.id, assembly)
    GlobalAssemblyEvents.raise({ type: "assembly-created", assembly })
  }
}

export function createUserAssembly(name: string, initialNumStages: number): UserAssembly {
  return UserAssemblyImpl.create(name, initialNumStages)
}

export function _deleteAllAssemblies(): void {
  for (const [, assembly] of global.assemblies) {
    assembly.delete()
  }
  global.nextAssemblyId = 1 as AssemblyId
}

const initialPreparedArea = BBox.around({ x: 0, y: 0 }, script.active_mods.debugadapter != nil ? 32 : 5 * 32)

@RegisterClass("Stage")
class StageImpl implements Stage {
  name: MutableState<string>
  readonly valid = true

  readonly surfaceIndex: SurfaceIndex

  public blueprintSettings: BlueprintSettings = getDefaultBlueprintSettings()
  public constructor(
    public readonly assembly: UserAssemblyImpl,
    public readonly surface: LuaSurface,
    public stageNumber: StageNumber,
    name: string,
  ) {
    this.name = state(name)
    this.surfaceIndex = surface.index
    if (assembly.id != 0) global.surfaceIndexToStage.set(this.surfaceIndex, this)
  }

  static create(assembly: UserAssemblyImpl, stageNumber: StageNumber, name: string): StageImpl {
    const surface = createStageSurface()
    prepareArea(surface, initialPreparedArea)
    return new StageImpl(assembly, surface, stageNumber, name)
  }

  public getBlueprintSettings(): BlueprintSettings {
    return this.blueprintSettings
  }

  takeBlueprint(stack: LuaItemStack): boolean {
    const bbox = this.assembly.content.computeBoundingBox()
    if (!bbox) return false
    return this.doTakeBlueprint(stack, bbox)
  }

  doTakeBlueprint(stack: LuaItemStack, bbox: BBox): boolean {
    if (this.assembly.assemblyBlueprintSettings.autoLandfill.get()) {
      this.autoSetTiles(AutoSetTilesType.LandfillAndLabTiles)
    }
    const took = tryTakeBlueprintWithSettings(
      stack,
      this.getBlueprintSettings(),

      this.assembly.assemblyBlueprintSettings,
      this.surface,
      bbox,
    )
    if (took) {
      const blueprintNameMode = this.assembly.assemblyBlueprintSettings.blueprintNameMode.get()
      if (blueprintNameMode == BlueprintNameMode.Empty) {
        stack.label = ""
      } else if (blueprintNameMode == BlueprintNameMode.FromStage) {
        stack.label = this.name.get()
      }
      // else, use the custom name from tryTakeBlueprintWithSettings
    }
    return took
  }

  editBlueprint(player: LuaPlayer): boolean {
    const bbox = this.assembly.content.computeBoundingBox()
    if (!bbox) return false
    return (
      editBlueprintSettings(
        player,
        this.getBlueprintSettings(),
        this.assembly.assemblyBlueprintSettings,
        this.surface,
        bbox,
      ) != nil
    )
  }

  autoSetTiles(tiles: AutoSetTilesType): boolean {
    const bbox = this.assembly.content.computeBoundingBox() ?? BBox.coords(-20, -20, 20, 20)
    return setTiles(this.surface, bbox, tiles)
  }

  deleteInAssembly(): void {
    if (!this.valid) return
    this.assembly.deleteStage(this.stageNumber)
  }

  _doDelete(): void {
    if (!this.valid) return
    ;(this as Mutable<Stage>).valid = false
    global.surfaceIndexToStage.delete(this.surfaceIndex)
    if (this.surface.valid) game.delete_surface(this.surface)
  }
}

export function exportBlueprintBookToFile(player: LuaPlayer, assembly: UserAssembly): string | nil {
  const inventory = game.create_inventory(1)
  const stack = inventory[0]!
  if (!assembly.makeBlueprintBook(stack)) {
    inventory.destroy()
    return nil
  }
  const data = stack.export_stack()
  const filename = `staged-builds/${assembly.name.get() ?? "Unnamed-Assembly-" + assembly.id}.txt`
  game.write_file(filename, data, false, player.index)
  inventory.destroy()
  return filename
}

export function getStageAtSurface(surfaceIndex: SurfaceIndex): Stage | nil {
  return global.surfaceIndexToStage.get(surfaceIndex)
}

Events.on_pre_surface_deleted((e) => {
  const stage = getStageAtSurface(e.surface_index)
  if (stage != nil) stage.deleteInAssembly()
})

// Migrations.to("0.2.1", () => {
//   for (const [, assembly] of global.assemblies) {
//     assembly.playerData = {}
//   }
// })
// removed in 0.9.0
Migrations.to("0.5.0", () => {
  for (const [, assembly] of global.assemblies) {
    interface OldAssembly {
      blueprintBookSettings: {
        autoLandfill: MutableState<boolean>
      }
    }

    ;(assembly as unknown as OldAssembly).blueprintBookSettings = {
      autoLandfill: state(false),
      // useNextStageTiles: state(false),
    }
  }
})
Migrations.to("0.8.0", () => {
  for (const [, assembly] of global.assemblies) {
    interface OldAssembly {
      blueprintBookSettings?: {
        autoLandfill: MutableState<boolean>
      }
    }
    log("Migrating assembly")
    const bpBookSettings = (assembly as unknown as OldAssembly).blueprintBookSettings!
    delete (assembly as unknown as OldAssembly).blueprintBookSettings
    assembly.assemblyBlueprintSettings = {
      autoLandfill: bpBookSettings.autoLandfill,
      useNextStageTiles: state(bpBookSettings.autoLandfill.get()),
      blueprintNameMode: state(BlueprintNameMode.FromStage),
      bookNameMode: state(BookNameMode.FromAssembly),
    } as AssemblyBlueprintSettings

    type OldBlueprintSettings = Pick<
      BlueprintSettings,
      "snapToGrid" | "positionOffset" | "positionRelativeToGrid" | "absoluteSnapping"
    >
    interface OldAssembly {
      blueprintInventory?: LuaInventory
      blueprintSettings?: OldBlueprintSettings
    }
    const oldAssembly = assembly as unknown as OldAssembly

    interface OldStage {
      blueprintStack?: LuaItemStack
    }

    const bpSettings = oldAssembly.blueprintSettings ?? getDefaultBlueprintSettings()
    for (const stage of assembly.getAllStages() as StageImpl[]) {
      const oldIcons = (stage as unknown as OldStage).blueprintStack?.blueprint_icons
      stage.blueprintSettings = {
        ...bpSettings,
        name: stage.name.get(),
        icons: oldIcons && nilIfEmpty(oldIcons),
      }
    }
    delete oldAssembly.blueprintSettings
    if (oldAssembly.blueprintInventory) {
      oldAssembly.blueprintInventory.destroy()
      oldAssembly.blueprintInventory = nil
      for (const stage of assembly.getAllStages() as StageImpl[]) {
        ;(stage as unknown as OldStage).blueprintStack = nil
      }
    }
  }
})
// player data migrated in 0.9.0, from ui/player-assembly-data.ts

// new format in 0.12.0
// Migrations.to("0.11.0", () => {
//   blueprint filters added to assembly settings
//   for (const [, assembly] of global.assemblies) {
//      assembly.assemblyBlueprintSettings.transformations = {}
//   }
// })

Migrations.to("0.12.0", () => {
  interface OldAssemblySettings {
    transformations?: {
      readonly entityFilters?: LuaSet<string>
      readonly entityFilterMode?: defines.deconstruction_item.entity_filter_mode
      readonly replaceInfinityWithCombinators?: boolean
    }
  }
  for (const [, assembly] of global.assemblies) {
    const settings = assembly.assemblyBlueprintSettings as OldAssemblySettings & Mutable<BlueprintTransformations>
    if (settings.transformations) {
      const { entityFilters, entityFilterMode, replaceInfinityWithCombinators } = settings.transformations
      settings.entityFilters = state(entityFilters)
      settings.entityFilterMode = state(entityFilterMode)
      settings.replaceInfinityWithCombinators = state(replaceInfinityWithCombinators ?? false)
      delete settings.transformations
    } else {
      settings.entityFilters = state(nil)
      settings.entityFilterMode = state(nil)
      settings.replaceInfinityWithCombinators = state(false)
    }
  }
})
