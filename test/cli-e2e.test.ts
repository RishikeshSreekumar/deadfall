// End-to-end CLI tests: spawn src/cli.ts (via tsx) against real fixtures and
// assert on exit codes and stdout/stderr, the contract CI users depend on.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = path.join(repoRoot, "src", "cli.ts");
const appRouter = path.join(repoRoot, "test", "fixtures", "app-router");

function runCli(args: string[], opts: { cwd?: string } = {}) {
  const res = spawnSync(
    process.execPath,
    ["--import", "tsx", cliPath, ...args],
    {
      cwd: opts.cwd ?? repoRoot,
      encoding: "utf8",
      env: { ...process.env, NO_COLOR: "1" },
    }
  );
  return { status: res.status, stdout: res.stdout, stderr: res.stderr };
}

test("check lists dead components and exits 1", () => {
  const { status, stdout } = runCli(["check", appRouter]);
  assert.equal(status, 1);
  assert.match(stdout, /dead \(\d+\)/);
  assert.match(stdout, /components\/Unused\.tsx:\d+ Unused/);
});

test("check --max-dead above issue count exits 0", () => {
  const { status, stdout } = runCli(["check", appRouter, "--max-dead", "99"]);
  assert.equal(status, 0);
  assert.match(stdout, /dead/);
});

test("check --reporter json: stdout is pure parseable JSON", () => {
  const { status, stdout } = runCli(["check", appRouter, "--reporter", "json"]);
  assert.equal(status, 1);
  const parsed = JSON.parse(stdout);
  assert.ok(Array.isArray(parsed.dead));
  assert.ok(parsed.dead.some((i: { name: string }) => i.name === "Unused"));
  assert.equal(typeof parsed.counts.total, "number");
});

test("check with unknown reporter exits 2", () => {
  const { status, stderr } = runCli(["check", appRouter, "--reporter", "nope"]);
  assert.equal(status, 2);
  assert.match(stderr, /Unknown reporter "nope"/);
});

test("check without project path exits 2", () => {
  const { status, stderr } = runCli(["check"]);
  assert.equal(status, 2);
  assert.match(stderr, /No project path/);
});

test("baseline workflow: --update-baseline then --baseline exits 0", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "deadfall-baseline-"));
  try {
    const baseline = path.join(dir, "deadfall-baseline.json");
    const update = runCli([
      "check", appRouter, "--baseline", baseline, "--update-baseline",
    ]);
    assert.equal(update.status, 0);
    assert.ok(existsSync(baseline));

    const recheck = runCli(["check", appRouter, "--baseline", baseline]);
    assert.equal(recheck.status, 0);
    assert.match(recheck.stdout, /baselined/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("missing baseline file exits 2 with a hint", () => {
  const { status, stderr } = runCli([
    "check", appRouter, "--baseline", "no-such-baseline.json",
  ]);
  assert.equal(status, 2);
  assert.match(stderr, /--update-baseline/);
});

test("--fix-dry-run lists deletions without deleting; --fix deletes", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "deadfall-fix-"));
  try {
    const proj = path.join(dir, "fixable");
    cpSync(path.join(repoRoot, "test", "fixtures", "fixable"), proj, {
      recursive: true,
    });
    const orphan = path.join(proj, "components", "Orphan.tsx");

    const dry = runCli(["check", proj, "--fix-dry-run"]);
    assert.equal(dry.status, 1);
    assert.match(dry.stderr, /would delete 1 file/);
    assert.match(dry.stderr, /components\/Orphan\.tsx/);
    assert.ok(existsSync(orphan), "dry run must not delete");

    // tmp copy is not a git repo, so --fix needs --allow-dirty.
    const noDirty = runCli(["check", proj, "--fix"]);
    assert.equal(noDirty.status, 2);
    assert.match(noDirty.stderr, /git/);
    assert.ok(existsSync(orphan));

    const fix = runCli(["check", proj, "--fix", "--allow-dirty"]);
    assert.equal(fix.status, 1); // BarrelDead + DeadHalf remain
    assert.ok(!existsSync(orphan), "expected Orphan.tsx to be deleted");
    assert.match(fix.stderr, /deleted 1 file/);

    const recheck = runCli(["check", proj, "--reporter", "json"]);
    assert.equal(recheck.status, 1);
    const parsed = JSON.parse(recheck.stdout);
    assert.ok(
      !parsed.dead.some((i: { name: string }) => i.name === "Orphan"),
      "Orphan should be gone after --fix"
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("bare `deadfall <project>` still writes the HTML report (default command)", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "deadfall-e2e-"));
  try {
    const out = path.join(dir, "report.html");
    const { status, stderr } = runCli([appRouter, "-o", out]);
    assert.equal(status, 0);
    assert.ok(existsSync(out), "expected HTML report to be written");
    assert.match(stderr, /report →/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
