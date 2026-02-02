import {
  BaseItemStack,
  BlueprintEntity,
  BlueprintWire,
  LuaEntity,
  LuaItemStack,
  LuaPlayer,
  OnBuiltEntityEvent,
  OnPreBuildEvent,
  Tags,
} from "factorio:runtime"
import { BlueprintBuild } from "__bplib__/blueprint"
import { Prototypes, Settings } from "../../constants"
import { StageInfoExport } from "../../import-export/entity"
import { PRecord, ProtectedEvents } from "../../lib"
import { L_Interaction } from "../../locale"
import { Stage } from "../Project"
import {
  BplibPasteData,
  BplibPasteEntityData,
  BplibPasteEvent,
  calculateTransformedDirection,
  findPastedEntity,
  flushPendingBplibPaste,
  getState,
} from "./shared-state"

const Events = ProtectedEvents

const IsLastEntity = "bp100IsLastEntity"

interface MarkerTags extends Tags {
  referencedLuaIndex: number
  referencedName: string
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

function blueprintNeedsPreparation(stack: LuaItemStack): boolean {
  return (
    stack.valid_for_read && stack.is_blueprint && stack.is_blueprint_setup() && stack.get_blueprint_entity_count() > 0
  )
}

function prepareBlueprintForStagePaste(stack: LuaItemStack): LuaMultiReturn<[BlueprintEntity[], number] | []> {
  if (!blueprintNeedsPreparation(stack)) return $multi()
  const entities = stack.get_blueprint_entities()
  if (!entities) return $multi()

  const numEntities = entities.length
  let nextIndex = numEntities + 1
  for (const i of $range(1, numEntities)) {
    const entity = entities[i - 1]
    const { direction } = entity
    const { name, position } = entity
    entities[nextIndex - 1] = {
      entity_number: nextIndex,
      name: Prototypes.EntityMarker,
      direction,
      position,
      tags: {
        referencedName: name,
        referencedLuaIndex: i,
      } as MarkerTags,
    }
    nextIndex++
  }
  if (nextIndex == numEntities + 1) {
    entities[nextIndex - 1] = {
      entity_number: nextIndex,
      name: Prototypes.EntityMarker,
      position: { x: 0, y: 0 },
      tags: {},
    }
  }

  entities[entities.length - 1].tags![IsLastEntity] = true

  stack.set_blueprint_entities(entities)

  return $multi(entities, numEntities)
}

function revertPreparedBlueprint(stack: LuaItemStack): void {
  const current = assert(getState().currentBlueprintPaste)
  const entities = current.entities
  for (const i of $range(entities.length, current.originalNumEntities + 1, -1)) {
    entities[i - 1] = nil!
  }
  stack.set_blueprint_entities(entities)
}

function onPreBlueprintPastedBplib(player: LuaPlayer, stage: Stage, event: OnPreBuildEvent): void {
  flushPendingBplibPaste()

  const bpBuild = BlueprintBuild.new(event)
  if (!bpBuild) {
    player.print([L_Interaction.BlueprintNotHandled])
    return
  }

  const blueprintEntities = bpBuild.get_entities()
  if (!blueprintEntities || blueprintEntities.length == 0) {
    return
  }

  const positionMap = bpBuild.map_blueprint_indices_to_world_positions()
  if (!positionMap) {
    return
  }

  const entities: BplibPasteEntityData[] = []
  for (const [index, position] of pairs(positionMap)) {
    const blueprintEntity = blueprintEntities[index - 1]
    if (!blueprintEntity) continue

    entities.push({
      blueprintEntity,
      worldPosition: position,
    })
  }

  if (entities.length == 0) return

  getState().pendingBplibPaste = {
    stage,
    playerIndex: player.index,
    surface: bpBuild.surface,
    entities,
    allowPasteUpgrades: event.build_mode == defines.build_mode.superforced,
    flipVertical: event.flip_vertical ?? false,
    flipHorizontal: event.flip_horizontal ?? false,
    direction: event.direction,
  } satisfies BplibPasteData

  BplibPasteEvent(nil)
}

export function onPreBlueprintPasted(
  player: LuaPlayer,
  stage: Stage | nil,
  event: OnPreBuildEvent,
  hasBlueprintSettingsPastedEvent: boolean,
): void {
  if (!stage) {
    tryFixBlueprint(player)
    return
  }
  if (hasBlueprintSettingsPastedEvent) {
    return
  }

  flushPendingBplibPaste()

  const useBplib = !!player.mod_settings[Settings.UseBplibForBlueprintPaste]?.value

  if (useBplib) {
    return onPreBlueprintPastedBplib(player, stage, event)
  }

  const blueprint = getInnerBlueprint(player.cursor_stack)
  if (!blueprint) {
    player.print([L_Interaction.BlueprintNotHandled])
    return
  }
  const [entities, numEntities] = prepareBlueprintForStagePaste(blueprint)
  if (entities != nil) {
    getState().currentBlueprintPaste = {
      stage,
      entities,
      knownLuaEntities: {},
      needsManualConnections: [],
      originalNumEntities: numEntities,
      allowUpgrades: event.build_mode == defines.build_mode.superforced,
      flipVertical: event.flip_vertical ?? false,
      flipHorizontal: event.flip_horizontal ?? false,
      direction: event.direction,
    }
  }
}

export function tryFixBlueprint(player: LuaPlayer): void {
  const blueprint = getInnerBlueprint(player.cursor_stack)
  if (!blueprint) return
  const entityCount = blueprint.get_blueprint_entity_count()
  if (entityCount == 0) return
  const lastTags = blueprint.get_blueprint_entity_tag(entityCount, IsLastEntity)
  if (lastTags != nil) {
    const entities = blueprint.get_blueprint_entities()!
    blueprint.set_blueprint_entities(entities)
  }
}

Events.on_player_cursor_stack_changed((e) => {
  tryFixBlueprint(game.get_player(e.player_index)!)
  getState().lastPreBuild = nil
})

Events.on_player_changed_surface((e) => {
  tryFixBlueprint(game.get_player(e.player_index)!)
  getState().lastPreBuild = nil
})

export function onEntityMarkerBuilt(e: OnBuiltEntityEvent, entity: LuaEntity): void {
  const tags = (e.tags ?? entity.tags) as MarkerTags
  if (tags != nil) {
    handleEntityMarkerBuilt(e, entity, tags)
    if (tags[IsLastEntity] != nil) onLastEntityMarkerBuilt(e)
  }
  entity.destroy()
}

function handleEntityMarkerBuilt(e: OnBuiltEntityEvent, entity: LuaEntity, tags: MarkerTags): void {
  const referencedName = tags.referencedName
  if (!referencedName) return

  const bpState = getState().currentBlueprintPaste!
  const entityId = tags.referencedLuaIndex
  const value = bpState.entities[entityId - 1]

  const isFlipped = bpState.flipVertical != bpState.flipHorizontal
  const entityDir = calculateTransformedDirection(value, entity.direction, isFlipped)

  let { entity: luaEntity } = findPastedEntity({
    surface: entity.surface,
    position: entity.position,
    blueprintEntity: value,
    expectedDirection: entityDir,
    allowUpgrades: bpState.allowUpgrades,
  })

  if (!luaEntity) return

  const stage = bpState.stage
  const projectEntity = stage.actions.onEntityPossiblyUpdated(
    luaEntity,
    stage.stageNumber,
    nil,
    e.player_index,
    value.tags?.bp100 as StageInfoExport | nil,
    value.items,
  )

  if (value.wires) {
    if (projectEntity != nil) {
      if (!luaEntity.valid) {
        luaEntity = stage.project.worldPresentation.getWorldEntity(projectEntity, stage.stageNumber)
        if (!luaEntity) return

        bpState.needsManualConnections.push(entityId)
      } else if (luaEntity.type == "transport-belt" || bpState.allowUpgrades) {
        bpState.needsManualConnections.push(entityId)
      } else {
        stage.actions.onWiresPossiblyUpdated(luaEntity, stage.stageNumber, e.player_index)
      }
    }
    bpState.knownLuaEntities[entityId] = luaEntity
  }
}

function onLastEntityMarkerBuilt(e: OnBuiltEntityEvent): void {
  const { entities, knownLuaEntities, needsManualConnections, stage } = getState().currentBlueprintPaste!

  for (const entityId of needsManualConnections) {
    const value = entities[entityId - 1]
    const luaEntity = knownLuaEntities[entityId]
    if (!luaEntity) continue
    manuallyConnectWires(value.wires, knownLuaEntities)
    stage.actions.onWiresPossiblyUpdated(luaEntity, stage.stageNumber, e.player_index)
  }

  const player = game.get_player(e.player_index)!

  const blueprint = getInnerBlueprint(player.cursor_stack)
  revertPreparedBlueprint(assert(blueprint))
  getState().currentBlueprintPaste = nil
}

function manuallyConnectWires(wires: BlueprintWire[] | nil, knownLuaEntities: PRecord<number, LuaEntity>): void {
  if (!wires) return
  for (const [fromNumber, fromId, toNumber, toId] of wires) {
    const fromEntity = knownLuaEntities[fromNumber]
    const toEntity = knownLuaEntities[toNumber]
    if (!fromEntity || !toEntity) continue
    fromEntity.get_wire_connector(fromId, true).connect_to(toEntity.get_wire_connector(toId, true))
  }
}
