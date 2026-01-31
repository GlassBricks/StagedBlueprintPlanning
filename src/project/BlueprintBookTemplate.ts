import { LuaInventory, LuaItemStack, nil } from "factorio:runtime"
import { createStageReference, getReferencedStage } from "../blueprints/stage-reference"
import { Prototypes } from "../constants"
import { StageNumber } from "../entity/ProjectEntity"
import { RegisterClass } from "../lib"
import { Stage } from "./Project"

export interface StageProvider {
  getAllStages(): readonly Stage[]
  getStage(stageNumber: StageNumber): Stage | nil
}

@RegisterClass("BlueprintBookTemplate")
export class BlueprintBookTemplate {
  private inventory?: LuaInventory

  get(): LuaItemStack | nil {
    if (!this.inventory?.valid) return nil
    const stack = this.inventory[0]
    if (stack.valid_for_read && stack.is_blueprint_book) return stack
  }

  getOrCreate(stages: StageProvider, projectName: string): LuaItemStack {
    if (this.inventory == nil) {
      this.inventory = game.create_inventory(1)
    }
    const stack = this.inventory[0]
    if (!stack.valid_for_read || !stack.is_blueprint_book) {
      this.setInitial(stack, stages, projectName)
    }
    return stack
  }

  reset(): void {
    this.inventory?.destroy()
    this.inventory = nil
  }

  onStageInserted(newStageNumber: StageNumber, stages: StageProvider): void {
    const template = this.get()
    if (!template) return
    this.addStageToTemplate(newStageNumber, template, stages)
  }

  onProjectNameChanged(newName: string, oldName: string): void {
    const template = this.get()
    if (template != nil && template.label == oldName) {
      template.label = newName
    }
  }

  destroy(): void {
    this.inventory?.destroy()
    this.inventory = nil
  }

  static _fromOldInventory(inventory: LuaInventory): BlueprintBookTemplate {
    const instance = new BlueprintBookTemplate()
    instance.inventory = inventory
    return instance
  }

  private setInitial(stack: LuaItemStack, stages: StageProvider, projectName: string): void {
    stack.set_stack("blueprint-book")
    const inventory = stack.get_inventory(defines.inventory.item_main)!
    for (const stage of stages.getAllStages()) {
      inventory.insert(Prototypes.StageReference)
      const bpStack = inventory[inventory.length - 1]
      createStageReference(bpStack, stage)
    }
    stack.label = projectName
  }

  private addStageToTemplate(newStage: StageNumber, stack: LuaItemStack, stages: StageProvider): void {
    if (!stack.valid || !stack.valid_for_read || !stack.is_blueprint_book) return
    const inventory = stack.get_inventory(defines.inventory.item_main)!
    let prevStageIndex = -1
    for (const i of $range(inventory.length, 1, -1)) {
      const bookStack = inventory[i - 1]
      const stage = getReferencedStage(bookStack)
      if (stage != nil && stage.stageNumber <= newStage) {
        prevStageIndex = i - 1
        break
      }
    }

    this.pushInventory(inventory, prevStageIndex + 1)
    const stage = stages.getStage(newStage)
    if (stage) createStageReference(inventory[prevStageIndex + 1], stage)
  }

  private pushInventory(inventory: LuaInventory, index: number): void {
    let nextFreeSlot: number | nil = index
    while (nextFreeSlot < inventory.length && inventory[nextFreeSlot].valid_for_read) nextFreeSlot++
    const needsExpansion = nextFreeSlot == inventory.length
    if (needsExpansion) {
      const freeSlots = inventory.get_insertable_count(Prototypes.StageReference)
      inventory.insert({
        name: Prototypes.StageReference,
        count: freeSlots + 1,
      })
    }
    for (let i = nextFreeSlot - 1; i >= index; i--) {
      assert(inventory[i].swap_stack(inventory[i + 1]))
    }
    if (needsExpansion) {
      for (const i of $range(1, inventory.length - 1)) {
        const stack = inventory[i - 1]
        if (stack.valid_for_read && stack.name == Prototypes.StageReference && !stack.is_blueprint_setup()) {
          stack.clear()
        }
      }
    }
  }
}
