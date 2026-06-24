import {
  BaseItemStack,
  BlueprintEntity,
  BlueprintInsertPlan,
  LuaEntity,
  LuaItemStack,
  LuaPlayer,
  PlayerIndex,
  Tags,
} from "factorio:runtime"
import { LuaEntityInfo } from "../../entity/Entity"
import { isEmpty, Mutable, ProtectedEvents } from "../../lib"
import { DelayedEvent } from "../../lib/delayed-event"
import { Migrations } from "../../lib/migration"
import { Stage } from "../Project"
import { getState } from "./shared-state"

const Events = ProtectedEvents

export interface ToBeFastReplacedEntity extends LuaEntityInfo {
  readonly stage: Stage
}

interface BlueprintPasteState {
  toBeFastReplaced?: ToBeFastReplacedEntity
}

let pasteState: BlueprintPasteState

declare const storage: {
  blueprintPasteState: BlueprintPasteState
}

Migrations.since("2.14.0", () => {
  pasteState = storage.blueprintPasteState ??= {}
})
Migrations.to("2.15.0", () => {
  // Native 2.1 paste events replaced the bplib/marker paste hacks; drop their now-unused
  // transient state (currentBlueprintPaste, pendingBplibPaste). toBeFastReplaced is also
  // transient (single-tick) and safe to clear at load time.
  pasteState = storage.blueprintPasteState = {}
})
Events.on_load(() => {
  pasteState = storage.blueprintPasteState
})

export function clearToBeFastReplaced(): void {
  const { toBeFastReplaced } = pasteState
  if (toBeFastReplaced) {
    const { stage } = toBeFastReplaced
    if (stage.valid) {
      const { stageNumber } = stage
      stage.actions.onEntityDeleted(toBeFastReplaced, stageNumber)
    }
    pasteState.toBeFastReplaced = nil
  }
}

export function setToBeFastReplaced(entity: LuaEntity, stage: Stage): void {
  const isUnderground = entity.type == "underground-belt"
  const newValue: ToBeFastReplacedEntity = {
    name: entity.name,
    type: entity.type,
    position: entity.position,
    direction: entity.direction,
    surface: entity.surface,
    belt_to_ground_type: isUnderground ? entity.belt_to_ground_type : nil,
    stage,
  }

  clearToBeFastReplaced()
  pasteState.toBeFastReplaced = newValue
}

export function getToBeFastReplaced(): ToBeFastReplacedEntity | nil {
  return pasteState.toBeFastReplaced
}

export function clearToBeFastReplacedField(): void {
  pasteState.toBeFastReplaced = nil
}

export function getInnerBlueprint(stack: BaseItemStack | nil): LuaItemStack | nil {
  if (!stack || !stack.valid_for_read) return nil
  const type = stack.type
  if (type == "blueprint") return stack as LuaItemStack
  if (type == "blueprint-book") {
    const active = stack.active_index
    if (!active) return nil
    const innerStack = stack.get_inventory(defines.inventory.item_main)
    if (!innerStack) return nil
    return active <= innerStack.length ? getInnerBlueprint(innerStack[active - 1]) : nil
  }
  return nil
}

// The native on_blueprint_settings_pasted / on_built_entity events deliver a blueprint entity's
// `tags` but not its `items` (item requests). To recover item requests during a paste, stamp them
// into a tag in on_pre_build (so the engine carries them through to the events), then strip the tag
// again next tick so the player's blueprint is left unchanged.
const StagePasteItemsTag = "bp100Items"

export function onPreBlueprintPasteNative(player: LuaPlayer, stage: Stage | nil): void {
  if (!stage) return
  if (stampBlueprintItemTags(player.cursor_stack)) {
    RevertPasteItemTagsEvent(player.index)
  }
}

function stampBlueprintItemTags(stack: LuaItemStack | nil): boolean {
  const blueprint = getInnerBlueprint(stack)
  if (!blueprint || !blueprintHasEntities(blueprint)) return false
  const entities = blueprint.get_blueprint_entities()
  if (!entities) return false
  let modified = false
  for (const entity of entities as Mutable<BlueprintEntity>[]) {
    const items = entity.items
    if (items) {
      const tags = entity.tags ?? (entity.tags = {})
      tags[StagePasteItemsTag] = items
      modified = true
    }
  }
  if (modified) blueprint.set_blueprint_entities(entities)
  return modified
}

function revertBlueprintItemTags(stack: LuaItemStack | nil): void {
  const blueprint = getInnerBlueprint(stack)
  if (!blueprint) return
  const entities = blueprint.get_blueprint_entities()
  if (!entities) return
  let modified = false
  for (const entity of entities as Mutable<BlueprintEntity>[]) {
    const tags = entity.tags
    if (tags && tags[StagePasteItemsTag] != nil) {
      tags[StagePasteItemsTag] = nil!
      if (isEmpty(tags)) entity.tags = nil
      modified = true
    }
  }
  if (modified) blueprint.set_blueprint_entities(entities)
}

export const RevertPasteItemTagsEvent = DelayedEvent<PlayerIndex>("revertPasteItemTags", (playerIndex) => {
  const player = game.get_player(playerIndex)
  if (player) revertBlueprintItemTags(player.cursor_stack)
})

export function getPasteItemRequests(tags: Tags | nil): BlueprintInsertPlan[] | nil {
  return tags?.[StagePasteItemsTag] as BlueprintInsertPlan[] | nil
}

function blueprintHasEntities(stack: LuaItemStack): boolean {
  return (
    stack.valid_for_read && stack.is_blueprint && stack.is_blueprint_setup() && stack.get_blueprint_entity_count() > 0
  )
}

Events.on_player_cursor_stack_changed(() => {
  getState().lastPreBuild = nil
})

Events.on_player_changed_surface(() => {
  getState().lastPreBuild = nil
})

export function _resetBlueprintPasteState(): void {
  for (const [k] of pairs(pasteState)) {
    pasteState[k] = nil!
  }
}

export function _assertBlueprintPasteInValidState(): void {
  for (const [k, v] of pairs(pasteState)) {
    pasteState[k] = nil!
    assert(!v, `${k} was not cleaned up`)
  }
}
