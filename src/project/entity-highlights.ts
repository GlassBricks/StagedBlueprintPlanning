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
import { ProjectEntity, StageCount, StageNumber } from "../entity/ProjectEntity"
import { isPreviewEntity, OnPrototypeInfoLoaded, PrototypeInfo } from "../entity/prototype-info"
import { assertNever, RegisterClass } from "../lib"
import { BBox, Position } from "../lib/geometry"
import { createHighlightBox, createSprite } from "./create-highlight"
import { EntityStorage } from "./EntityStorage"
import { WorldEntityTypes } from "./WorldPresentation"

export interface SurfaceProvider {
  getSurface(stage: StageNumber): LuaSurface | nil
}

export interface HasErrorAt {
  hasErrorAt(entity: ProjectEntity, stage: StageNumber): boolean
}

export interface HighlightTypes {
  errorOutline: HighlightBoxEntity
  errorElsewhereIndicator: LuaRenderObject
  settingsRemnantHighlight: HighlightBoxEntity
  configChangedHighlight: HighlightBoxEntity
  configChangedLaterHighlight: LuaRenderObject
  stageDeleteHighlight: LuaRenderObject
  itemRequestHighlight: LuaRenderObject
  itemRequestHighlightOverlay: LuaRenderObject
  excludedFromBlueprintsHighlight: LuaRenderObject
}

type HighlightEntity = HighlightBoxEntity | LuaRenderObject

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
  ExcludedFromBlueprints = "utility/deconstruction_mark",
}
const highlightConfigs: {
  [P in keyof HighlightTypes]-?: HighlightConfig | SpriteConfig
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
  excludedFromBlueprintsHighlight: {
    type: "sprite",
    sprite: HighlightConstants.ExcludedFromBlueprints,
    offset: { x: 0.2, y: 0.8 },
    scale: 0.2,
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

@RegisterClass("EntityHighlights")
export class EntityHighlights {
  constructor(
    private surfaces: SurfaceProvider,
    private stageCount: StageCount,
    private errorChecker: HasErrorAt,
    private entityStorage: EntityStorage<WorldEntityTypes>,
  ) {}

  private lastStageFor(entity: ProjectEntity): StageNumber {
    return entity.lastStageWith(this.stageCount)
  }

  private createHighlight<T extends keyof HighlightTypes>(
    entity: ProjectEntity,
    stage: StageNumber,
    surface: LuaSurface,
    type: T,
    spriteNameOverride?: string,
  ): HighlightTypes[T] {
    const config = highlightConfigs[type]
    const existing = this.entityStorage.get(entity, type, stage) as HighlightTypes[T] | nil
    const entityTarget = this.entityStorage.get(entity, "worldOrPreviewEntity", stage)
    if (
      existing &&
      config.type == "sprite" &&
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

    this.entityStorage.set(entity, type, stage, result as WorldEntityTypes[T & keyof WorldEntityTypes])
    return result as HighlightTypes[T]
  }

  private updateHighlight(
    entity: ProjectEntity,
    stage: StageNumber,
    type: keyof HighlightTypes,
    value: boolean | nil,
  ): HighlightEntity | nil {
    if (value) return this.createHighlight(entity, stage, this.surfaces.getSurface(stage)!, type)
    this.entityStorage.delete(entity, type, stage)
    return nil
  }

  private updateErrorOutlines(entity: ProjectEntity): void {
    let hasErrorAnywhere = false
    for (const stage of $range(entity.firstStage, this.lastStageFor(entity))) {
      const hasError = this.errorChecker.hasErrorAt(entity, stage)
      this.updateHighlight(entity, stage, "errorOutline", hasError)
      hasErrorAnywhere ||= hasError
    }

    if (!hasErrorAnywhere) {
      this.entityStorage.deleteAllOfType(entity, "errorElsewhereIndicator")
    } else {
      for (const stage of $range(1, this.lastStageFor(entity))) {
        const shouldHaveIndicator = !this.errorChecker.hasErrorAt(entity, stage)
        this.updateHighlight(entity, stage, "errorElsewhereIndicator", shouldHaveIndicator)
      }
    }
  }

  private updateStageDiffHighlights(entity: ProjectEntity): void {
    if (!entity.hasStageDiff()) {
      this.entityStorage.deleteAllOfType(entity, "configChangedHighlight")
      this.entityStorage.deleteAllOfType(entity, "configChangedLaterHighlight")
      return
    }
    const firstStage = entity.firstStage
    let lastStageWithHighlights = firstStage
    for (const stage of $range(1, this.lastStageFor(entity))) {
      const hasConfigChanged = entity.hasStageDiff(stage)
      const isUpgrade = hasConfigChanged && entity.getStageDiff(stage)!.name != nil
      const highlight = this.updateHighlight(entity, stage, "configChangedHighlight", hasConfigChanged)
      if (highlight) {
        ;(highlight as HighlightBoxEntity).highlight_box_type = isUpgrade
          ? HighlightConstants.Upgraded
          : HighlightConstants.ConfigChanged
      }
      if (!hasConfigChanged) continue

      const sprite = isUpgrade ? HighlightConstants.UpgradedLater : HighlightConstants.ConfigChangedLater
      for (; lastStageWithHighlights < stage; lastStageWithHighlights++) {
        const highlight = this.updateHighlight(
          entity,
          lastStageWithHighlights,
          "configChangedLaterHighlight",
          true,
        ) as LuaRenderObject
        highlight.sprite = sprite
      }
    }
    if (lastStageWithHighlights == firstStage) {
      this.entityStorage.deleteAllOfType(entity, "configChangedLaterHighlight")
    } else {
      for (const i of $range(lastStageWithHighlights, this.lastStageFor(entity))) {
        this.entityStorage.delete(entity, "configChangedLaterHighlight", i)
      }
      for (const i of $range(1, firstStage - 1)) {
        this.entityStorage.delete(entity, "configChangedLaterHighlight", i)
      }
    }
  }

  private updateStageDeleteIndicator(entity: ProjectEntity): void {
    this.entityStorage.deleteAllOfType(entity, "stageDeleteHighlight")
    if (entity.lastStage != nil && !entity.isMovable()) {
      const stage = entity.lastStage
      const surface = this.surfaces.getSurface(stage)!
      this.createHighlight(entity, stage, surface, "stageDeleteHighlight")
    }
  }

  private updateStageRequestIndicator(entity: ProjectEntity): void {
    this.entityStorage.deleteAllOfType(entity, "itemRequestHighlight")
    this.entityStorage.deleteAllOfType(entity, "itemRequestHighlightOverlay")
    const unstagedValue = entity.getPropertyAllStages("unstagedValue")
    if (!unstagedValue) return
    if (entity.firstValue.name in prototypesToSkipRequestHighlight) return
    for (const [stage, value] of pairs(unstagedValue)) {
      this.createEntityHighlights(entity, stage, value.items)
    }
  }

  private createEntityHighlights(
    entity: ProjectEntity<Entity>,
    stage: number,
    insertPlans: BlueprintInsertPlan[] | nil,
  ) {
    const worldOrPreview = this.entityStorage.get(entity, "worldOrPreviewEntity", stage)
    const worldEntity = worldOrPreview && !isPreviewEntity(worldOrPreview) ? worldOrPreview : nil
    const sampleItemName = getItemRequestSampleItemName(entity, stage, insertPlans, worldEntity)
    if (sampleItemName != nil) {
      this.createHighlight(entity, stage, this.surfaces.getSurface(stage)!, "itemRequestHighlight")
      this.createHighlight(
        entity,
        stage,
        this.surfaces.getSurface(stage)!,
        "itemRequestHighlightOverlay",
        `item/${sampleItemName}`,
      )
    }
  }

  private updateExcludedFromBlueprintsHighlight(entity: ProjectEntity): void {
    this.destroyAllExtraEntities(entity, "excludedFromBlueprintsHighlight")
    const allStages = entity.getPropertyAllStages("excludedFromBlueprints")
    if (!allStages) return
    for (const [stage] of pairs(allStages)) {
      this.createHighlight(entity, stage, this.surfaces.getSurface(stage)!, "excludedFromBlueprintsHighlight")
    }
  }

  updateAllHighlights(entity: ProjectEntity): void {
    this.updateErrorOutlines(entity)
    this.updateStageDiffHighlights(entity)
    this.updateStageDeleteIndicator(entity)
    this.updateStageRequestIndicator(entity)
    this.updateExcludedFromBlueprintsHighlight(entity)
  }

  deleteAllHighlights(entity: ProjectEntity): void {
    for (const type of keys<HighlightTypes>()) this.entityStorage.deleteAllOfType(entity, type)
  }

  makeSettingsRemnantHighlights(entity: ProjectEntity): void {
    if (!entity.isSettingsRemnant) return
    for (const type of keys<HighlightTypes>()) this.entityStorage.deleteAllOfType(entity, type)
    for (const stage of $range(1, this.lastStageFor(entity))) {
      this.updateHighlight(entity, stage, "settingsRemnantHighlight", true)
    }
  }

  updateHighlightsOnReviveSettingsRemnant(entity: ProjectEntity): void {
    if (entity.isSettingsRemnant) return
    this.entityStorage.deleteAllOfType(entity, "settingsRemnantHighlight")
    this.updateAllHighlights(entity)
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
