import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfigFile } from "../src/config/load.js";
import { mergeOption, mergeArrayOption } from "../src/config/types.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const configs = path.join(here, "fixtures", "configs");

test("loads deadfall.json", () => {
  const loaded = loadConfigFile(path.join(configs, "json"));
  assert.ok(loaded);
  assert.equal(loaded.config.project, "../../app-router");
  assert.equal(loaded.config.maxDead, 3);
  assert.deepEqual(loaded.config.ignore, ["**/legacy/**"]);
  assert.deepEqual(loaded.config.ignoreComponents, ["*Icon"]);
  assert.equal(loaded.config.includeTests, true);
  assert.equal(loaded.dir, path.join(configs, "json"));
});

test("falls back to deadfall.config.json", () => {
  const loaded = loadConfigFile(path.join(configs, "configjson"));
  assert.ok(loaded);
  assert.equal(loaded.config.framework, "next-app");
});

test("falls back to package.json deadfall key", () => {
  const loaded = loadConfigFile(path.join(configs, "pkg"));
  assert.ok(loaded);
  assert.equal(loaded.config.project, "./src");
  assert.equal(loaded.config.maxDead, 1);
});

test("deadfall.json wins over deadfall.config.json", () => {
  const loaded = loadConfigFile(path.join(configs, "both"));
  assert.ok(loaded);
  assert.equal(loaded.config.project, "./from-deadfall-json");
});

test("returns undefined when no config exists", () => {
  assert.equal(loadConfigFile(path.join(configs, "nope-missing")), undefined);
});

test("explicit --config path overrides lookup", () => {
  // cwd "both" has its own deadfall.json; the explicit path must win.
  const loaded = loadConfigFile(
    path.join(configs, "both"),
    path.join(configs, "json", "deadfall.json")
  );
  assert.ok(loaded);
  assert.equal(loaded.config.maxDead, 3);
  assert.equal(loaded.dir, path.join(configs, "json"));
});

test("missing explicit --config path throws", () => {
  assert.throws(
    () => loadConfigFile(configs, "missing.json"),
    /Config file not found/
  );
});

test("invalid JSON throws with file name", () => {
  assert.throws(
    () => loadConfigFile(path.join(configs, "invalid")),
    /Invalid JSON in .*deadfall\.json/
  );
});

test("invalid field value throws with field name", () => {
  assert.throws(
    () => loadConfigFile(path.join(configs, "badfield")),
    /"maxDead" must be a non-negative integer/
  );
});

test("mergeOption: explicit CLI value beats config", () => {
  assert.equal(mergeOption("cli", true, "file", "default"), "cli");
});

test("mergeOption: config beats commander default", () => {
  // commander supplies "compact" as the default; user did not pass the flag.
  assert.equal(mergeOption("compact", false, "json", "compact"), "json");
});

test("mergeOption: config true is not clobbered by commander default false", () => {
  assert.equal(mergeOption(false, false, true, false), true);
});

test("mergeOption: falls back to commander default, then fallback", () => {
  assert.equal(mergeOption("compact", false, undefined, "x"), "compact");
  assert.equal(mergeOption(undefined, false, undefined, "x"), "x");
});

test("mergeArrayOption concatenates config then CLI", () => {
  assert.deepEqual(mergeArrayOption(["b"], ["a"]), ["a", "b"]);
  assert.deepEqual(mergeArrayOption(undefined, ["a"]), ["a"]);
  assert.deepEqual(mergeArrayOption(["b"], undefined), ["b"]);
  assert.deepEqual(mergeArrayOption(undefined, undefined), []);
});
