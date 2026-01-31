import { HighlightBoxEntity, LuaEntity, LuaRenderObject, nil } from "factorio:runtime"
import { ProjectEntity, StageNumber } from "../entity/ProjectEntity"
import { RegisterClass } from "../lib"
import { EntityHighlights } from "./entity-highlights"
import { EntityStorage } from "./EntityStorage"
import { Project } from "./ProjectDef"
import { WorldUpdates } from "./world-updates"

export interface WorldEntityTypes {
  worldOrPreviewEntity: LuaEntity
  errorOutline: HighlightBoxEntity
  errorElsewhereIndicator: LuaRenderObject
  settingsRemnantHighlight: HighlightBoxEntity
  configChangedHighlight: HighlightBoxEntity
  configChangedLaterHighlight: LuaRenderObject
  stageDeleteHighlight: LuaRenderObject
  itemRequestHighlight: LuaRenderObject
  itemRequestHighlightOverlay: LuaRenderObject
}

interface Closures {
  worldUpdates: WorldUpdates
  highlights: EntityHighlights
}

const closureCache = setmetatable(new LuaMap<WorldPresentation, Closures>(), { __mode: "k" })

function getClosures(wp: WorldPresentation): Closures {
  let cached = closureCache.get(wp)
  if (!cached) {
    const highlights = EntityHighlights(wp.project)
    const worldUpdates = WorldUpdates(wp.project, highlights)
    cached = { worldUpdates, highlights }
    closureCache.set(wp, cached)
  }
  return cached
}

@RegisterClass("WorldPresentation")
export class WorldPresentation {
  readonly entityStorage = new EntityStorage<WorldEntityTypes>()

  constructor(readonly project: Project) {}

  getWorldUpdates(): WorldUpdates {
    return getClosures(this).worldUpdates
  }

  getHighlights(): EntityHighlights {
    return getClosures(this).highlights
  }

  getWorldOrPreviewEntity(entity: ProjectEntity, stage: StageNumber): LuaEntity | nil {
    return entity.getWorldOrPreviewEntity(stage)
  }

  getWorldEntity(entity: ProjectEntity, stage: StageNumber): LuaEntity | nil {
    return entity.getWorldEntity(stage)
  }

  replaceWorldOrPreviewEntity(entity: ProjectEntity, stage: StageNumber, luaEntity: LuaEntity | nil): void {
    entity.replaceWorldOrPreviewEntity(stage, luaEntity)
  }

  hasErrorAt(entity: ProjectEntity, stage: StageNumber): boolean {
    return entity.hasErrorAt(stage)
  }
}
