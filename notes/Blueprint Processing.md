## Process entities in the following order:

- Preprocess edits
- (all) entities, or (only new entities + a whitelist)
- Filter from blacklist
- Transformations (infinity -> combinators)
- Internal edits (grid position, etc.)
- Postprocess edits


## Settings
- "Default" settings for a build, then per-stage overrides

### Ui mockup
```
---------------------------------------------
|  Blueprint settings for [default/current] |
---------------------------------------------
| Tiles
|  [x] Set landfill before taking blueprint
|  [x] Use next stage's tiles
|   (other preprocess)                   
| Filtering entities 
|  [Select custom blueprint bounding box]
|  [x] Only include entities changed in the past [input field] stages 
|       or also in whitelist [edit whitelist]        
|  [edit blacklist]
| Editing entities
|  [x] Replace infinity chests with combinators 

```

## Needed ui components
- True/False/NotSet checkboxes
- Checkbox (true/false/notset) with dropdown, and [input]
