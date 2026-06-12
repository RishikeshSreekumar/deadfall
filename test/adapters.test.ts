import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  adapterNames,
  getAdapter,
  selectAdapter,
  DEFAULT_ADAPTER,
} from "../src/adapters/index.js";
import { nextAppAdapter } from "../src/adapters/next-app.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRouter = path.join(here, "fixtures", "app-router");

test("registry lists the next-app adapter", () => {
  assert.ok(adapterNames().includes("next-app"));
});

test("getAdapter resolves known ids and rejects unknown ones", () => {
  assert.equal(getAdapter("next-app"), nextAppAdapter);
  assert.equal(getAdapter("does-not-exist"), undefined);
});

test("selectAdapter honours an explicit framework id", () => {
  const { adapter, reason } = selectAdapter(appRouter, "next-app");
  assert.equal(adapter, nextAppAdapter);
  assert.equal(reason, "explicit");
});

test("selectAdapter throws on an unknown explicit id", () => {
  assert.throws(() => selectAdapter(appRouter, "nope"), /Unknown framework/);
});

test("selectAdapter auto-detects next-app from an app/ directory", () => {
  const { adapter, reason } = selectAdapter(appRouter);
  assert.equal(adapter, nextAppAdapter);
  assert.equal(reason, "detected");
});

test("selectAdapter falls back to the default for an unrecognized project", () => {
  const empty = mkdtempSync(path.join(os.tmpdir(), "deadfall-empty-"));
  const { adapter, reason } = selectAdapter(empty);
  assert.equal(adapter, DEFAULT_ADAPTER);
  assert.equal(reason, "default");
});

test("nextApp detect: true for app/ fixture, false for a bare dir", () => {
  assert.equal(nextAppAdapter.detect(appRouter), true);
  const empty = mkdtempSync(path.join(os.tmpdir(), "deadfall-bare-"));
  assert.equal(nextAppAdapter.detect(empty), false);
});

test("nextApp isEntryFile recognizes App Router special files", () => {
  for (const f of [
    "app/page.tsx",
    "app/layout.tsx",
    "app/dashboard/loading.tsx",
    "app/error.tsx",
    "app/not-found.tsx",
    "app/api/route.ts",
    "middleware.ts",
  ]) {
    assert.equal(nextAppAdapter.isEntryFile(f), true, `${f} should be an entry`);
  }
});

test("nextApp isEntryFile recognizes any file under pages/", () => {
  assert.equal(nextAppAdapter.isEntryFile("pages/index.tsx"), true);
  assert.equal(nextAppAdapter.isEntryFile("src/pages/about.tsx"), true);
});

test("nextApp isEntryFile is false for ordinary components", () => {
  assert.equal(nextAppAdapter.isEntryFile("components/Card.tsx"), false);
  assert.equal(nextAppAdapter.isEntryFile("lib/util.ts"), false);
});

test("nextApp dynamic call names and ignore globs", () => {
  const calls = nextAppAdapter.dynamicCallNames();
  assert.ok(calls.has("dynamic"));
  assert.ok(calls.has("lazy"));
  assert.deepEqual(nextAppAdapter.ignoreGlobs(), ["**/.next/**"]);
});
