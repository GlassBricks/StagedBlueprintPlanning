/*
 * Copyright (c) 2023 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { Stage, UserAssembly } from "../assembly/AssemblyDef"
import { AutoSetTilesType } from "../assembly/tiles"
import { AssemblyEntity, StageNumber } from "../entity/AssemblyEntity"
import { Mutable } from "../lib"
import { BBox, Pos, Position } from "../lib/geometry"
import { getCurrentValues } from "../utils/properties-obj"
import {
  AssemblyOrStageBlueprintSettings,
  getDefaultBlueprintSettings,
  OverrideableBlueprintSettings,
  StageBlueprintSettings,
} from "./blueprint-settings"
import { BlueprintTakeResult, takeSingleBlueprint } from "./take-single-blueprint"
import max = math.max

interface AssemblyBlueprintPlan {
  assembly: UserAssembly
  // other stuff will go here eventually
  stagePlans: LuaMap<StageNumber, StageBlueprintPlan>

  changedEntities?: LuaMap<StageNumber, LuaSet<AssemblyEntity>>
}

interface StageBlueprintPlan {
  stage: Stage

  stack: LuaItemStack | nil
  bbox: BBox
  settings: StageBlueprintSettings

  result: BlueprintTakeResult | nil
}

function getCurrentBpSettings(stage: Stage): StageBlueprintSettings {
  return getCurrentValues(stage.getBlueprintSettingsView())
}

/**
 * Facilitates the creation of multiple blueprints efficiently.
 */
export class BlueprintCreation {
  private inventory?: LuaInventory
  private assemblyPlans = new LuaMap<UserAssembly, AssemblyBlueprintPlan>()

  private getPlanForAssembly(assembly: UserAssembly): AssemblyBlueprintPlan {
    if (!this.assemblyPlans.has(assembly)) {
      this.assemblyPlans.set(assembly, { assembly, stagePlans: new LuaMap() })
    }
    return this.assemblyPlans.get(assembly)!
  }

  private getChangedEntities(assemblyInfo: AssemblyBlueprintPlan): LuaMap<StageNumber, LuaSet<AssemblyEntity>> {
    return (assemblyInfo.changedEntities ??= this.computeChangedEntities(assemblyInfo.assembly))
  }

  private computeChangedEntities(assembly: UserAssembly): LuaMap<StageNumber, LuaSet<AssemblyEntity>> {
    log(["", "Collecting changed entity info for assembly: ", assembly.displayName.get()])
    const result = new LuaMap<StageNumber, LuaSet<AssemblyEntity>>()
    for (const i of $range(1, assembly.numStages())) {
      result.set(i, new LuaSet())
    }
    const content = assembly.content
    for (const entity of content.iterateAllEntities()) {
      const firstStageMap = result.get(entity.firstStage)!
      firstStageMap.add(entity)

      const diffs = entity.getStageDiffs()
      if (diffs) {
        for (const [stage] of pairs(diffs)) {
          result.get(stage)!.add(entity)
        }
      }
      const circuitConnections = content.getCircuitConnections(entity)
      if (circuitConnections) {
        for (const [otherEntity] of circuitConnections) {
          firstStageMap.add(otherEntity)
        }
      }
    }

    return result
  }

  private addNewPlan(
    assemblyInfo: AssemblyBlueprintPlan,
    stack: LuaItemStack | nil,
    stage: Stage,
    settings: StageBlueprintSettings,
  ): StageBlueprintPlan {
    const plan: StageBlueprintPlan = {
      stack,
      stage,
      bbox: stage.getBlueprintBBox(),
      settings,
      result: nil,
    }
    assemblyInfo.stagePlans.set(stage.stageNumber, plan)
    return plan
  }

  private ensureTilesTaken(assemblyInfo: AssemblyBlueprintPlan, stage: Stage) {
    const stagePlan = assemblyInfo.stagePlans.get(stage.stageNumber)
    if (!stagePlan) {
      this.addNewPlan(assemblyInfo, nil, stage, getCurrentBpSettings(stage))
    }
  }

  public addBlueprint(
    stage: Stage,
    stack: LuaItemStack,
    settingsOverride?: StageBlueprintSettings,
  ): { result: BlueprintTakeResult | nil } | nil {
    const assemblyPlan = this.getPlanForAssembly(stage.assembly)
    const existingStagePlan = assemblyPlan.stagePlans.get(stage.stageNumber)
    if (existingStagePlan) {
      if (existingStagePlan.stack) return nil
      existingStagePlan.stack = stack
    }

    const settings = existingStagePlan?.settings ?? settingsOverride ?? getCurrentBpSettings(stage)
    if (settings.useNextStageTiles) {
      const nextStage = stage.assembly.getStage(stage.stageNumber + 1)
      if (nextStage) this.ensureTilesTaken(assemblyPlan, nextStage)
    }

    return existingStagePlan ?? this.addNewPlan(assemblyPlan, stack, stage, settings)
  }

  public takeAllBlueprints(): void {
    for (const [, assemblyPlan] of this.assemblyPlans) {
      log(["", "Taking blueprints for assembly: ", assemblyPlan.assembly.displayName.get()])
      for (const [, stagePlan] of assemblyPlan.stagePlans) {
        this.takeBlueprint(assemblyPlan, stagePlan)
      }
      this.setNextStageTiles(assemblyPlan.stagePlans)
    }
  }

  private setNextStageTiles(stagePlans: LuaMap<StageNumber, StageBlueprintPlan>): void {
    for (const [stageNumber, curStage] of stagePlans) {
      // factorio guarantees this loop is done in ascending stageNumber order (if <= 1024 stages)
      if (!(curStage.result && curStage.settings.useNextStageTiles)) continue

      const nextStagePlan = stagePlans.get(stageNumber + 1)!
      if (!nextStagePlan || !nextStagePlan.result) continue

      const nextStageTiles = nextStagePlan.stack!.get_blueprint_tiles()
      if (!nextStageTiles) {
        curStage.stack!.set_blueprint_tiles([])
        continue
      }
      const shift = Pos.minus(curStage.result.effectivePositionOffset, nextStagePlan.result.effectivePositionOffset)
      if (!Pos.isZero(shift)) {
        const { x, y } = shift
        for (const i of $range(1, nextStageTiles.length)) {
          const pos = nextStageTiles[i - 1].position as Mutable<Position>
          pos.x += x
          pos.y += y
        }
      }
      curStage.stack!.set_blueprint_tiles(nextStageTiles)
    }
  }

  private takeBlueprint(assemblyPlan: AssemblyBlueprintPlan, stagePlan: StageBlueprintPlan): void {
    log(`  stage: ${stagePlan.stage.name.get()}`)

    const { stack, stage, bbox } = stagePlan
    let settings: OverrideableBlueprintSettings = stagePlan.settings

    let actualStack: LuaItemStack

    if (!stack) {
      stagePlan.stack = actualStack = this.getNewTempStack()
      settings = getDefaultBlueprintSettings()
    } else {
      actualStack = stack
    }
    if (settings.autoLandfill) {
      log("    setting landfill")
      stage.autoSetTiles(AutoSetTilesType.LandfillAndLabTiles)
    }

    let unitNumberFilter: LuaSet<UnitNumber> | nil
    if (settings.stageLimit != nil) {
      log("    getting unit number filter")
      unitNumberFilter = this.getUnitNumberFilter(assemblyPlan, stage, settings.stageLimit)
    }

    stagePlan.result = takeSingleBlueprint(actualStack, settings, stage.surface, bbox, unitNumberFilter, false)
    actualStack.label = stage.name.get()
  }

  private getUnitNumberFilter(
    assemblyPlan: AssemblyBlueprintPlan,
    stage: Stage,
    stageLimit: number,
  ): LuaSet<UnitNumber> {
    const result = new LuaSet<UnitNumber>()
    const stageNumber = stage.stageNumber
    const minStage = max(1, stageNumber - stageLimit + 1)
    const maxStage = stageNumber
    const changedEntities = this.getChangedEntities(assemblyPlan)
    for (const stage of $range(minStage, maxStage)) {
      for (const entity of changedEntities.get(stage)!) {
        const luaEntity = entity.getWorldOrPreviewEntity(stageNumber)
        if (!luaEntity) continue
        const unitNumber = luaEntity.unit_number
        if (unitNumber) result.add(unitNumber)
      }
    }
    return result
  }

  private getNewTempStack(): LuaItemStack {
    const inventory = (this.inventory ??= game.create_inventory(4))
    let [stack] = inventory.find_empty_stack()
    if (stack) {
      stack.set_stack("blueprint")
      return stack
    }
    inventory.resize(inventory.length * 2)
    ;[stack] = inventory.find_empty_stack()
    if (!stack) {
      error("Could not find empty stack after resizing inventory")
    }
    stack.set_stack("blueprint")
    return stack
  }

  cleanup(): void {
    if (this.inventory && this.inventory.valid) this.inventory.destroy()
  }
}

export function withBlueprintCreator<T>(action: (creator: BlueprintCreation) => T): T {
  const creator = new BlueprintCreation()
  const [success, result] = pcall(action, creator)
  creator.cleanup()
  if (success) return result
  error(result)
}

export function takeStageBlueprint(
  stage: Stage,
  stack: LuaItemStack,
  settingsOverride?: AssemblyOrStageBlueprintSettings,
): boolean {
  return withBlueprintCreator((creator) => {
    const settings =
      settingsOverride &&
      ({
        icons: nil,
        ...getCurrentValues(settingsOverride),
      } satisfies StageBlueprintSettings)
    const plan = creator.addBlueprint(stage, stack, settings)!
    creator.takeAllBlueprints()
    return plan.result != nil
  })
}

export function makeBlueprintBook(assembly: UserAssembly, stack: LuaItemStack): boolean {
  return withBlueprintCreator((creator) => {
    stack.set_stack("blueprint-book")
    const bookInventory = stack.get_inventory(defines.inventory.item_main)!

    for (const stage of assembly.getAllStages()) {
      bookInventory.insert("blueprint")
      const bpStack = bookInventory[bookInventory.length - 1]
      creator.addBlueprint(stage, bpStack)
    }
    creator.takeAllBlueprints()
    for (const i of $range(1, bookInventory.length)) {
      const bpStack = bookInventory[i - 1]
      if (!bpStack.is_blueprint_setup()) {
        bpStack.clear()
      }
    }
    if (bookInventory.length == 0) {
      stack.clear()
      return false
    }

    stack.label = assembly.name.get()
    return true
  })
}

export function exportBlueprintBookToFile(assembly: UserAssembly, player: LuaPlayer): string | nil {
  const inventory = game.create_inventory(1)
  const stack = inventory[0]!
  if (!makeBlueprintBook(assembly, stack)) {
    inventory.destroy()
    return nil
  }
  log("Exporting blueprint book to file")
  const data = stack.export_stack()
  inventory.destroy()
  // replace not allowed characters with _
  let name = assembly.name.get()
  if (name == "") name = `Unnamed-build-${assembly.id}`
  const [assemblyFileName] = string.gsub(name, "[^%w%-%_%.]", "_")
  const filename = `staged-builds/${assemblyFileName}.txt`
  game.write_file(filename, data, false, player.index)
  return filename
}
