import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { discoverFiles } from "../src/scan/discover.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRouter = path.join(here, "fixtures", "app-router");

const has = (files: string[], suffix: string) =>
  files.some((f) => f.endsWith(suffix));

test("discovers prod source files and skips test files by default", async () => {
  const files = await discoverFiles(appRouter);
  assert.ok(has(files, "app/page.tsx"));
  assert.ok(has(files, "components/Card.tsx"));
  assert.equal(has(files, "components/OnlyTested.test.tsx"), false);
});

test("includeTests surfaces test/story files", async () => {
  const files = await discoverFiles(appRouter, { includeTests: true });
  assert.ok(has(files, "components/OnlyTested.test.tsx"));
});

test("extraIgnores are honoured", async () => {
  const files = await discoverFiles(appRouter, {
    extraIgnores: ["**/components/**"],
  });
  assert.equal(has(files, "components/Card.tsx"), false);
  assert.ok(has(files, "app/page.tsx"));
});

test("returns absolute paths", async () => {
  const files = await discoverFiles(appRouter);
  assert.ok(files.every((f) => path.isAbsolute(f)));
});
