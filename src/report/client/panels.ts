// Side-panel rendering: the right inspector, the left triage + directory-tree
// tabs, and the breadcrumb row. Each builds markup and (re)binds its own click
// handlers, which call back into the graph view's focus actions.

import { model, compById, usageById, metricById, structure, adjacency } from "./context.js";
import { byId, esc, dirOf } from "./dom.js";
import { stateColor } from "./encodings.js";
import { buildTree, treeFilterMatch } from "./graph/tree.js";
import type { TreeFilter, TreeNode } from "./graph/tree.js";
import { cascade, cascadeSizes } from "./graph/cascade.js";
import {
  MAX_INSPECTOR_SITES,
  MAX_HUBS,
  MAX_TRIAGE_DEAD,
  MAX_CASCADE_LIST,
} from "./constants.js";
import { focusNode, focusCycle, focusDirGroup, focusFileGroup, resetView } from "./cy-view.js";
import type { SymbolKind } from "../model.js";

/** Single-char glyph shown before a symbol name in the tree. */
const KIND_GLYPH: Record<SymbolKind, string> = {
  component: "C",
  function: "ƒ",
  hook: "H",
};
function kindGlyph(kind: SymbolKind | undefined): string {
  const k = kind ?? "component";
  return '<i class="kind k-' + k + '" title="' + k + '">' + KIND_GLYPH[k] + "</i>";
}

// ---- deletion cascade ----

/** A component may join a cascade when it is dead-ish and not kept on purpose. */
function deletable(id: string): boolean {
  const state = usageById.get(id)?.state;
  if (state !== "dead" && state !== "dead-in-prod") return false;
  return !compById.get(id)?.ignored;
}

function deadIds(): string[] {
  return model.usage
    .filter((u) => (u.state === "dead" || u.state === "dead-in-prod") && !compById.get(u.id)?.ignored)
    .map((u) => u.id);
}

// ---- editor links ----

/** vscode deep link to a file:line under the scanned project root. */
function editorHref(file: string, line: number): string {
  const root = model.projectRoot.replace(/\/+$/, "");
  return "vscode://file/" + root + "/" + file + ":" + line;
}

function fileLink(file: string, line: number): string {
  return (
    '<a class="floc" href="' + esc(editorHref(file, line)) + '" title="open in editor">' +
    esc(file) + ":" + line + "</a>"
  );
}

// ---- right inspector ----

const panel = () => byId("panel");

function bindJumps(root: HTMLElement): void {
  root.querySelectorAll("a.jump").forEach((a) => {
    a.addEventListener("click", () => focusNode(a.getAttribute("data-id")!));
  });
}

function navList(ids: string[]): string {
  if (!ids || ids.length === 0) return '<div class="muted">none</div>';
  return (
    '<ul class="navlist">' +
    ids
      .slice()
      .sort((a, b) => (compById.get(a)?.name || a).localeCompare(compById.get(b)?.name || b))
      .map((id) => {
        const c = compById.get(id) || { name: id };
        const u = usageById.get(id);
        return (
          '<li><i class="sw" style="background:' +
          stateColor(u?.state) +
          '"></i>' +
          '<a class="jump" data-id="' +
          esc(id) +
          '">' +
          esc(c.name) +
          "</a></li>"
        );
      })
      .join("") +
    "</ul>"
  );
}

/** "Deletable together" section for a dead component (empty string if none). */
function cascadeHtml(id: string): string {
  if (!deletable(id)) return "";
  const ids = cascade(adjacency, id, deletable);
  if (!ids.length)
    return '<div class="row"><b>Deletable together</b><div class="muted">nothing else — only this component goes</div></div>';
  const shown = ids.slice(0, MAX_CASCADE_LIST);
  const more = ids.length - shown.length;
  return (
    '<div class="row cascade"><b>Deletable together (' + ids.length + ")</b>" +
    '<div class="muted">deleting this also frees:</div>' +
    navList(shown) +
    (more > 0 ? '<div class="muted">…and ' + more + " more</div>" : "") +
    "</div>"
  );
}

/** Render the inspector for one component. */
export function showInspector(id: string): void {
  const c = compById.get(id);
  if (!c) return;
  const u = usageById.get(id);
  const m = metricById.get(id);
  const bcls = u?.state === "dead" ? "b-dead" : u?.state === "dead-in-prod" ? "b-dip" : "b-used";
  const deps = Array.from(adjacency.outAdj.get(id) || []);
  const dependents = Array.from(adjacency.inAdj.get(id) || []);
  const sites = (u?.sites || [])
    .slice(0, MAX_INSPECTOR_SITES)
    .map((s) => "<li>" + fileLink(s.file, s.line) + "</li>")
    .join("");
  panel().innerHTML =
    "<h2>" + esc(c.name) + "</h2>" +
    '<div class="muted">' + fileLink(c.file, c.line) + "</div>" +
    '<div class="row"><span class="badge ' + bcls + '">' + (u?.state || "") + "</span> " +
    '<span class="badge b-kind">' + esc(c.symbolKind) + "</span> " +
    '<span class="badge b-role">' + (m?.role || "n/a") + "</span></div>" +
    '<div class="row">fan-in <b>' + (m?.fanIn || 0) + "</b> · fan-out <b>" + (m?.fanOut || 0) + "</b><br>" +
    "prod usages <b>" + (u?.prodCount || 0) + "</b> · test/story <b>" + (u?.testCount || 0) + "</b></div>" +
    cascadeHtml(id) +
    '<div class="row"><b>Dependencies (' + deps.length + ")</b>" + navList(deps) + "</div>" +
    '<div class="row"><b>Dependents (' + dependents.length + ")</b>" + navList(dependents) + "</div>" +
    (sites ? '<div class="row"><b>used at:</b><ul>' + sites + "</ul></div>" : "");
  bindJumps(panel());
}

/** Summary panel for an expanded directory bubble. */
export function showDirPanel(dir: string): void {
  const members = model.components.filter((c) => dirOf(c.file) === dir);
  const dead = members.filter((c) => deletable(c.id));
  panel().innerHTML =
    "<h2>" + esc(dir) + "/</h2>" +
    '<div class="muted">' + members.length + " component" + (members.length === 1 ? "" : "s") +
    (dead.length ? " · " + dead.length + " dead" : "") + "</div>" +
    (dead.length
      ? '<div class="row"><b>Dead here (' + dead.length + ")</b>" + navList(dead.map((c) => c.id)) + "</div>"
      : '<div class="row muted">nothing dead in this directory 🎉</div>');
  bindJumps(panel());
}

/** Replace the inspector with arbitrary markup (group/cycle summaries). */
export function setPanelHtml(html: string, withJumps = false): void {
  panel().innerHTML = html;
  if (withJumps) bindJumps(panel());
}

// ---- breadcrumbs ----

export interface Crumb {
  label: string;
}

export interface CrumbAction {
  label: string;
  onClick: () => void;
}

export function setCrumbs(items: Crumb[] | null, actions: CrumbAction[] = []): void {
  const el = byId("crumbs");
  if (!items) {
    el.innerHTML = '<span class="cur">Overview — click a bubble or a component to dig in</span>';
    return;
  }
  let html = '<span class="crumb" data-reset="1">Overview</span>';
  items.forEach((it) => {
    html += ' <span class="muted">›</span> <span class="cur">' + esc(it.label) + "</span>";
  });
  actions.forEach((a, i) => {
    html += ' <button class="crumb-act" data-act="' + i + '">' + esc(a.label) + "</button>";
  });
  el.innerHTML = html;
  const r = el.querySelector("[data-reset]");
  if (r) r.addEventListener("click", () => resetView());
  el.querySelectorAll(".crumb-act").forEach((b) => {
    b.addEventListener("click", () => actions[Number(b.getAttribute("data-act"))].onClick());
  });
}

// ---- left-rail tabs ----

export type RailTab = "triage" | "tree";

export function setActiveTab(which: RailTab): void {
  byId("tab-triage").classList.toggle("on", which === "triage");
  byId("tab-tree").classList.toggle("on", which === "tree");
  byId("triage").style.display = which === "triage" ? "block" : "none";
  byId("tree").style.display = which === "tree" ? "block" : "none";
  byId("navhint").style.display = which === "tree" ? "block" : "none";
}

// ---- directory tree ----
//
// Two render paths:
//   - Default (no filter, no query): lazy. Only top-level directory summaries
//     are built; each level's children are rendered the first time it opens.
//     On large graphs this avoids materialising thousands of leaf rows up front
//     and rebuilding them on every keystroke.
//   - Filtered/searching: eager. The matching subset is small, so the whole
//     (auto-expanded) subtree is rendered with match counts.

const fullTree: TreeNode = buildTree(model, usageById);

function leafHtml(c: TreeNode["comps"][number]): string {
  return (
    '<div class="leaf" data-id="' + esc(c.id) + '">' +
    '<i class="sw" style="background:' + stateColor(c.state) + '"></i>' +
    kindGlyph(c.kind) +
    '<span class="lname">' + esc(c.name) + "</span></div>"
  );
}

function dirCounts(node: TreeNode): string {
  return (
    '<span class="cnt">' +
    (node.dead ? '<span class="d" title="dead">' + node.dead + "✗</span>" : "") +
    "</span>"
  );
}

/** Resolve a tree node from a "/"-joined directory path. */
function nodeByPath(segs: string[]): TreeNode | null {
  let n: TreeNode | undefined = fullTree;
  for (const s of segs) {
    n = n.dirs.get(s);
    if (!n) return null;
  }
  return n;
}

function bindLeaf(el: Element): void {
  el.addEventListener("click", () => focusNode(el.getAttribute("data-id")!));
}
function bindFname(el: Element): void {
  el.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    const file = el.getAttribute("data-file");
    if (file !== null) focusFileGroup(file);
    else focusDirGroup(el.getAttribute("data-dir")!);
  });
}

/** Summary row markup for a directory or file node (shared lazy/eager). */
function summaryHtml(node: TreeNode, full: string, label: string): string {
  if (node.isFile) {
    return (
      '<summary><span class="tw">▸</span>' +
      '<span class="fname file" data-file="' + esc(full) + '">' + esc(label) + "</span>" +
      dirCounts(node) + "</summary>"
    );
  }
  return (
    '<summary><span class="tw">▸</span>' +
    '<span class="fname" data-dir="' + esc(full) + '">' + esc(label) + "/</span>" +
    dirCounts(node) + "</summary>"
  );
}

/** Bind the direct-child leaves and directories of a container (lazy or eager). */
function wireTreeChildren(container: Element, lazy: boolean): void {
  container.querySelectorAll(":scope > .leaf").forEach(bindLeaf);
  container.querySelectorAll(":scope > details.dir").forEach((d) => {
    const det = d as HTMLDetailsElement;
    const fname = det.querySelector(":scope > summary .fname");
    if (fname) bindFname(fname);
    const tw = det.querySelector(":scope > summary .tw")!;
    const sync = () => {
      tw.textContent = det.open ? "▾" : "▸";
    };
    sync();
    det.addEventListener("toggle", () => {
      sync();
      if (lazy && det.open && det.dataset.filled !== "1") {
        const node = nodeByPath((det.dataset.path || "").split("/"));
        const kids = det.querySelector(":scope > .kids");
        if (node && kids) {
          kids.innerHTML = lazyChildrenHtml(node, (det.dataset.path || "").split("/"));
          det.dataset.filled = "1";
          wireTreeChildren(kids, true);
        }
      }
    });
  });
}

/** Collapsed directory summary with an empty (lazily-filled) body. */
function lazyDirHtml(node: TreeNode, pathSegs: string[]): string {
  const full = pathSegs.join("/");
  const label = pathSegs[pathSegs.length - 1];
  const cls = node.isFile ? "dir file" : "dir";
  return (
    '<details class="' + cls + '" data-path="' + esc(full) + '">' +
    summaryHtml(node, full, label) +
    '<div class="kids"></div></details>'
  );
}

/** Immediate children (sub-dir summaries + leaves) of a node, for lazy fill. */
function lazyChildrenHtml(node: TreeNode, pathSegs: string[]): string {
  let h = "";
  Array.from(node.dirs.keys())
    .sort()
    .forEach((k) => {
      h += lazyDirHtml(node.dirs.get(k)!, pathSegs.concat(k));
    });
  node.comps
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((c) => {
      h += leafHtml(c);
    });
  return h;
}

function renderTreeLazy(tree: HTMLElement): void {
  tree.innerHTML = lazyChildrenHtml(fullTree, []) || '<div class="ins-empty">no matches</div>';
  byId("navhint").textContent = fullTree.total + " symbol" + (fullTree.total === 1 ? "" : "s") + " shown";
  wireTreeChildren(tree, true);
}

function renderTreeEager(tree: HTMLElement, f: TreeFilter, q: string): void {
  let shown = 0;
  function leaf(c: TreeNode["comps"][number]): string {
    if (!treeFilterMatch(c.state, f)) return "";
    if (q && c.name.toLowerCase().indexOf(q) < 0) return "";
    shown++;
    return leafHtml(c);
  }
  function dirHtml(node: TreeNode, pathSegs: string[]): string {
    let inner = "";
    Array.from(node.dirs.keys())
      .sort()
      .forEach((k) => {
        inner += dirHtml(node.dirs.get(k)!, pathSegs.concat(k));
      });
    node.comps
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((c) => {
        inner += leaf(c);
      });
    if (inner === "") return "";
    const full = pathSegs.join("/");
    const label = pathSegs.length ? pathSegs[pathSegs.length - 1] : ".";
    const cls = node.isFile ? "dir file" : "dir";
    return (
      '<details class="' + cls + '" open>' +
      summaryHtml(node, full, label) +
      '<div class="kids">' + inner + "</div></details>"
    );
  }

  let html = "";
  Array.from(fullTree.dirs.keys())
    .sort()
    .forEach((k) => {
      html += dirHtml(fullTree.dirs.get(k)!, [k]);
    });
  fullTree.comps
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((c) => {
      html += leaf(c);
    });

  tree.innerHTML = html || '<div class="ins-empty">no matches</div>';
  byId("navhint").textContent = shown + " symbol" + (shown === 1 ? "" : "s") + " shown";
  wireTreeChildren(tree, false);
  // Eager subtrees are pre-rendered, so bind every nested level too.
  tree.querySelectorAll(".kids").forEach((k) => wireTreeChildren(k, false));
}

export function renderTree(): void {
  const f = (byId<HTMLSelectElement>("filter").value as TreeFilter) || "all";
  const q = byId<HTMLInputElement>("search").value.trim().toLowerCase();
  const tree = byId("tree");
  if (f === "all" && q === "") renderTreeLazy(tree);
  else renderTreeEager(tree, f, q);
}

// ---- triage panel (default tab: the answers, ranked) ----

function triageRow(id: string, meta: string): string {
  const c = compById.get(id) || { name: id };
  const u = usageById.get(id);
  return (
    '<div class="ins-row" data-id="' + esc(id) + '">' +
    '<i class="sw" style="background:' + stateColor(u?.state) + '"></i>' +
    '<span class="name">' + esc(c.name) + '</span><span class="meta">' + meta + "</span></div>"
  );
}

export function renderTriage(): void {
  let html = "";

  // Dead in prod: shipped code nothing in prod renders — the loudest finding.
  const dip = model.usage.filter((u) => u.state === "dead-in-prod").map((u) => u.id);
  html += '<div class="ins-sec"><h3>Dead in prod · ' + dip.length + "</h3>";
  if (!dip.length) html += '<div class="ins-empty">none — prod tree is clean</div>';
  else
    html += dip
      .slice()
      .sort((a, b) => (usageById.get(b)?.testCount || 0) - (usageById.get(a)?.testCount || 0))
      .map((id) => triageRow(id, (usageById.get(id)?.testCount || 0) + " test uses"))
      .join("");
  html += "</div>";

  // Dead components ranked by cascade size: biggest deletion payoff first.
  const dead = deadIds();
  const sizes = cascadeSizes(adjacency, dead, deletable);
  const ranked = dead
    .slice()
    .sort(
      (a, b) =>
        (sizes.get(b) || 0) - (sizes.get(a) || 0) ||
        (compById.get(a)?.name || a).localeCompare(compById.get(b)?.name || b)
    );
  html += '<div class="ins-sec"><h3>Dead code · ' + dead.length + "</h3>";
  if (!dead.length) html += '<div class="ins-empty">nothing dead 🎉</div>';
  else {
    html += '<div class="ins-sub">ranked by deletion payoff — "+N" comes along free</div>';
    html += ranked
      .slice(0, MAX_TRIAGE_DEAD)
      .map((id) => {
        const n = sizes.get(id) || 0;
        return triageRow(id, n ? "+" + n + " with it" : "");
      })
      .join("");
    if (ranked.length > MAX_TRIAGE_DEAD)
      html += '<div class="ins-empty">…and ' + (ranked.length - MAX_TRIAGE_DEAD) + " more in the tree tab</div>";
  }
  html += "</div>";

  // Cycles
  html += '<div class="ins-sec"><h3>Cycles · ' + structure.cycles.length + "</h3>";
  if (!structure.cycles.length) html += '<div class="ins-empty">graph is acyclic 🎉</div>';
  else
    html += structure.cycles
      .map((cyc, i) => {
        const names = cyc.map((id) => (compById.get(id) || { name: id }).name);
        return (
          '<div class="ins-row" data-cycle="' + i + '"><span class="name">' +
          esc(names.join(" → ")) + '</span><span class="meta">' + cyc.length + "</span></div>"
        );
      })
      .join("");
  html += "</div>";

  // Hubs
  html += '<div class="ins-sec"><h3>Hubs · ' + structure.hubs.length + "</h3>";
  if (!structure.hubs.length) html += '<div class="ins-empty">no hub crosses the threshold</div>';
  else
    html += structure.hubs
      .slice(0, MAX_HUBS)
      .map((id) => {
        const m = metricById.get(id);
        return triageRow(id, "in " + (m?.fanIn || 0) + " · out " + (m?.fanOut || 0));
      })
      .join("");
  html += "</div>";

  // Moves
  html += '<div class="ins-sec"><h3>Move hints · ' + structure.suggestedMoves.length + "</h3>";
  if (!structure.suggestedMoves.length)
    html += '<div class="ins-empty">components sit with their dependents</div>';
  else
    html += structure.suggestedMoves
      .map((mv) => {
        const c = compById.get(mv.id) || { name: mv.id };
        return (
          '<div class="ins-row" data-id="' + esc(mv.id) + '"><span class="name">' + esc(c.name) +
          '</span><span class="meta">' + Math.round(mv.share * 100) + "%</span>" +
          '</div><div class="ins-sub" style="padding:0 6px 4px">' + esc(mv.fromDir) + " → " + esc(mv.toDir) + "</div>"
        );
      })
      .join("");
  html += "</div>";

  const triEl = byId("triage");
  triEl.innerHTML = html;
  triEl.querySelectorAll(".ins-row[data-id]").forEach((el) => {
    el.addEventListener("click", () => focusNode(el.getAttribute("data-id")!));
  });
  triEl.querySelectorAll(".ins-row[data-cycle]").forEach((el) => {
    el.addEventListener("click", () => focusCycle(structure.cycles[Number(el.getAttribute("data-cycle"))]));
  });
}
