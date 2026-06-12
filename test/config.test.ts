import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveConfig, createProject } from "../src/config.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRouter = path.join(here, "fixtures", "app-router");

test("resolveConfig returns an absolute root and finds the tsconfig", () => {
  const cfg = resolveConfig(appRouter);
  assert.equal(cfg.root, path.resolve(appRouter));
  assert.equal(cfg.tsConfigPath, path.join(appRouter, "tsconfig.json"));
});

test("resolveConfig leaves tsConfigPath undefined when none exists", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "deadfall-cfg-"));
  const cfg = resolveConfig(dir);
  assert.equal(cfg.tsConfigPath, undefined);
});

test("resolveConfig throws for a non-existent path", () => {
  assert.throws(
    () => resolveConfig(path.join(here, "no-such-dir-xyz")),
    /does not exist/
  );
});

test("createProject works with and without a tsconfig", () => {
  const withTs = createProject(resolveConfig(appRouter));
  assert.ok(withTs.getCompilerOptions());
  const dir = mkdtempSync(path.join(os.tmpdir(), "deadfall-proj-"));
  const without = createProject(resolveConfig(dir));
  assert.ok(without.getCompilerOptions());
});
