import { SurfaceIndex } from "factorio:runtime"
import { Stage } from "./Project"

export { getProjectById } from "./ProjectList"

declare const storage: {
  surfaceIndexToStage: ReadonlyLuaMap<SurfaceIndex, Stage>
}

export function getStageAtSurface(surfaceIndex: SurfaceIndex): Stage | nil {
  return storage.surfaceIndexToStage.get(surfaceIndex)
}
