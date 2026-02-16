// Copyright (c) 2022-2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { LuaEntity, LuaInventory, LuaSurface, SignalID, SurfaceIndex } from "factorio:runtime"
import {
  BlueprintSettingsOverrideTable,
  BlueprintSettingsTable,
  BlueprintTakeSettings,
  createStageBlueprintSettingsTable,
  iconNumbers,
  StageBlueprintSettingsTable,
} from "../blueprints/blueprint-settings"
import { newMap2d } from "../entity/map2d"
import { StageNumber } from "../entity/ProjectEntity"
import { Mutable, MutableProperty, PRecord, property, SimpleEvent, Subscription } from "../lib"
import { Position } from "../lib/geometry"
import { Migrations } from "../lib/migration"
import { PropertiesTable } from "../utils/properties-obj"
import { createProjectTile } from "../tiles/ProjectTile"
import { getNilPlaceholder } from "../utils/diff-value"
import "./event-handlers"
import { getDefaultSurfaceSettings, readSurfaceSettings, SurfaceSettings, updateStageSurfaceName } from "./surfaces"
import "./Project"
import { BlueprintBookTemplate } from "./BlueprintBookTemplate"
import { getAllProjects } from "./ProjectList"
import { OverrideableBlueprintSettings } from "../blueprints/blueprint-settings"
import { ProjectSettings, StageSettingsData } from "./ProjectSettings"
import { ProjectSurfaces } from "./ProjectSurfaces"
import { ProjectActions } from "./actions"
import { WorldPresentation } from "./WorldPresentation"

declare const luaLength: LuaLength<Record<number, any>, number>

interface OldStage {
  surface?: LuaSurface
  surfaceIndex?: SurfaceIndex
  name?: MutableProperty<string>
  blueprintOverrideSettings?: BlueprintSettingsOverrideTable
  stageBlueprintSettings?: StageBlueprintSettingsTable
  subscription?: Subscription
}

interface OldProject {
  name?: MutableProperty<string>
  landfillTile?: MutableProperty<string | nil>
  stagedTilesEnabled?: MutableProperty<boolean>
  defaultBlueprintSettings?: PropertiesTable<OverrideableBlueprintSettings>
  surfaceSettings?: SurfaceSettings
  blueprintBookTemplateInv?: LuaInventory
  localEvents?: SimpleEvent<any>
  stages: Record<number, unknown>
  settings?: ProjectSettings
  surfaces?: ProjectSurfaces
  stageAdded?: SimpleEvent<unknown>
  preStageDeleted?: SimpleEvent<unknown>
  stageDeleted?: SimpleEvent<unknown>
}

Migrations.early("2.4.0", () => {
  interface Pre24Stage {
    stageBlueprintSettings?: BlueprintSettingsOverrideTable
    blueprintOverrideSettings?: BlueprintSettingsOverrideTable
  }
  for (const project of getAllProjects()) {
    for (const stage of project.getAllStages()) {
      const pre = stage as unknown as Pre24Stage
      if (pre.blueprintOverrideSettings != nil || pre.stageBlueprintSettings == nil) continue
      const post = stage as unknown as OldStage
      post.blueprintOverrideSettings = pre.stageBlueprintSettings
      post.stageBlueprintSettings = createStageBlueprintSettingsTable()
    }
  }
})

Migrations.early("2.14.0", () => {
  for (const project of getAllProjects()) {
    const old = project as unknown as OldProject
    if (old.settings) continue

    const blueprintBookTemplate = old.blueprintBookTemplateInv
      ? BlueprintBookTemplate._fromOldInventory(old.blueprintBookTemplateInv)
      : new BlueprintBookTemplate()
    delete old.blueprintBookTemplateInv

    const stageSettings: Record<number, StageSettingsData> = {}
    const surfaces: LuaSurface[] = []
    const numStages = luaLength(old.stages)
    for (const i of $range(1, numStages)) {
      const oldStage = old.stages[i] as OldStage
      stageSettings[i] = {
        name: oldStage.name!,
        blueprintOverrideSettings: oldStage.blueprintOverrideSettings!,
        stageBlueprintSettings: oldStage.stageBlueprintSettings!,
      }
      surfaces.push(oldStage.surface!)

      delete oldStage.surface
      delete oldStage.surfaceIndex
      delete oldStage.blueprintOverrideSettings
      delete oldStage.stageBlueprintSettings
      delete oldStage.name
      oldStage.subscription?.close()
      delete oldStage.subscription
    }

    old.settings = ProjectSettings._fromOld({
      projectName: old.name!,
      landfillTile: old.landfillTile!,
      stagedTilesEnabled: old.stagedTilesEnabled!,
      defaultBlueprintSettings: old.defaultBlueprintSettings!,
      surfaceSettings: old.surfaceSettings ?? getDefaultSurfaceSettings(),
      blueprintBookTemplate,
      stageSettings,
    })

    old.surfaces = ProjectSurfaces._fromExisting(surfaces, old.settings)

    delete old.name
    delete old.landfillTile
    delete old.stagedTilesEnabled
    delete old.defaultBlueprintSettings
    delete old.surfaceSettings

    old.localEvents?.closeAll()
    delete old.localEvents

    old.stageAdded ??= new SimpleEvent()
    old.preStageDeleted ??= new SimpleEvent()
    old.stageDeleted ??= new SimpleEvent()
  }
})

Migrations.to("2.2.0", () => {
  for (const project of getAllProjects()) {
    for (const entity of project.content.allEntities()) {
      if (entity.isMovable()) {
        const oldLastStage = entity.lastStage
        if (oldLastStage != entity.firstStage) {
          entity._asMut().setLastStage(entity.firstStage)
          project.worldPresentation?.updateWorldEntitiesOnLastStageChanged(entity, oldLastStage)
          project.actions?.resetVehicleLocation(entity)
        }
      }
    }
    for (const stage of project.getAllStages()) {
      stage.getSurface().ignore_surface_conditions = true
    }
  }
})

interface OldBlueprintSettings {
  1: SignalID | nil
  2: SignalID | nil
  3: SignalID | nil
  4: SignalID | nil
}
Migrations.to("2.5.2", () => {
  for (const project of getAllProjects()) {
    const projectBpSettings = project.settings.defaultBlueprintSettings
    function migrateIconNumbers(table: Record<keyof BlueprintTakeSettings, unknown>) {
      assume<Mutable<OldBlueprintSettings>>(table)
      for (const number of iconNumbers) {
        table[`icon${number}`] = table[number] || table[tostring(number) as "1" | "2" | "3" | "4"]
      }
    }
    migrateIconNumbers(projectBpSettings)
    for (const stage of project.getAllStages()) {
      migrateIconNumbers(stage.getSettings().blueprintOverrideSettings)
    }
  }
})
Migrations.to("2.6.4", () => {
  for (const project of getAllProjects()) {
    const projectBpSettings = project.settings.defaultBlueprintSettings
    function deleteOldNumberKeys(table: Record<string, unknown>) {
      assume<Mutable<OldBlueprintSettings>>(table)
      for (const number of iconNumbers) {
        delete table[number]
        delete table[tostring(number) as "1" | "2" | "3" | "4"]
      }
    }
    deleteOldNumberKeys(projectBpSettings)
    for (const stage of project.getAllStages()) {
      deleteOldNumberKeys(stage.getSettings().blueprintOverrideSettings)
    }
  }
})

interface OldProjectTile {
  firstStage: StageNumber
  firstValue: string
  stageDiffs?: PRecord<StageNumber, string>
  lastStage: StageNumber | nil
  position: Position
}

Migrations.to("2.8.0", () => {
  interface HasRegisterEvents {
    registerEvents(): void
  }
  for (const project of getAllProjects()) {
    ;(project as unknown as HasRegisterEvents).registerEvents()
    for (const stage of project.getAllStages()) {
      updateStageSurfaceName(stage.getSurface(), project.settings.projectName.get(), stage.getSettings().name.get())
    }

    const settings = readSurfaceSettings(project.getStage(1)!.getSurface())
    project.settings.surfaceSettings = { ...getDefaultSurfaceSettings(), ...settings }

    // Migrate tiles from old format to new sparse array format
    const tilesToMigrate: OldProjectTile[] = []

    for (const [, row] of pairs<PRecord<number, PRecord<number, unknown>>>(project.content.tiles)) {
      for (const [, tile] of pairs(row)) {
        const old = tile as unknown as OldProjectTile
        tilesToMigrate.push(old)
      }
    }
    project.content.tiles = newMap2d()

    for (const old of tilesToMigrate) {
      const newTile = createProjectTile()
      const position = old.position

      newTile.values[old.firstStage] = old.firstValue

      if (old.stageDiffs) {
        for (const [stage, value] of pairs(old.stageDiffs)) {
          newTile.values[stage] = value
        }
      }

      if (old.lastStage != nil) {
        newTile.values[old.lastStage + 1] = getNilPlaceholder()
      }

      project.content.setTile(position, newTile)
    }
  }
})

Migrations.to("2.8.4", () => {
  for (const project of getAllProjects()) {
    for (const stage of project.getAllStages()) {
      game.forces.player.set_surface_hidden(stage.getSurface(), true)
    }
  }
})

Migrations.to("2.12.0", () => {
  for (const project of getAllProjects()) {
    assume<Mutable<BlueprintSettingsTable>>(project.settings.defaultBlueprintSettings)
    project.settings.defaultBlueprintSettings.customBlueprintName = property(nil)

    for (const stage of project.getAllStages()) {
      const overrideSettings = stage.getSettings().blueprintOverrideSettings
      assume<Mutable<BlueprintSettingsOverrideTable>>(overrideSettings)
      overrideSettings.customBlueprintName = property(nil)
    }
  }
})

Migrations.to("2.14.0", () => {
  for (const project of getAllProjects()) {
    interface OldUserProject {
      worldUpdates?: unknown
      updates?: unknown
      subscription?: { close(): void }
    }
    const old = project as unknown as OldUserProject
    delete old.worldUpdates
    delete old.updates
    old.subscription?.close()
    delete old.subscription
    if (!project.worldPresentation) {
      project.worldPresentation = new WorldPresentation(project.settings, project.surfaces, project.content)
    }
    interface ContentWithBatchDepth {
      batchDepth?: number
    }
    ;(project.content as unknown as ContentWithBatchDepth).batchDepth ??= 0
    project.content.setObserver(project.worldPresentation)

    if (!(project.actions instanceof ProjectActions)) {
      project.actions = new ProjectActions(
        project.content,
        project.worldPresentation,
        project.settings,
        project.surfaces,
      )
      for (const stage of project.getAllStages()) {
        ;(stage as { actions: ProjectActions }).actions = project.actions
      }
    }
    project.actions.projectId = project.id
    ;(project as unknown as { registerEvents(): void }).registerEvents()

    interface OldProjectEntity {
      [stage: StageNumber]: LuaEntity | nil
    }
    const es = project.worldPresentation.entityStorage
    for (const entity of project.content.allEntities()) {
      const old = entity as unknown as OldProjectEntity
      for (const [k, v] of pairs(old)) {
        if (typeof k == "number") {
          es.set(entity, "worldOrPreviewEntity", k, v)
          delete old[k]
        }
      }
    }
  }

  interface OldUndoData {
    project?: { actions: unknown }
    actions?: unknown
  }
  interface OldUndoEntry {
    data: OldUndoData
  }
  interface UndoPlayerData {
    undoEntries?: Record<number, OldUndoEntry>
  }
  interface UndoStorage {
    players?: Record<number, UndoPlayerData>
  }
  const players = (globalThis as unknown as { storage: UndoStorage }).storage.players
  if (players) {
    for (const [, playerData] of pairs(players)) {
      if (!playerData.undoEntries) continue
      for (const [, entry] of pairs(playerData.undoEntries)) {
        const data = entry.data
        if (data.project && !data.actions) {
          data.actions = data.project.actions
          delete data.project
        }
      }
    }
  }
})

Migrations.to($CURRENT_VERSION, () => {
  interface OldPlayerData {
    undoEntries?: unknown
    nextUndoEntryIndex?: unknown
  }
  interface OldStorage {
    players?: Record<number, OldPlayerData>
  }
  const players = (globalThis as unknown as { storage: OldStorage }).storage.players
  if (players) {
    for (const [, playerData] of pairs(players)) {
      delete playerData.undoEntries
      delete playerData.nextUndoEntryIndex
    }
  }
})
