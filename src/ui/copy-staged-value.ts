import { BlueprintInsertPlan } from "factorio:runtime"
import { addItemRequestsToEntity } from "../blueprints/take-single-blueprint"
import { Settings } from "../constants"
import { Events, isEmpty, PRecord } from "../lib"
import { Pos, Position } from "../lib/geometry"
import { getStageAtSurface } from "../project/project-refs"

Events.on_player_setup_blueprint((event) => {
  const player = game.players[event.player_index]
  if (!player.mod_settings[Settings.CopyItemRequests].value) return
  const stack = event.stack
  if (!(stack && stack.valid && stack.valid_for_read && stack.is_blueprint)) return
  const surface = event.surface
  const stage = getStageAtSurface(surface.index)
  if (!stage) return
  const projectContent = stage.project.content
  const stageNumber = stage.stageNumber
  const wp = stage.project.worldPresentation

  const unstagedValues: PRecord<
    number,
    {
      entityName: string
      entityPosition: Position
      itemRequests: BlueprintInsertPlan[]
    }
  > = {}

  for (const [entityNumber, entity] of pairs(event.mapping.get())) {
    const position = entity.position
    const projectEntity = projectContent.findEntityExact(entity, position, stageNumber, wp)
    if (!projectEntity) continue
    const requests = projectEntity.getUnstagedValue(stageNumber)?.items
    if (requests) {
      unstagedValues[entityNumber] = {
        entityName: entity.name,
        entityPosition: position,
        itemRequests: requests,
      }
    }
  }

  if (isEmpty(unstagedValues)) return

  const bpEntities = stack.get_blueprint_entities()
  if (!bpEntities) return
  let changed = false
  for (const entity of bpEntities) {
    const blueprintIndex = entity.entity_number
    const info = unstagedValues[blueprintIndex]
    if (!info) continue
    if (entity.name != info.entityName || !Pos.equals(entity.position, info.entityPosition)) continue
    changed = addItemRequestsToEntity(entity, info.itemRequests) || changed
  }
  if (changed) {
    stack.set_blueprint_entities(bpEntities)
  }
})
