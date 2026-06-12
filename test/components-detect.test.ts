import assert from "node:assert/strict";
import { test } from "node:test";
import { Project } from "ts-morph";
import { detectDeclarations } from "../src/scan/components.js";

function kinds(source: string): Map<string, string> {
  const project = new Project({ useInMemoryFileSystem: true });
  const sf = project.createSourceFile("/proj/mod.tsx", source);
  const out = new Map<string, string>();
  for (const d of detectDeclarations("/proj", sf)) out.set(d.name, d.symbolKind);
  return out;
}

test("classifies components, functions, hooks, and glue", () => {
  const k = kinds(`
    export function Card() { return <div />; }
    export const Big = memo(() => <span />);
    export function add(a: number, b: number) { return a + b; }
    export const toUpper = (s: string) => s.toUpperCase();
    export function useThing() { return 1; }
    export const useToggle = () => false;
    export const API_URL = "https://x";
    export const config = { a: 1 };
  `);

  assert.equal(k.get("Card"), "component");
  assert.equal(k.get("Big"), "component"); // wrapper call
  assert.equal(k.get("add"), "function");
  assert.equal(k.get("toUpper"), "function"); // arrow const
  assert.equal(k.get("useThing"), "hook");
  assert.equal(k.get("useToggle"), "hook"); // arrow-const hook
  assert.equal(k.get("API_URL"), "module"); // plain value -> glue
  assert.equal(k.get("config"), "module"); // plain object -> glue
});

test("lowercase JSX-returning arrow is a function, not a component", () => {
  const k = kinds(`export const renderRow = () => <tr />;`);
  assert.equal(k.get("renderRow"), "function");
});
