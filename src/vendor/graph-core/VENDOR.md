# Vendored graph engine

`src/vendor/graph-core/` is a copy of the framework-neutral half of
[trooperthorn/relationship-maps](https://github.com/trooperthorn/relationship-maps)
`packages/graph-core`: the data model, the arc and force layouts, and the canvas renderer.
The React shell of that package is deliberately not vendored; `src/map/` drives the engine
from Vue.

The same engine backs the SolarWinds entity map and the Home Assistant SOC panel's Entity
Map tab, which is the point: one layout and one renderer, three very different datasets.

| Vendored file | Upstream path |
| --- | --- |
| `types.ts` | `packages/graph-core/src/types.ts` |
| `theme.ts` | `packages/graph-core/src/theme.ts` |
| `arc.ts` | `packages/graph-core/src/layout/arc.ts` |
| `force.ts` | `packages/graph-core/src/layout/force.ts` |
| `renderer.ts` | `packages/graph-core/src/render/renderer.ts` |

## Refreshing

```bash
node scripts/vendor-graph-core.mjs --from /path/to/relationship-maps
pnpm build
```

The script rewrites the two relative imports (`../theme`, `../types`) to siblings and stamps
the upstream commit into each header. Do not edit the vendored files by hand: a local fix
belongs upstream, or the next refresh silently reverts it.
