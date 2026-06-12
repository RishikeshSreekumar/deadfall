# deadfall

Find the dead React components in your Next.js app — and prove it before you
delete them.

deadfall maps your codebase (App Router, TypeScript) into a component usage
graph, then tells you which components nothing actually renders. Use it from
the terminal as a CI gate, or open the interactive HTML report to explore your
component architecture. It never modifies your project unless you explicitly
ask it to (`--fix`), and it needs no server, no build step, and no changes to
your code.

## Quick start

```bash
# see your dead components right now
npx deadfall check /path/to/your/next-app
```

```
dead (5)
  components/GhostIcon.tsx:3 GhostIcon
  components/OnlyTested.tsx:2 OnlyTested
  components/OrphanChild.tsx:2 OrphanChild
  ...

15 components, 5 dead
```

Exit code is `1` when anything is dead, so the same command works as a CI
gate. Prefer a picture? Generate the interactive report instead:

```bash
npx deadfall report /path/to/your/next-app --out report.html
```

Install globally if you use it often:

```bash
npm install -g deadfall
```

## The two commands

| Command | What you get |
|---------|--------------|
| `deadfall check <project>` | terminal listing of dead components + CI-friendly exit codes |
| `deadfall report <project>` | self-contained interactive HTML graph of every component |

`report` is the default, so plain `deadfall <project>` works too.

> Edge case: a project directory literally named `check` or `report` is parsed
> as the subcommand — disambiguate with `deadfall report ./check`.

## Using `check`

### Pick your output format

```bash
deadfall check ./app                      # human-readable (default)
deadfall check ./app --reporter json      # machine-readable, pipe to jq
deadfall check ./app --reporter markdown  # paste into a PR comment
deadfall check ./app --reporter github    # GitHub Actions annotations
```

Progress messages go to stderr, results to stdout — so
`deadfall check ./app --reporter json | jq '.dead[].file'` just works.

### Gate your CI

```bash
deadfall check ./app               # fails the build if anything is dead
deadfall check ./app --max-dead 5  # tolerate up to 5 issues
```

Exit codes:

| Code | Meaning |
|------|---------|
| 0 | clean (or within `--max-dead`, or all issues baselined) |
| 1 | dead components found |
| 2 | something went wrong (bad flag, missing path, invalid config) |

### Adopting on an existing codebase? Use a baseline

Don't fix 200 components before you can turn the check on. Snapshot today's
debt and only fail on *new* dead components:

```bash
# once: record the current state
deadfall check ./app --baseline deadfall-baseline.json --update-baseline

# in CI: only newly-dead components fail
deadfall check ./app --baseline deadfall-baseline.json
```

Commit the baseline file. Delete entries (or re-run `--update-baseline`) as
you pay the debt down. Baseline entries are keyed by `path#ComponentName`, so
moving or renaming a file re-flags its components — the baseline never
silently grows.

### Keep components on purpose

Not everything unreferenced is garbage — design-system exports, components
looked up via string registries, things you're about to wire up. Three ways to
tell deadfall to leave them alone:

```tsx
// deadfall-ignore: public API of the design system
export const Button = () => <button />;
```

```bash
deadfall check ./app --ignore-components '*Icon'    # by name pattern
deadfall check ./app --ignore '**/legacy/**'        # skip files entirely
```

An ignored component counts as *alive*, and so does everything it renders — so
ignoring a wrapper never leaves its children falsely flagged.

### Let deadfall delete for you (`--fix`)

```bash
deadfall check ./app --fix-dry-run   # show what would be deleted, touch nothing
deadfall check ./app --fix           # delete (requires a clean git tree)
```

`--fix` is deliberately conservative. It deletes **whole files only**, and only
when every declaration in the file is dead, nothing in it is ignored, and no
other file imports it at all — including barrel re-exports, type-only imports,
and side-effect imports. Everything else is listed as skipped with the reason,
for you to clean up by hand. It refuses to run on a dirty (or absent) git tree
unless you pass `--allow-dirty`, so every deletion is one `git checkout` away
from undo.

## Using `report`

```bash
deadfall report ./app -o report.html              # the interactive graph
deadfall report ./app -o report.html -j model.json -r structure.md
```

Open `report.html` in any browser — it's fully self-contained and opens
instantly (layout is precomputed, no in-browser physics). You get:

- a **directory-clustered map** of every component — size ∝ usage; blue =
  used, red = dead, amber = dead-in-prod
- **search + directory tree** with per-folder dead counts
- **focus mode** — click any component to see what renders it and what it
  renders, transitively, with depth and direction controls
- **architecture insights** — hubs, dependency cycles, cohesion clusters, and
  "this component probably belongs in that directory" hints
- a light/dark toggle that remembers your choice

`-j model.json` dumps the raw analysis for your own scripting; `-r structure.md`
writes a Markdown architecture summary that's handy as a CI artifact.

## Configuration file

Both commands read an optional config so your CI scripts stay short. Lookup
order (first hit wins): `--config <path>` → `deadfall.json` →
`deadfall.config.json` → a `"deadfall"` key in `package.json`. CLI flags beat
config values; list options (`ignore`, `ignoreComponents`) combine.

```jsonc
{
  "project": "./",                      // analyzed path, relative to the config file
  "framework": "next-app",
  "includeTests": false,
  "ignore": ["**/legacy/**"],           // extra file ignore globs
  "ignoreComponents": ["*Icon"],        // component name patterns to keep
  "maxDead": 0,                          // check: issue tolerance
  "reporter": "compact",                 // check: default reporter
  "baseline": "deadfall-baseline.json",  // check: default baseline file
  "out": "deadfall.html",                // report: HTML path
  "json": "model.json",                  // report: raw model path
  "report": "structure.md"               // report: Markdown structure path
}
```

With `project` set, `deadfall check` with no arguments just works.

## What counts as dead?

A component is **used** only if it's reachable from an application entry point
(an App Router `page`/`layout`/etc., or a `dynamic()` import). Reachability is
transitive: a component rendered only by a dead component is itself dead.

- **dead** — no entry point reaches it. Safe-to-delete candidate.
- **dead-in-prod** — dead in shipped code, but a test or story renders it.
  Only appears with `--include-tests`; deleting it means updating that test too.

By default `*.test.*`, `*.spec.*`, `*.stories.*`, `__tests__/`, and
`__mocks__/` are excluded — a component used only by tests is reported as
plain `dead`. Pass `--include-tests` to count them and surface the
`dead-in-prod` distinction.

Under the hood, deadfall uses the TypeScript compiler to resolve every JSX tag
to its real definition — through `tsconfig` path aliases, barrel re-exports,
and `dynamic()`/`lazy()` imports — so the graph reflects what actually renders,
not a text search.

## Known limits

- Dynamic or indirect usage beyond `dynamic()`/`lazy()` (string registries,
  HOCs, components passed around as values) is approximated by a soft
  "reference" edge — spot-check flagged components before deleting, or mark
  them `// deadfall-ignore`.
- `next.config` references are out of scope.
- The `PascalCase + returns JSX` heuristic can mis-tag exotic factories or
  styled-component patterns.

`--fix` is built so these limits can't hurt you: any import at all — even one
the component graph missed — blocks deletion.

## Contributing

```bash
git clone https://github.com/RishikeshSreekumar/deadfall
cd deadfall
npm install
npm run build
npm test
```

The test fixtures exercise every edge case: dead components, barrel re-exports,
dynamic imports, ignore directives, baselines, and `--fix` safety rules.

## License

MIT — see [LICENSE](LICENSE).
