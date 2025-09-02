import { BaseBlueprintEntity, LuaItemStack } from "factorio:runtime"
import { updateBasicBlueprintSettings } from "../blueprints/edit-blueprint-settings"
import { Entity } from "../entity/Entity"
import { addWireConnection, createProjectEntityNoCopy, ProjectEntity } from "../entity/ProjectEntity"
import { UserProject } from "../project/ProjectDef"
import { createUserProject } from "../project/UserProject"

export function convertBookToProjectDataOnly(stack: LuaItemStack): UserProject {
  if (!(stack.valid && stack.valid_for_read && stack.is_blueprint_book)) {
    const name = stack.valid_for_read ? stack.name : "<empty stack>"
    error("Not a blueprint book; found " + name)
  }
  const blueprintStacks: LuaItemStack[] = []
  const inv = stack.get_inventory(defines.inventory.item_main)
  if (!inv) error("No blueprint book inventory found")
  for (let i = 1; i <= inv.length; i++) {
    const blueprintStack = inv[i - 1]
    if (
      blueprintStack.valid &&
      blueprintStack.valid_for_read &&
      blueprintStack.is_blueprint &&
      blueprintStack.get_blueprint_entity_count() > 0
    ) {
      blueprintStacks.push(blueprintStack)
    }
  }

  const project = createUserProject(stack.label ?? "", blueprintStacks.length)

  let curStageNum = 0

  let unaccountedLastStageEntities = new LuaSet<ProjectEntity>()
  for (const blueprintStack of blueprintStacks) {
    curStageNum++

    const entities = blueprintStack.get_blueprint_entities() ?? []
    // add or update entities
    const thisStageEntities = new LuaSet<ProjectEntity>()
    const entityNumToProjectEntity = new LuaMap<number, ProjectEntity>()
    for (const entity of entities) {
      const thisValue = makeCleanEntity(entity)
      const existingEntity = project.content.findCompatibleEntity(
        entity.name,
        entity.position,
        entity.direction,
        curStageNum,
      )
      let curEntity: ProjectEntity
      if (existingEntity) {
        existingEntity.applyUpgradeAtStage(curStageNum, thisValue)
        unaccountedLastStageEntities.delete(existingEntity)
        curEntity = existingEntity
      } else {
        const newEntity = createProjectEntityNoCopy(thisValue, entity.position, entity.direction, curStageNum)
        project.content.addEntity(newEntity)
        curEntity = newEntity
      }
      thisStageEntities.add(curEntity)
      entityNumToProjectEntity.set(entity.entity_number, curEntity)
    }

    // add wires
    for (const { wires } of entities) {
      if (!wires) continue
      for (const wire of wires) {
        const [fromNumber, fromId, toNumber, toId] = wire
        const fromEntity = entityNumToProjectEntity.get(fromNumber)
        const toEntity = entityNumToProjectEntity.get(toNumber)
        if (fromEntity && toEntity) {
          addWireConnection({ fromEntity, toEntity, fromId, toId })
        }
      }
    }
    // set lastStage for entities that have disappeared
    for (const entity of unaccountedLastStageEntities) {
      entity.setLastStageUnchecked(curStageNum - 1)
    }
    // set stage blueprint settings
    const stage = project.getStage(curStageNum)!
    if (blueprintStack.label != nil) {
      stage.name.set(blueprintStack.label)
    }
    const stageSettings = stage.getBlueprintSettingsView()
    updateBasicBlueprintSettings(blueprintStack, stageSettings)
    const icons = blueprintStack.preview_icons
    if (icons) {
      for (const icon of icons) {
        const index = tostring(icon.index) as "1" | "2" | "3" | "4"
        stageSettings[index].set(icon.signal)
      }
    }
    unaccountedLastStageEntities = thisStageEntities
  }

  return project
}

const excludedKeys = newLuaSet("entity_number", "position", "direction")
function makeCleanEntity(entity: BaseBlueprintEntity): Entity {
  const result: Record<string, unknown> = {}
  for (const [key, value] of pairs(entity)) {
    if (!excludedKeys.has(key)) {
      result[key] = value as never
    }
  }
  return result as unknown as Entity
}
