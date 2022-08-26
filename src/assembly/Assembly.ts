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
import { bind, Events, RegisterClass, registerFunctions } from "../lib"
import { BBox, Pos, Position } from "../lib/geometry"
import { Event, MutableState, State, state } from "../lib/observable"
import { globalEvent } from "../lib/observable/GlobalEvent"
import { WorldArea } from "../lib/world-area"
import { L_Assembly } from "../locale"
import { Assembly, AssemblyId, GlobalAssemblyEvent, LocalAssemblyEvent, Stage } from "./AssemblyDef"
import { newEntityMap } from "./EntityMap"
import { generateAssemblySurfaces, getAssemblySurface, getOrGenerateAssemblySurface, prepareArea } from "./surfaces"
import floor = math.floor

declare const global: {
  nextAssemblyId: AssemblyId
  assemblies: LuaMap<AssemblyId, AssemblyImpl>
}
Events.on_init(() => {
  global.nextAssemblyId = 1 as AssemblyId
  global.assemblies = new LuaMap()
})

const GlobalAssemblyEvents = globalEvent<GlobalAssemblyEvent>()
export { GlobalAssemblyEvents as AssemblyEvents }

declare const luaLength: LuaLength<Record<number, any>, number>

@RegisterClass("Assembly")
class AssemblyImpl implements Assembly {
  name = state("")
  displayName: State<LocalisedString>

  content = newEntityMap()
  localEvents = new Event<LocalAssemblyEvent>()

  valid = true

  private readonly stages: Record<number, StageImpl>
  private readonly surfaceIndexToStageNumber = new LuaMap<SurfaceIndex, StageNumber>()

  protected constructor(readonly id: AssemblyId, readonly bbox: BBox, initialStagePositions: readonly WorldArea[]) {
    this.displayName = this.name.map(bind(getDisplayName, L_Assembly.UnnamedAssembly, id))
    this.stages = initialStagePositions.map(
      (area, i) => new StageImpl(this, i + 1, area.surface, area.bbox, `<Stage ${i + 1}>`),
    )
    for (const [number, stage] of pairs(this.stages)) {
      this.surfaceIndexToStageNumber.set(stage.surface.index, number)
    }
  }

  static create(bbox: BBox, surfaces: readonly LuaSurface[]): AssemblyImpl {
    const assembly = new AssemblyImpl(
      global.nextAssemblyId++ as AssemblyId,
      bbox,
      surfaces.map((surface) => ({ surface, bbox })),
    )
    AssemblyImpl.onAssemblyCreated(assembly)

    return assembly
  }

  getStage(stageNumber: StageNumber): Stage | nil {
    return this.stages[stageNumber]
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getStageAt(surface: LuaSurface, _position: Position): Stage | nil {
    const stageNum = this.surfaceIndexToStageNumber.get(surface.index)
    if (stageNum === nil) return nil
    return this.stages[stageNum]
  }

  insertStage(index: StageNumber): Stage {
    this.assertValid()
    assert(index >= 1 && index <= this.numStages() + 1, "Invalid new stage number")

    const surface = this.findNewStageSurface()

    const newStage = new StageImpl(this, index, surface, this.bbox, this.createNewStageName())
    table.insert(this.stages as unknown as Stage[], index, newStage)
    // update stages
    for (const i of $range(index, luaLength(this.stages))) {
      const stage = this.stages[i]
      stage.stageNumber = i
      this.surfaceIndexToStageNumber.set(stage.surface.index, i)
    }

    this.content.insertStage(index)

    this.raiseEvent({ type: "stage-added", assembly: this, stage: newStage })
    return newStage
  }
  private findNewStageSurface(): LuaSurface {
    for (let i = 1; ; i++) {
      const surface: LuaSurface = getOrGenerateAssemblySurface(i)
      if (!this.surfaceIndexToStageNumber.has(surface.index)) {
        prepareArea(surface, this.bbox)
        return surface
      }
    }
  }
  public deleteStage(index: StageNumber): Stage {
    this.assertValid()
    assert(index > 1, "Cannot delete first stage")
    const stage = this.stages[index]
    assert(stage !== nil, "invalid stage number")

    this.raiseEvent({ type: "pre-stage-deleted", assembly: this, stage })

    stage.valid = false
    this.surfaceIndexToStageNumber.delete(stage.surface.index)
    table.remove(this.stages as unknown as Stage[], index)
    // update stages
    for (const i of $range(index, this.numStages())) {
      const stage = this.stages[i]
      stage.stageNumber = i
      this.surfaceIndexToStageNumber.set(stage.surface.index, i)
    }

    this.content.deleteStage(index)

    this.raiseEvent({ type: "stage-deleted", assembly: this, stage })
    return stage
  }

  delete() {
    if (!this.valid) return
    global.assemblies.delete(this.id)
    this.valid = false
    for (const [, stage] of pairs(this.stages)) {
      stage.valid = false
    }
    this.raiseEvent({ type: "assembly-deleted", assembly: this })
    this.localEvents.closeAll()
  }
  numStages(): number {
    return luaLength(this.stages)
  }
  getStageName(stageNumber: StageNumber): LocalisedString {
    return this.stages[stageNumber].name.get()
  }
  private createNewStageName(): string {
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

/**
 * Does not perform any checks.
 */
export function newAssembly(surfaces: readonly LuaSurface[], bbox: BoundingBox): Assembly {
  bbox = BBox.scale(bbox, 1 / 32)
    .roundTile()
    .scale(32)
  return AssemblyImpl.create(bbox, surfaces)
}

export function userCreateAssembly(
  area: BoundingBox,
  numStages: number,
  deleteExistingEntities: boolean,
  name: string,
): Assembly {
  const surfaces = prepareAssemblySurfaces(area, numStages)
  if (deleteExistingEntities) {
    for (const surface of surfaces) for (const e of surface.find_entities(area)) e.destroy()
  }
  const assembly = newAssembly(surfaces, area)
  assembly.name.set(name)
  return assembly
}

function prepareAssemblySurfaces(area: BBox, numStages: number): LuaSurface[] {
  generateAssemblySurfaces(numStages)
  const surfaces: LuaSurface[] = []
  for (const i of $range(1, numStages)) {
    const surface = getAssemblySurface(i)!
    prepareArea(surface, area)
    surfaces.push(surface)
  }
  return surfaces
}

export function getAllAssemblies(): Assembly[] {
  return Object.values(global.assemblies)
}

export function _deleteAllAssemblies(): void {
  for (const [, assembly] of global.assemblies) {
    assembly.delete()
  }
  global.nextAssemblyId = 1 as AssemblyId
}

function getDisplayName(locale: string, id: number, name: string): LocalisedString {
  return name !== "" ? name : [locale, id]
}
registerFunctions("Assembly", { getDisplayName })

@RegisterClass("Stage")
class StageImpl implements Stage {
  left_top: Position
  right_bottom: Position

  name: MutableState<string>
  valid = true

  constructor(
    public readonly assembly: AssemblyImpl,
    public stageNumber: StageNumber,
    public readonly surface: LuaSurface,
    bbox: BoundingBox,
    name: string,
  ) {
    this.left_top = bbox.left_top
    this.right_bottom = bbox.right_bottom
    this.name = state(name)
  }

  public deleteInAssembly(): void {
    if (!this.valid) return
    this.assembly.deleteStage(this.stageNumber)
  }
}

@RegisterClass("DemonstrationAssembly")
class DemonstrationAssembly extends AssemblyImpl {
  constructor(id: AssemblyId, private initialNumStages: StageNumber) {
    super(
      id,
      BBox.coords(0, 0, 32 * initialNumStages, 32),
      Array.from({ length: initialNumStages }, (_, i) => ({
        surface: game.surfaces[1],
        bbox: BBox.coords(0, 0, 32, 32).translate(Pos(i * 32, 0)),
      })),
    )
  }
  override getStageAt(surface: LuaSurface, position: Position): Stage | nil {
    const index = floor(position.x / 32)
    if (index < 0 || index >= this.numStages()) return nil
    return this.getStage(index + 1)
  }
  override insertStage(): Stage {
    error("Cannot add stages to a demonstration assembly")
  }
  override deleteStage(): Stage {
    error("Cannot delete stages from a demonstration assembly")
  }
}
export function _mockAssembly(numStages: number = 0): Assembly {
  return new DemonstrationAssembly(0 as AssemblyId, numStages)
}
export function createDemonstrationAssembly(numStages: number): Assembly {
  const id = global.nextAssemblyId++ as AssemblyId
  const assembly = new DemonstrationAssembly(id, numStages)
  AssemblyImpl.onAssemblyCreated(assembly)
  return assembly
}
