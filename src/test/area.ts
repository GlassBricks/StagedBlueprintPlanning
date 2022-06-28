import { BBox } from "../lib/geometry"
import { WorldArea } from "../utils/world-location"

export function testArea(): WorldArea {
  return {
    surface: game.surfaces[1],
    bbox: BBox.coords(2, 2, 102, 102),
  }
}

export function clearTestArea(): WorldArea {
  const area = testArea()
  area.surface.find_entities_filtered({ area: area.bbox }).forEach((e) => e.destroy())
  return area
}
