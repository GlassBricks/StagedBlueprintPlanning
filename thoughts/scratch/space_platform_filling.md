## Better space platform tile handling

If project is space platform:

## Use landfill tile

- The default "landfillTile" setting value should become "space-platform-foundation"
- Ui: replace label with "Platform tile:"
- In world updates: use landfillTile instead of hardcoded "space-platform-foundation"

## New: reset space platform foundations

- Replace "fill with landfill tile" buttons etc. with just one button to "Reset space platform foundations"
- New algorithm to reset space platform foundations
  1. Get project bounding box
  2. Fill entire bounding box with "space-platform-foundation" tile
  3. Fill entire bounding box with "empty-space", this time with "remove_on_colliding: false"
  4. Steiner tree: find 8-connected components of space platform foundations. Naive algorithm for now: repeatedly (but efficiently) find shortest path between components until all components are connected. Place space platform tiles to connect all components
