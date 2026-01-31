// Copyright (c) 2022-2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
  BlueprintInsertPlan,
  Color,
  ColorArray,
  CursorBoxRenderType,
  HighlightBoxEntity,
  LuaEntity,
  LuaRenderObject,
  LuaSurface,
  RenderLayer,
  ScriptRenderTargetTableWrite,
  SpritePath,
} from "factorio:runtime"
import { Entity } from "../entity/Entity"
import { ProjectEntity, StageNumber } from "../entity/ProjectEntity"
import { OnPrototypeInfoLoaded, PrototypeInfo } from "../entity/prototype-info"
import { assertNever } from "../lib"
import { BBox, Position } from "../lib/geometry"
import { createHighlightBox, createSprite } from "./create-highlight"
import { EntityStorage } from "./EntityStorage"
import { ProjectBase } from "./Project"
import { WorldEntityLookup, WorldEntityTypes } from "./WorldPresentation"

export type HighlightEntity = HighlightBoxEntity | LuaRenderObject
export interface HighlightEntities {
  /** Error outline when an entity cannot be placed. Should be placed on preview entity. */
  errorOutline?: HighlightBoxEntity
  /** Indicator sprite when there is an error highlight in another stage. */
  errorElsewhereIndicator?: LuaRenderObject

  /** White outline when a settings remnant entity is left behind. */
  settingsRemnantHighlight?: HighlightBoxEntity

  /** Blue/green outline when an entity's settings have changed; green if is upgrade */
  configChangedHighlight?: HighlightBoxEntity
  /** Blueprint sprite when an entity's settings have changed in a future stage. */
  configChangedLaterHighlight?: LuaRenderObject

  /** Deconstruction planner sprite when an entity is deleted in the next stage (lastStage is set). Ignored if entity is movable. */
  stageDeleteHighlight?: LuaRenderObject

  /** Item is requested. */
  itemRequestHighlight?: LuaRenderObject
  itemRequestHighlightOverlay?: LuaRenderObject
}

interface HighlightConfig {
  readonly type: "highlight"
  readonly renderType: CursorBoxRenderType
}

interface SpriteConfig {
  readonly type: "sprite"
  readonly sprite: SpritePath
  readonly offset: Position
  readonly tint?: Color | ColorArray
  readonly scale: number
  readonly scaleRelative?: boolean
  readonly renderLayer: RenderLayer
}

export const enum HighlightConstants {
  Error = "not-allowed",
  SettingsRemnant = "train-visualization",
  ConfigChanged = "logistics",
  Upgraded = "copy",
  ErrorInOtherStage = "utility/danger_icon",
  ConfigChangedLater = "item/blueprint",
  UpgradedLater = "item/upgrade-planner",
  DeletedNextStage = "item/deconstruction-planner",
  ItemRequest = "entity/item-request-proxy",
}
const highlightConfigs: {
  [P in keyof HighlightEntities]-?: HighlightConfig | SpriteConfig
} = {
  errorOutline: {
    type: "highlight",
    renderType: HighlightConstants.Error,
  },
  errorElsewhereIndicator: {
    type: "sprite",
    sprite: HighlightConstants.ErrorInOtherStage,
    offset: { x: 0.2, y: 0.1 },
    scale: 0.3,
    renderLayer: "entity-info-icon-above",
  },
  settingsRemnantHighlight: {
    type: "highlight",
    renderType: HighlightConstants.SettingsRemnant,
  },
  configChangedHighlight: {
    type: "highlight",
    renderType: HighlightConstants.ConfigChanged,
  },
  configChangedLaterHighlight: {
    type: "sprite",
    sprite: HighlightConstants.ConfigChangedLater,
    offset: { x: 0.8, y: 0.1 },
    scale: 0.5,
    renderLayer: "entity-info-icon-above",
  },
  stageDeleteHighlight: {
    type: "sprite",
    sprite: HighlightConstants.DeletedNextStage,
    offset: { x: 0.8, y: 0.8 },
    scale: 0.5,
    renderLayer: "entity-info-icon-above",
  },
  itemRequestHighlight: {
    type: "sprite",
    sprite: HighlightConstants.ItemRequest,
    offset: { x: 0.5, y: 0.1 },
    scale: 0.8,
    renderLayer: "entity-info-icon",
  },
  itemRequestHighlightOverlay: {
    type: "sprite",
    sprite: "",
    offset: { x: 0.5, y: 0.05 },
    scale: 0.5,
    renderLayer: "entity-info-icon-above",
  },
}

let selectionBoxes: PrototypeInfo["selectionBoxes"]
OnPrototypeInfoLoaded.addListener((info) => {
  ;({ selectionBoxes } = info)
})

const prototypesToSkipRequestHighlight = newLuaSet(
  "gun-turret",
  "laser-turret",
  "artillery-turret",
  "flamethrower-turret",
  "tesla-turret",
  "railgun-turret",
)

/** @noSelf */
export interface EntityHighlights {
  updateAllHighlights(entity: ProjectEntity): void
  deleteAllHighlights(entity: ProjectEntity): void
  makeSettingsRemnantHighlights(entity: ProjectEntity): void
  updateHighlightsOnReviveSettingsRemnant(entity: ProjectEntity): void
}
export function EntityHighlights(
  project: ProjectBase,
  worldEntities: WorldEntityLookup,
  entityStorage: EntityStorage<WorldEntityTypes>,
): EntityHighlights {
  function getExtraEntity<T extends keyof HighlightEntities>(
    entity: ProjectEntity,
    type: T,
    stage: StageNumber,
  ): HighlightEntities[T] | nil {
    const value = entityStorage.get(entity, type, stage) as HighlightEntities[T] | nil
    if (value && value.valid) return value
    if (value) entityStorage.delete(entity, type, stage)
    return nil
  }

  function replaceExtraEntity<T extends keyof HighlightEntities>(
    entity: ProjectEntity,
    type: T,
    stage: StageNumber,
    value: HighlightEntities[T] | nil,
  ): void {
    if (value == nil) {
      destroyExtraEntity(entity, type, stage)
      return
    }
    const existing = entityStorage.get(entity, type, stage) as HighlightEntities[T] | nil
    if (existing && existing.valid && existing != value) existing.destroy()
    entityStorage.set(entity, type, stage, value as WorldEntityTypes[T & keyof WorldEntityTypes])
  }

  function destroyExtraEntity(entity: ProjectEntity, type: keyof HighlightEntities, stage: StageNumber): void {
    const existing = entityStorage.get(entity, type, stage) as HighlightEntity | nil
    if (existing && existing.valid) existing.destroy()
    entityStorage.delete(entity, type, stage)
  }

  function destroyAllExtraEntities(entity: ProjectEntity, type: keyof HighlightEntities): void {
    for (const [, value] of entityStorage.iterateType(entity, type)) {
      const highlight = value as unknown as HighlightEntity
      if (highlight && highlight.valid) highlight.destroy()
    }
    entityStorage.deleteAllOfType(entity, type)
  }

  function createHighlight<T extends keyof HighlightEntities>(
    entity: ProjectEntity,
    stage: StageNumber,
    surface: LuaSurface,
    type: T,
    spriteNameOverride?: string,
  ): HighlightEntities[T] {
    const config = highlightConfigs[type]
    const existing = getExtraEntity(entity, type, stage)
    const entityTarget = worldEntities.getWorldOrPreviewEntity(entity, stage)
    if (
      existing &&
      config.type == "sprite" &&
      existing.valid &&
      existing.object_name == "LuaRenderObject" &&
      existing.target == entityTarget
    )
      return existing

    const prototypeName = entity.firstValue.name
    let result: LuaEntity | LuaRenderObject | nil
    if (config.type == "highlight") {
      const { renderType } = config
      result = entityTarget && createHighlightBox(entityTarget, renderType)
    } else if (config.type == "sprite") {
      const localSelectionBox = selectionBoxes.get(prototypeName)
      if (localSelectionBox) {
        const selectionBox = BBox.rotateAboutOrigin(localSelectionBox, entity.direction)
        const size = selectionBox.size()
        const relativePosition = size.emul(config.offset).plus(selectionBox.left_top)
        const target: ScriptRenderTargetTableWrite = entityTarget
          ? {
              entity: entityTarget,
              offset: [relativePosition.x, relativePosition.y],
            }
          : {
              position: relativePosition.plus(entity.position),
            }
        const scale = config.scaleRelative ? (config.scale * (size.x + size.y)) / 2 : config.scale
        result = createSprite({
          surface,
          target,
          x_scale: scale,
          y_scale: scale,
          sprite: spriteNameOverride ?? config.sprite,
          tint: config.tint,
          render_layer: config.renderLayer,
        })
      }
    } else {
      assertNever(config)
    }

    replaceExtraEntity(entity, type, stage, result as HighlightEntities[T])
    return result as HighlightEntities[T]
  }

  function removeHighlight(entity: ProjectEntity, stageNumber: StageNumber, type: keyof HighlightEntities): void {
    destroyExtraEntity(entity, type, stageNumber)
  }

  function removeHighlightFromAllStages(entity: ProjectEntity, type: keyof HighlightEntities): void {
    destroyAllExtraEntities(entity, type)
  }

  return {
    updateAllHighlights,
    deleteAllHighlights,
    makeSettingsRemnantHighlights,
    updateHighlightsOnReviveSettingsRemnant,
  }
  function updateHighlight(
    entity: ProjectEntity,
    stage: StageNumber,
    type: keyof HighlightEntities,
    value: boolean | nil,
  ): HighlightEntity | nil {
    if (value) return createHighlight(entity, stage, project.surfaces.getSurface(stage)!, type)
    removeHighlight(entity, stage, type)
    return nil
  }

  function updateErrorOutlines(entity: ProjectEntity): void {
    let hasErrorAnywhere = false
    for (const stage of $range(entity.firstStage, project.lastStageFor(entity))) {
      const hasError = worldEntities.hasErrorAt(entity, stage)
      updateHighlight(entity, stage, "errorOutline", hasError)
      hasErrorAnywhere ||= hasError
    }

    if (!hasErrorAnywhere) {
      destroyAllExtraEntities(entity, "errorElsewhereIndicator")
    } else {
      for (const stage of $range(1, project.lastStageFor(entity))) {
        const shouldHaveIndicator = !worldEntities.hasErrorAt(entity, stage)
        updateHighlight(entity, stage, "errorElsewhereIndicator", shouldHaveIndicator)
      }
    }
  }

  function updateStageDiffHighlights(entity: ProjectEntity): void {
    if (!entity.hasStageDiff()) {
      destroyAllExtraEntities(entity, "configChangedHighlight")
      destroyAllExtraEntities(entity, "configChangedLaterHighlight")
      return
    }
    const firstStage = entity.firstStage
    let lastStageWithHighlights = firstStage
    for (const stage of $range(1, project.lastStageFor(entity))) {
      const hasConfigChanged = entity.hasStageDiff(stage)
      const isUpgrade = hasConfigChanged && entity.getStageDiff(stage)!.name != nil
      const highlight = updateHighlight(entity, stage, "configChangedHighlight", hasConfigChanged)
      if (highlight) {
        ;(highlight as HighlightBoxEntity).highlight_box_type = isUpgrade
          ? HighlightConstants.Upgraded
          : HighlightConstants.ConfigChanged
      }
      if (!hasConfigChanged) continue

      // update configChangedLaterHighlights in previous stages
      const sprite = isUpgrade ? HighlightConstants.UpgradedLater : HighlightConstants.ConfigChangedLater
      for (; lastStageWithHighlights < stage; lastStageWithHighlights++) {
        const highlight = updateHighlight(
          entity,
          lastStageWithHighlights,
          "configChangedLaterHighlight",
          true,
        ) as LuaRenderObject
        highlight.sprite = sprite
      }
    }
    if (lastStageWithHighlights == firstStage) {
      // remove later highlights for all stages
      removeHighlightFromAllStages(entity, "configChangedLaterHighlight")
    } else {
      for (const i of $range(lastStageWithHighlights, project.lastStageFor(entity))) {
        removeHighlight(entity, i, "configChangedLaterHighlight")
      }
      for (const i of $range(1, firstStage - 1)) {
        removeHighlight(entity, i, "configChangedLaterHighlight")
      }
    }
  }

  function updateStageDeleteIndicator(entity: ProjectEntity): void {
    destroyAllExtraEntities(entity, "stageDeleteHighlight")
    if (entity.lastStage != nil && !entity.isMovable()) {
      const stage = entity.lastStage
      const surface = project.surfaces.getSurface(stage)!
      createHighlight(entity, stage, surface, "stageDeleteHighlight")
    }
  }

  function updateStageRequestIndicator(entity: ProjectEntity): void {
    destroyAllExtraEntities(entity, "itemRequestHighlight")
    destroyAllExtraEntities(entity, "itemRequestHighlightOverlay")
    const unstagedValue = entity.getPropertyAllStages("unstagedValue")
    if (!unstagedValue) return
    if (entity.firstValue.name in prototypesToSkipRequestHighlight) return
    for (const [stage, value] of pairs(unstagedValue)) {
      createEntityHiglights(entity, stage, value.items)
    }
  }

  function createEntityHiglights(
    entity: ProjectEntity<Entity>,
    stage: number,
    insertPlans: BlueprintInsertPlan[] | nil,
  ) {
    const sampleItemName = getItemRequestSampleItemName(
      entity,
      stage,
      insertPlans,
      worldEntities.getWorldEntity(entity, stage),
    )
    if (sampleItemName != nil) {
      createHighlight(entity, stage, project.surfaces.getSurface(stage)!, "itemRequestHighlight")
      createHighlight(
        entity,
        stage,
        project.surfaces.getSurface(stage)!,
        "itemRequestHighlightOverlay",
        `item/${sampleItemName}`,
      )
    }
  }

  function updateAllHighlights(entity: ProjectEntity): void {
    updateErrorOutlines(entity)
    updateStageDiffHighlights(entity)
    updateStageDeleteIndicator(entity)
    updateStageRequestIndicator(entity)
  }

  function deleteAllHighlights(entity: ProjectEntity): void {
    for (const type of keys<HighlightEntities>()) destroyAllExtraEntities(entity, type)
  }
  function makeSettingsRemnantHighlights(entity: ProjectEntity): void {
    if (!entity.isSettingsRemnant) return
    for (const type of keys<HighlightEntities>()) destroyAllExtraEntities(entity, type)
    for (const stage of $range(1, project.lastStageFor(entity))) {
      updateHighlight(entity, stage, "settingsRemnantHighlight", true)
    }
  }
  function updateHighlightsOnReviveSettingsRemnant(entity: ProjectEntity): void {
    if (entity.isSettingsRemnant) return
    destroyAllExtraEntities(entity, "settingsRemnantHighlight")
    updateAllHighlights(entity)
  }
}
export function getItemRequestSampleItemName(
  projectEntity: ProjectEntity,
  stage: StageNumber,
  insertPlans: BlueprintInsertPlan[] | nil = projectEntity.getUnstagedValue(stage)?.items,
  worldEntity?: LuaEntity,
): string | nil {
  if (!insertPlans) return
  const fuelInventory = worldEntity?.get_fuel_inventory()?.index
  return insertPlans.find((p) => p.items.in_inventory?.some((i) => i.inventory != fuelInventory))?.id
    .name as unknown as string | nil
}
