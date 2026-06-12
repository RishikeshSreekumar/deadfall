# How deadfall works

deadfall scans a Next.js (App Router, TypeScript) codebase, builds a graph of
which components render which, decides which components nothing reaches, and
emits a single self-contained HTML file you can open in a browser. There is no
server, no build step for the report, and no change to the project being
scanned.

This document explains the system **by layer**, in the order data flows through
it. Each layer takes the previous layer's output as its only input, so you can
understand one without holding all the others in your head.

```
target project ─┐
                │  EXTRACT  (framework-specific)
                ▼
            GraphIR  ── the frozen contract ──┐
                                              │  ANALYZE  (framework-agnostic)
                                              ▼
                                        ReportModel
                                              │  RENDER
                                              ▼
                                     report.html (offline)
```

---

## The central idea: a frozen contract splits the system in two

Everything in deadfall is organized around one data structure, `GraphIR`, and
the rule that it is a **frozen contract** between two halves of the pipeline.

- **Above the line (EXTRACT)** lives every piece of framework knowledge: how to
  find source files, what a component looks like, which files are entry points,
  what a "lazy import" call is named. Today this is implemented for Next.js App
  Router, but it is the *only* part that knows about Next.js.

- **Below the line (ANALYZE → RENDER)** lives everything else: reachability,
  dead-code classification, architecture metrics, graph layout, and HTML
  rendering. This half consumes `GraphIR` and nothing else. It has no idea which
  framework produced the graph and would run byte-for-byte unchanged against a
  Vite, Remix, or plain-React adapter.

`GraphIR` is what makes that split real. It holds these rules:

- **Stable node id format**: `` `${relativeFilePath}#${name}` ``. Every node,
  edge, root, and usage record refers to components by this string.
- **Open unions for `kind` fields.** Node kinds and edge kinds are typed as
  string unions that accept unknown values. The core treats an unknown edge kind
  as a plain reference and an unknown node kind as opaque, so a new framework can
  introduce new kinds without touching the core.
- **No core access to `meta`.** Each node carries an optional `meta` bag that is
  an adapter-only escape hatch (route path, `"use server"`, a selector, etc.).
  The framework-agnostic core never reads it.
- **Fully JSON-serializable.** No class instances, no AST nodes. `GraphIR` can be
  written to disk, diffed between runs, cached, or fed in from an entirely
  different tool.

A `GraphIR` contains: the project root, the framework name, a flat list of
nodes, a flat list of directed edges, the set of reachability roots (split into
production and test), and a map from node id to the source locations where it is
used.

Everything below is either "how we produce a `GraphIR`" or "what we do with one."

---

## Layer 1 — EXTRACT: from a project path to a GraphIR

The extract layer turns a directory on disk into a `GraphIR`. It is a shared
toolkit (file discovery, component detection, import resolution, edge building)
parameterized by a small **framework adapter** that supplies the
framework-specific decisions.

### 1a. The framework adapter

An adapter is a tiny interface with four jobs:

- `detect(root)` — does this project look like my framework? (Used for
  auto-detection.)
- `ignoreGlobs()` — extra directories to skip (e.g. `.next/`).
- `isEntryFile(relFile)` — is this file a filesystem entry point with no
  incoming import, so it must be seeded as a graph root?
- `dynamicCallNames()` — the names of lazy-import calls in this framework (e.g.
  `dynamic`, `lazy`).

The Next.js adapter implements these as:

- **Detect**: a `next.config.*` exists, or an `app/`, `src/app/`, `pages/`, or
  `src/pages/` directory exists.
- **Ignore**: `**/.next/**`.
- **Entry files**: any file whose basename is one of the App Router /
  Pages Router special names — `page`, `layout`, `template`, `loading`, `error`,
  `not-found`, `global-error`, `default`, `route`, `middleware`,
  `instrumentation`, `_app`, `_document` — *or* any file directly under a
  `pages/` directory. These are routes and framework hooks: the framework
  imports them by convention, so nothing in the user's code imports them, so
  they must be treated as roots or the whole app would look dead.
- **Dynamic calls**: `dynamic` and `lazy`.

Adapter selection: an explicit `--framework` id wins (and errors if unknown);
otherwise the first adapter whose `detect()` matches; otherwise a default. New
frameworks are added by implementing this interface and registering it — nothing
else in the codebase changes.

### 1b. Project setup and file discovery

deadfall builds a [ts-morph](https://ts-morph.com) `Project` pointed at the
target repo's own `tsconfig.json`. Reusing the project's tsconfig is what makes
path aliases work for free: `compilerOptions.paths` and `baseUrl` (e.g.
`@/components/...`) resolve exactly as they do in the real build, because we use
the same resolver the compiler uses. If the project has no tsconfig, deadfall
falls back to a permissive in-memory config (`allowJs`, React JSX, `baseUrl` =
project root).

File discovery globs for `**/*.{tsx,jsx,ts,js}` under the root and:

- respects the project's `.gitignore`,
- always ignores `node_modules`, `dist`, `build`, `out`, `coverage`, and
  `*.d.ts`,
- adds the adapter's ignore globs (e.g. `.next`),
- and, unless `--include-tests` is passed, ignores `*.test.*`, `*.spec.*`,
  `*.stories.*`, `__tests__/`, and `__mocks__/`.

That last rule is the foundation of the dead-vs-dead-in-prod distinction
discussed later: by default, test and story files do not even enter the graph,
so usage inside them cannot keep a component alive.

The discovered files are loaded into the ts-morph project so we control exactly
which files are in scope.

### 1c. Detecting components (and "glue")

deadfall walks every file's top-level declarations and records two categories of
thing:

1. **Components** — what the user cares about.
2. **Glue** — non-component declarations (config objects, custom hooks, helper
   functions) that are *not* reported to the user but are kept as graph nodes so
   that usage can flow *through* them.

The component heuristic for a top-level declaration is: its name is
**PascalCase** *and* either

- its body contains JSX (a `<jsx>` element, self-closing element, or fragment),
  or
- its initializer is a known **wrapper call**: `forwardRef`, `memo`, `dynamic`,
  `observer`, or `styled` (these wrap a component but may hide the JSX).

Declarations that fail the heuristic are still recorded, just flagged as
non-component glue. The scanner handles function declarations, `const`/`let`
variable declarations, and the default export — including unwrapping
`export default Foo` and `export default function …` to the underlying
declaration, and deriving a sensible name for anonymous default exports from the
file path (so `app/dashboard/page.tsx` becomes something like `Dashboard`).

**Why keep glue at all?** Consider a navigation config object that maps route
names to component values, imported and spread by a layout. The layout never
writes `<SettingsPanel/>` directly; it imports a config that *references*
`SettingsPanel`. If deadfall tracked only components, that link would vanish and
`SettingsPanel` would look dead. By keeping the config object as a glue node and
threading edges through it, the usage survives. (The glue nodes are collapsed
out later, in the analyze layer, so the user never sees them.)

Each detected declaration becomes a record with its stable id
(`` `${relFile}#${name}` ``), name, file, line, file-kind (prod / test / story,
inferred from the path), default-export flag, and a flag for whether it is a
real component. These records live in a **registry** indexed several ways — by
declaration node, by id, by name, and by "the default export of a given file" —
so that edge resolution can look declarations up quickly.

### 1d. Building the raw edge graph

With every declaration known, deadfall walks each file's AST again and emits
directed edges `owner → target`, where the *owner* is the nearest enclosing
tracked declaration around a usage and the *target* is the declaration being
used. Three kinds of usage produce three edge kinds:

- **`jsx`** — a `<Foo/>` or `<Foo>…</Foo>` element. The tag name is resolved to
  a declaration; if it is a real component, the source location is also recorded
  as a **usage site** (file + line) for the report's "where is this used" panel.
- **`dynamic`** — a lazy import like `dynamic(() => import('./Foo'))` or
  `lazy(() => import(...))`, where the call name matches the adapter's dynamic
  call names. The import specifier string is resolved to a file, and that file's
  default export becomes the target. Dynamic targets are also remembered
  separately, because they become reachability roots (the framework will load
  them on demand even though no static `<Tag/>` renders them).
- **`reference`** — a bare identifier used as a *value* (a config entry, a prop,
  a hook's return) that resolves to a tracked declaration. This is the edge kind
  that carries usage through glue.

Two details make this robust:

- **Symbol resolution through aliases and barrels.** Resolving a JSX tag or an
  identifier to its real declaration uses the TypeScript checker's
  `getAliasedSymbol()`, which walks import chains and re-export ("barrel")
  chains — `export * from './x'`, `export { Foo } from './foo'` — back to the
  original definition. So `@/components` aliases and barrel files resolve
  transparently to the component that actually defines the JSX. A fallback
  matches by defining file + exported name to cover default exports whose
  declaration node differs from the one indexed.
- **Reference filtering.** Not every identifier occurrence is a *use*. The edge
  builder skips identifiers in declaration/binding positions (import specifiers,
  variable names, parameters, JSX tag names handled separately), the `.member`
  side of a property access, and object-literal keys — so only genuine value
  reads become reference edges. A per-file allow-list of candidate names
  (imports plus local declarations) is computed first so the walker can skip
  symbol resolution for the overwhelming majority of identifiers that can't
  possibly point at a tracked declaration.

### 1e. Collecting roots

Finally the extract layer picks the **reachability roots** — the seed nodes from
which "used" will be computed:

- For each **production** entry file (per the adapter's `isEntryFile`), its
  default-exported component is a prod root. If there is no clear default, every
  component in that file is seeded.
- Every **dynamic-import target** is a prod root.
- Every component in a **test or story** file is a *test* root (these files are
  entry points for their test runner / story renderer, not for the app).

The output of the whole extract layer is a single frozen `GraphIR`: the node
list (projected from the registry into AST-free records), the raw edges, the
prod/test root sets, and the usage-site map.

---

## Layer 2 — ANALYZE: from a GraphIR to a ReportModel

This layer is pure and framework-agnostic. Given a `GraphIR` it produces a
`ReportModel`: the components, a cleaned-up edge set, per-component usage and
dead-state, architecture insights, and precomputed graph layouts.

### 2a. Collapsing glue into a component-only graph

The raw graph has edges that pass through glue nodes. Before anything is shown to
the user, those are collapsed into **direct component → component edges**:

For each component, do a breadth-first walk outward. When the walk reaches
another *component*, emit a direct edge and stop expanding that path. When it
reaches a *glue* node, keep walking through it, but mark every edge discovered
beyond the glue as a `reference` edge (the link is now indirect, so its precise
"jsx/dynamic" nature is no longer meaningful). Direct component → component edges
keep their original kind.

The result is a graph whose nodes are exactly the real components — which is also
a hard requirement of the renderer, since cytoscape rejects an edge pointing at a
node that isn't in the graph.

### 2b. Reachability and dead-code classification

This is the core question the tool exists to answer. Two breadth-first searches
run over the collapsed edge set:

- **`reachableProd`** = everything reachable from the prod roots.
- **`reachableTest`** = everything reachable from the test roots.

Then each component is classified:

- Reachable from a prod root → **`used`**.
- Otherwise reachable from a test/story root → **`dead-in-prod`**.
- Otherwise → **`dead`**.

Components that themselves live in test/story files are scaffolding and are
always reported `used` (they are not the subject of the audit).

Reachability is **transitive**, and that is the whole point: a component is alive
only if there is a path to it from an application entry point. A component
rendered only by an already-dead component is itself dead, and so on down the
chain. This is what lets deadfall find not just one orphan but an entire dead
subtree.

The two states map to two real-world situations:

- **`dead`** — nothing in the shipped app reaches it. A safe-to-delete candidate.
- **`dead-in-prod`** — dead in shipped code, but a test or story still renders
  it. This state only appears under `--include-tests` (otherwise test/story
  files never enter the graph, so a test-only component simply reads as plain
  `dead`). Deleting a `dead-in-prod` component means also updating the test or
  story that renders it.

### 2c. Usage counts

For each component, its recorded JSX usage sites are split into a **prod count**
and a **test count** by inspecting each site's file path. The prod count drives
node sizing in the visualization (bigger = more used); the split lets the report
show "used 12× in prod, 3× in tests."

### 2d. Architecture insights

From the collapsed component graph, deadfall derives a set of structural metrics
— all of it pure and deterministic, so the same input yields byte-identical
output (sorted iteration, lexicographic tie-breaks everywhere).

First it builds de-duplicated out- and in-adjacency, giving each component a
**fan-out** (distinct components it depends on) and **fan-in** (distinct
components that depend on it). Then:

- **Hubs.** A component is a hub if its fan-in is at or above a threshold of
  `max(2, p90 of all fan-ins, 5)` — i.e. roughly the 90th percentile, but never
  trivially low. Hubs are the heavily-shared components; deleting or changing one
  ripples widely.
- **Cycles (Tarjan SCC).** An iterative Tarjan strongly-connected-components pass
  assigns each node an SCC id. Any SCC with more than one member is a
  **dependency cycle** — components that (transitively) render each other.
- **Cohesion clusters (label propagation).** On the undirected projection of the
  graph, a deterministic label-propagation pass groups nodes that reference each
  other tightly. Each cluster reports its members, the directories they live in,
  and a **cohesion** score (intra-cluster edges ÷ total incident edges) — a proxy
  for "is this a real module?"
- **Layers.** Each node's layer is the longest path from any root through acyclic
  edges (edges whose endpoints are in different SCCs), computed by repeated
  relaxation. Roots and orphans sit at layer 0. This drives the "dependency
  layers" layout.
- **Roles.** From fan-in/fan-out and root membership each component gets a role:
  `hub`, `root` (an entry, or fan-in 0 with fan-out > 0), `orphan` (no edges
  either way — usually dead), `leaf` (depended on, depends on nothing — pure
  presentational), or `connector` (everything else).
- **Suggested moves.** A non-entry component with at least two dependents, none
  of which live in its own directory, and where ≥ 60% of dependents share a
  single *other* directory, gets a hint: "this probably belongs in `toDir`." It
  is a lightweight cohesion-based refactor suggestion.
- **Cross-directory edges.** A count of distinct edges whose endpoints live in
  different directories — a crude coupling measure.

### 2e. Precomputed layouts

The visualization must open instantly even for a 1000-plus-node graph, so **no
physics runs in the browser**. Instead the analyze layer computes node positions
**offline** for three switchable arrangements, all built on a deterministic
shelf-packing primitive (each group becomes a small grid; grids are packed
left-to-right, wrapping onto new shelves across a roughly square canvas):

- **directory** — components grouped by their source directory, most-used first
  within each group. The default. Its spatial structure mirrors the source tree,
  which is what makes a huge graph navigable.
- **layers** — components arranged by their dependency layer (rows) so the flow
  from roots downward is visible.
- **clusters** — components grouped by cohesion cluster.

The `ReportModel` that comes out of this layer carries: the components, the
collapsed edges, per-component usage and state, all three layout position maps,
the structure insights, and headline stats (total / dead / dead-in-prod).

---

## Layer 3 — RENDER: from a ReportModel to a single HTML file

The report is one self-contained HTML file with everything inlined — no server,
no CDN, no network. Rendering substitutes four things into a static HTML
template:

1. **The `ReportModel`**, serialized to JSON and inlined as data.
2. **The cytoscape library** (the bundled minified build, read off disk and
   inlined).
3. **The browser client**, a TypeScript app under `src/report/client/` that is
   bundled by esbuild into a single script and inlined.
4. **The stylesheet.**

All inlined text is made `<script>`-safe (escaping `</script` and `<!--`) so the
payload can't break out of its tag. The result is a file you can email, commit,
or open by double-clicking.

In the browser, cytoscape renders the graph using its `preset` layout — it just
places each node at the precomputed coordinates, so there is no simulation and
the file opens immediately. The client provides:

- The **directory-clustered point cloud** itself: each node is a component,
  sized by prod usage and colored by state (blue = used, red = dead, amber =
  dead-in-prod). Edges ("renders") are dashed for dynamic imports and dotted for
  value references, and are hidden in the overview to keep a large graph
  readable.
- A **left rail** to navigate: search by name, or browse a collapsible directory
  tree where each folder shows its dead count, plus filters for dead /
  dead-in-prod.
- **Focus mode**: click a component (in the tree or the graph) and the view
  zooms to that node's neighborhood with everything else dimmed, so you never
  face every edge at once. The neighborhood is **multi-level and directional** —
  choose a depth (1–5, default 2) and a direction: `dependents ↑` (what renders
  this, transitively), `dependencies ↓` (what this renders), or `both`. Raising
  the depth walks another level up or down the chain.
- A **right panel** showing the selected component's file path and its usage
  sites.
- Switchable **layout modes** (directory / layers / clusters) and color/size
  encodings (state / role / cluster; usage / fan-in / fan-out).
- An **Insights panel** surfacing the hubs, dependency cycles, and move hints
  computed in the analyze layer.
- A **light/dark toggle**, defaulting to light and remembered across reloads.

Returning to "Overview" (via the breadcrumb, a Reset action, or clicking empty
space) restores the full graph.

---

## The CLI: tying the layers together

The command line is the thin shell around the pipeline:

```bash
deadfall <project> \
  --out report.html \        # the HTML report (default deadfall.html)
  --json report.json \       # also dump the raw ReportModel as JSON (optional)
  --report structure.md \    # also write a Markdown structure report (optional)
  --framework next-app \     # force an adapter (otherwise auto-detected)
  --include-tests            # count test/story files as usage (off by default)
```

It runs `analyze(project, opts)` — which is just `extract` followed by
`analyzeIR` — writes the HTML, optionally writes the raw JSON model and a
Markdown structure report, and prints a summary to stderr: component count, dead
and dead-in-prod counts, hub / cycle / move-hint counts, and cross-directory edge
count.

The optional `--json` output is a direct consequence of `GraphIR` and
`ReportModel` being plain serializable data: the same model that renders the HTML
can be consumed by CI to fail a build on new dead code, diffed between commits,
or fed into other tooling.

---

## Known limits

A few things are deliberately out of scope or approximated, and are worth knowing
before you delete anything the tool flags:

- **Indirect usage beyond `dynamic()` / `lazy()`** — string registries, HOCs,
  components passed around purely as values — is approximated by the soft
  `reference` edge. Spot-check a flagged-dead component before deleting it.
- **`next.config` references** are not analyzed.
- The **"PascalCase + returns JSX"** heuristic can misclassify exotic factories
  or unusual styled-component patterns, either tagging a non-component as a
  component or missing a real one.

---

## Summary of the data flow

| Layer | Input | Output | Knows about the framework? |
|-------|-------|--------|----------------------------|
| EXTRACT | project path + adapter | `GraphIR` | **Yes** — only here |
| ANALYZE | `GraphIR` | `ReportModel` | No |
| RENDER | `ReportModel` | `report.html` | No |

The discipline that keeps this clean is the frozen `GraphIR` contract: all
framework-specific reasoning is pushed up into the extract layer behind a small
adapter interface, and everything valuable the tool does — reachability,
dead-code classification, architecture metrics, layout, and the interactive
report — lives below it, depending on nothing but that one JSON-shaped data
structure.
