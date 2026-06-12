# deadfall

Dev tool that maps a Next.js (App Router, TypeScript) codebase into a **component
usage graph** to find **dead components** and **per-component usage** — rendered
as a single static HTML file. No server, no UI to build, no changes to the target
project.

## Use

Run without installing:

```bash
# scan a target project, write the report
npx deadfall /path/to/your/next-app --out report.html

# also emit the raw model for CI / scripting
npx deadfall /path/to/your/next-app --out report.html --json report.json

# count test/story files as real usage (off by default)
npx deadfall /path/to/your/next-app --include-tests
```

Or install globally and call `deadfall` directly:

```bash
npm install -g deadfall
deadfall /path/to/your/next-app --out report.html
```

## Dead vs dead-in-prod

A component is **used** only if it is reachable from an application entry point
(App Router `page`/`layout`/etc., or a `dynamic()` import). Reachability is
transitive: a component rendered only by a dead component is itself **dead**.

- **dead** — reachable from no app entry point. Safe-to-delete candidate.
- **dead-in-prod** — dead in shipped code, but a test or story renders it. Only
  appears with `--include-tests`; deleting it means also updating that test/story.

By default `*.test.*`, `*.spec.*`, `*.stories.*`, `__tests__/`, and `__mocks__/`
are **excluded** — usage inside them does not count, so a component used only by
tests/stories is reported as plain `dead`. Pass `--include-tests` to include them
(and surface the `dead-in-prod` distinction).

Open `report.html` in a browser — it opens instantly (layout is precomputed
offline, so there is no in-browser physics). The graph is a **directory-clustered
point cloud**: nodes = components grouped spatially by source directory (size ∝
prod usage; color: blue=used, red=dead, amber=dead-in-prod). Edges = "renders"
(dashed = dynamic import, dotted = value reference) and are hidden in the overview
to keep it readable.

**Navigate** from the left rail: search by name or browse the collapsible
directory tree (each folder shows its dead count). Click a component —
in the tree or the graph — to enter **focus mode**: the view zooms to that node's
neighborhood with everything else dimmed, so you never face all the edges at
once. The neighborhood is **multi-level and directional** — pick a **depth**
(1–5, default 2) and a **direction**: `dependents ↑` (what renders this,
transitively), `dependencies ↓` (what this renders), or `both`. Raising the
depth walks the chain another level — the components that use the ones that use
the selected one, and so on. The breadcrumb's "Overview" (or **Reset view** /
clicking empty space) returns to the full graph. The right panel shows file path
and usage sites. Filter the rail by dead / dead-in-prod.

The report ships with a **light/dark toggle** (🌙/☀︎ in the top bar); light is
the default and the choice is remembered across reloads.

## How it works

| Stage | File | Notes |
|-------|------|-------|
| Discover files | `src/scan/discover.ts` | globs `.tsx/.jsx/.ts/.js`, respects `.gitignore`, skips `node_modules`/`.next`/`dist` |
| Detect components | `src/scan/components.ts` | exported PascalCase decls that return JSX or are `forwardRef`/`memo`/`dynamic`/`styled`-wrapped |
| Resolve & graph | `src/scan/resolve.ts`, `src/graph/build.ts` | TS checker (`getAliasedSymbol`) follows imports, tsconfig `paths`, and barrel re-exports to the real definition |
| Roots & dead | `src/graph/roots.ts`, `src/graph/reachability.ts` | App Router entry files + dynamic-import targets are roots; unreachable (transitively) = dead; with `--include-tests`, test/story-only = dead-in-prod |
| Usage | `src/analyze/usage.ts` | JSX site counts, split prod vs test/story |
| Report | `src/report/html.ts` | self-contained HTML + cytoscape |

## Known limits

- **Dynamic/indirect usage** beyond `dynamic()`/`lazy()` (string registries,
  HOCs, components passed as values) is approximated by a soft "reference" edge;
  spot-check flagged-dead components before deleting.
- **`next.config` references** are out of scope.
- The `PascalCase + returns JSX` heuristic can mis-tag exotic factories /
  styled-component patterns.

## Contributing

```bash
git clone https://github.com/RishikeshSreekumar/deadfall
cd deadfall
npm install
npm run build
npm test   # runs the engine against test/fixtures/app-router
```

The fixture exercises every edge case: dead component, barrel re-export, dynamic
import, and a test-only component.

## License

MIT — see [LICENSE](LICENSE).
