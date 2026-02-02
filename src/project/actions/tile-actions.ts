import { MutableProjectContent } from "../../entity/ProjectContent"
import { getPrototypeInfo } from "../../entity/prototype-info"
import { Position } from "../../lib/geometry"
import { StageNumber } from "../../entity/ProjectEntity"
import { createProjectTile, ProjectTile } from "../../tiles/ProjectTile"
import { SurfaceProvider } from "../entity-highlights"
import { ProjectSettings } from "../ProjectSettings"
import { WorldPresenter } from "../WorldPresentation"

interface ActionContext {
  readonly content: MutableProjectContent
  readonly worldPresenter: WorldPresenter
  readonly settings: ProjectSettings
  readonly surfaces: SurfaceProvider
}

export function setTileAtStage(ctx: ActionContext, position: Position, stage: StageNumber, value: string | nil): void {
  let tile = ctx.content.tiles.get(position.x, position.y)

  if (!tile && value != nil) {
    tile = createProjectTile()
    ctx.content.setTile(position, tile)
  }

  if (!tile) return

  tile.setTileAtStage(stage, value)

  const wasEmpty = tile.isEmpty()
  if (wasEmpty) {
    ctx.content.deleteTile(position)
  }

  const collision = ctx.worldPresenter.updateTiles(position, stage)

  if (collision) {
    if (wasEmpty) {
      tile = createProjectTile()
      ctx.content.setTile(position, tile)
    }
    tile.setTileAtStage(collision.stage, collision.actualValue)
  }
}

export function deleteTile(ctx: ActionContext, position: Position): boolean {
  const result = ctx.content.deleteTile(position)
  if (result) {
    ctx.worldPresenter.updateTiles(position, 1)
  }
  return result
}

export function scanProjectForExistingTiles(ctx: ActionContext): void {
  const bbox = ctx.content.computeBoundingBox()
  const tilesToUpdateArray: Array<[Position, ProjectTile]> = []
  const tilesToUpdateSet = new LuaSet<ProjectTile>()

  for (const stage of $range(1, ctx.settings.stageCount())) {
    const surface = ctx.surfaces.getSurface(stage)!
    const tiles = surface.find_tiles_filtered({
      area: bbox,
      name: Object.keys(getPrototypeInfo().blueprintableTiles),
    })

    for (const tile of tiles) {
      const position = tile.position
      let projectTile = ctx.content.tiles.get(position.x, position.y)

      if (!projectTile) {
        projectTile = createProjectTile()
        ctx.content.setTile(position, projectTile)
      }

      projectTile.setTileAtStage(stage, tile.name)
      if (!tilesToUpdateSet.has(projectTile)) {
        tilesToUpdateArray.push([position, projectTile])
        tilesToUpdateSet.add(projectTile)
      }
    }
  }

  for (const [position, tile] of tilesToUpdateArray) {
    ctx.worldPresenter.updateTiles(position, tile.getFirstStage())
  }
}

export function onTileBuilt(ctx: ActionContext, position: Position, name: string, stage: StageNumber): void {
  if (!getPrototypeInfo().blueprintableTiles.has(name)) {
    setTileAtStage(ctx, position, stage, nil)
    return
  }
  setTileAtStage(ctx, position, stage, name)
}

export function onTileMined(ctx: ActionContext, position: Position, stage: StageNumber): void {
  setTileAtStage(ctx, position, stage, nil)
}
