## Better space platform tile handling

If project is space platform:

## Use landfill tile

- The default "landfillTile" setting value should become "space-platform-foundation"
- Ui: replace label with "Platform tile:"

## Reset space platform foundations function

- Replace "fill with landfill tile" buttons in ui, when is space platform. With just one button to "Reset space platform foundations"
- Algorithm to reset space platform foundations:

1. Work in the provided surface.
2. Fill/with space platform foundations, similar to "fill with landfill" operation:

- Fill all tiles with "space-platform-foundation" tile, forcibly
- Fill all tiles with "empty-space", this time with "abort_on_collision"
- Query info about tiles vs empty space to a binary map (platform, no platform)

3. Connect islands algorithmically
  - use a simple heuristic algorithm for steiner tree problem
  - See @island_connector.ts. However, that is written in generic TS, not TSTL. May need tweaks for TypescriptToLua:
     - `tostring(), nil, LuaMap/LuaSet or even Record<> preferred over Map/Set
5. After getting final tile map, and staged tiles are enabled, adjust stored tile data (mine or place tiles) to match the tile map.
