import assert from "node:assert/strict";
import { test } from "node:test";
import { fuzzyScore, searchComponents } from "../src/report/client/search.js";

test("exact substring beats subsequence", () => {
  assert.ok(fuzzyScore("btn", "btnGroup") > fuzzyScore("btn", "BigTreeNode"));
});

test("earlier substring beats later", () => {
  assert.ok(fuzzyScore("card", "CardList") > fuzzyScore("card", "ProfileCard"));
});

test("subsequence matches across gaps", () => {
  assert.ok(fuzzyScore("btn", "Button") >= 0);
});

test("non-matches return -1", () => {
  assert.equal(fuzzyScore("xyz", "Button"), -1);
  assert.equal(fuzzyScore("", "Button"), -1);
});

test("case-insensitive", () => {
  assert.ok(fuzzyScore("BUTTON", "button") >= 0);
});

test("searchComponents sorts by score then name and respects limit", () => {
  const items = [
    { id: "1", name: "ProfileCard" },
    { id: "2", name: "Card" },
    { id: "3", name: "CardList" },
    { id: "4", name: "Sidebar" },
  ];
  const hits = searchComponents("card", items, 2);
  assert.equal(hits.length, 2);
  assert.equal(hits[0].name, "Card");
  assert.equal(hits[1].name, "CardList");
});
