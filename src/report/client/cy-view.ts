// The cytoscape view: sole owner of the graph instance and every operation that
// touches it (encoding, layout switching, focus/ego, filtering, search
// highlight, theme, zoom, tooltip). Pure graph logic lives in ./graph and
// ./encodings; this module maps it onto cytoscape elements and the DOM.

import type { NodePosition } from "../model.js";
import { model, compById, usageById, metricById, layouts, adjacency } from "./context.js";
import { buildNodes, buildAllLabels, buildEdges } from "./elements.js";
import { nodeColor, nodeSize, legendHtml } from "./encodings.js";
import { ego, edgeKey } from "./graph/ego.js";
import { byId, cssVar, esc } from "./dom.js";
import { getState, setState } from "./state.js";
import {
  GRID_SPACING,
  FIT_PAD_FOCUS,
  FIT_PAD_GROUP,
  FIT_PAD_OVERVIEW,
  ANIM_FOCUS_MS,
  ANIM_ZOOM_MS,
  ANIM_FIT_MS,
  ZOOM_STEP,
  TIP_OFFSET,
  TIP_WIDTH,
  TIP_FLIP_MARGIN,
  LOD_NODE_THRESHOLD,
  LABEL_MIN_ZOOM_FONT,
  LABEL_MIN_ZOOM_FONT_LARGE,
} from "./constants.js";
import { showInspector, setPanelHtml, setActiveTab, setCrumbs } from "./panels.js";

declare const cytoscape: any;

let cy: any = null;
let basePos: Record<string, NodePosition> = {};
const edgesByKey = new Map<string, any>(); // edgeKey -> cytoscape edge collection
const cyEl = () => byId("cy");

function visibleNodes(): any {
  return cy.nodes().filter((n: any) => n.style("display") !== "none");
}

// ---- init ----

export function initView(): void {
  const el = cyEl();
  basePos = (layouts && layouts.directory) || {};
  const { colorMode, sizeMode } = getState();
  const nodes = buildNodes(colorMode, sizeMode, basePos);
  const nodeIds = new Set<string>(nodes.map((n) => n.data.id as string));
  const labels = buildAllLabels(layouts);
  const edges = buildEdges(nodeIds);

  // Level-of-detail: on large graphs only reveal node labels when zoomed in far
  // enough, so thousands of labels don't repaint on every pan/zoom.
  const large = model.components.length > LOD_NODE_THRESHOLD;
  const labelMinZoomFont = large ? LABEL_MIN_ZOOM_FONT_LARGE : LABEL_MIN_ZOOM_FONT;

  cy = cytoscape({
    container: el,
    elements: { nodes: nodes.concat(labels), edges },
    style: [
      { selector: 'node[type="comp"]', style: {
        "background-color": "data(color)", width: "data(size)", height: "data(size)",
        shape: "data(shape)",
        label: "data(label)", "font-size": 9, color: cssVar("--node-label"),
        "text-valign": "bottom", "text-margin-y": 3, "min-zoomed-font-size": labelMinZoomFont,
        "border-width": 0 } },
      { selector: 'node[type="label"]', style: {
        "background-opacity": 0, width: 1, height: 1, shape: "rectangle",
        label: "data(label)", "font-size": 13, color: cssVar("--graph-label"),
        "text-valign": "top", "text-halign": "right", "text-margin-x": 4,
        "min-zoomed-font-size": 6, "border-width": 0 } },
      { selector: "node.hidden", style: { display: "none" } },
      { selector: "node.faded", style: { opacity: 0.1, "text-opacity": 0 } },
      { selector: "node.hi", style: { "border-width": 4, "border-color": cssVar("--hi-border"), "border-opacity": 1 } },
      { selector: "node.match", style: { "border-width": 3, "border-color": cssVar("--hi-border"), "border-opacity": 1 } },
      { selector: "node.tiphi", style: { "border-width": 3, "border-color": cssVar("--hi-border"), "border-opacity": 1 } },
      { selector: "node.cycnode", style: { "border-width": 4, "border-color": "#f85149", "border-opacity": 1 } },
      { selector: "edge", style: {
        display: "none", width: 1, "line-color": "#6e7681", opacity: 0.6,
        "target-arrow-color": "#6e7681", "target-arrow-shape": "triangle",
        "curve-style": "bezier", "arrow-scale": 0.8 } },
      { selector: "edge.show", style: { display: "element" } },
      { selector: "edge.show[cross=1]", style: { "line-color": "#d29922", opacity: 0.85, "target-arrow-color": "#d29922" } },
      { selector: 'edge.show[kind="dynamic"]', style: { "line-style": "dashed", "line-color": "#388bfd", "target-arrow-color": "#388bfd" } },
      { selector: 'edge.show[kind="reference"]', style: { "line-style": "dotted" } },
      { selector: "edge.cyc", style: { display: "element", "line-color": "#f85149", "target-arrow-color": "#f85149", opacity: 1, width: 2 } },
    ],
    layout:
      basePos && Object.keys(basePos).length
        ? { name: "preset" }
        : { name: "cose", animate: false, nodeRepulsion: 6000, idealEdgeLength: 70 },
    motionBlur: false,
    minZoom: 0.04,
    maxZoom: 3,
    wheelSensitivity: 0.5,
    // Large-graph rendering: cache the graph to a texture during pan/zoom, drop
    // edges while interacting, and cap the pixel ratio — keeps big graphs smooth.
    textureOnViewport: true,
    hideEdgesOnViewport: true,
    pixelRatio: 1,
  });

  // Index edges by directional key so the pure ego result maps back to elements.
  cy.edges().forEach((e: any) => {
    const k = edgeKey(e.data("source"), e.data("target"));
    const existing = edgesByKey.get(k);
    edgesByKey.set(k, existing ? existing.union(e) : e);
  });

  wireGraphEvents();
  wireTooltip();
}

// ---- encoding ----

export function applyEncoding(): void {
  const { colorMode, sizeMode } = getState();
  cy.batch(() => {
    cy.nodes('[type="comp"]').forEach((n: any) => {
      const id = n.id();
      const u = usageById.get(id);
      const m = metricById.get(id);
      n.data("color", nodeColor(colorMode, id, u, m));
      n.data("size", nodeSize(sizeMode, u, m));
    });
  });
  renderLegend();
}

export function renderLegend(): void {
  byId("legend").innerHTML = legendHtml(getState().colorMode);
}

// ---- layout switching ----

export function showLabelsFor(mode: string): void {
  cy.nodes('[type="label"]').forEach((n: any) => {
    n.toggleClass("hidden", n.data("mode") !== mode);
  });
}

function defaultEdgesShown(): boolean {
  return getState().layoutMode !== "directory";
}

export function setLayout(mode: string): void {
  if (!layouts || !(layouts as Record<string, unknown>)[mode]) return;
  setState({ layoutMode: mode as never });
  basePos = (layouts as Record<string, Record<string, NodePosition>>)[mode];
  cy.batch(() => {
    cy.nodes('[type="comp"]').forEach((n: any) => {
      const p = basePos[n.id()];
      if (p) n.position(p);
    });
    showLabelsFor(mode);
  });
  byId<HTMLInputElement>("edgesToggle").checked = defaultEdgesShown();
  resetView();
}

/** Pack visible component nodes into a tight grid (used when a filter hides most). */
function gridVisible(): void {
  const vis = cy.nodes('[type="comp"]').filter((n: any) => n.style("display") !== "none");
  const n = vis.length;
  if (!n) return;
  const cols = Math.ceil(Math.sqrt(n));
  let i = 0;
  cy.batch(() => {
    vis.forEach((node: any) => {
      node.position({ x: (i % cols) * GRID_SPACING, y: Math.floor(i / cols) * GRID_SPACING });
      i++;
    });
  });
}

function restoreBase(): void {
  cy.batch(() => {
    cy.nodes('[type="comp"]').forEach((n: any) => {
      const p = basePos[n.id()];
      if (p) n.position(p);
    });
  });
}

// ---- focus / ego ----

function idsToCollection(ids: Set<string>): any {
  let coll = cy.collection();
  ids.forEach((id) => {
    coll = coll.union(cy.getElementById(id));
  });
  return coll;
}

function edgeKeysToCollection(keys: Set<string>): any {
  let coll = cy.collection();
  keys.forEach((k) => {
    const c = edgesByKey.get(k);
    if (c) coll = coll.union(c);
  });
  return coll;
}

function clearCycle(): void {
  cy.edges(".cyc").removeClass("cyc");
  cy.nodes(".cycnode").removeClass("cycnode");
}

export function focusNode(id: string): void {
  const n = cy.getElementById(id);
  if (n.empty() || n.data("type") !== "comp") return;
  setActiveTab("tree");
  clearCycle();
  setState({ currentFocus: id });
  const { focusDepth, focusDir } = getState();
  const res = ego(adjacency, id, focusDepth, focusDir);
  const egoNodes = idsToCollection(res.nodes);
  const egoEdges = edgeKeysToCollection(res.edgeKeys);
  cy.batch(() => {
    cy.elements().addClass("faded");
    cy.edges().removeClass("show");
    egoNodes.removeClass("faded");
    egoEdges.removeClass("faded").addClass("show");
    cy.nodes().removeClass("hi");
    n.addClass("hi");
  });
  if (egoNodes.length > 1) {
    egoNodes
      .layout({ name: "breadthfirst", roots: [id], directed: false, padding: 30, spacingFactor: 1.0, animate: false, fit: false })
      .run();
  }
  cy.animate({ fit: { eles: egoNodes, padding: FIT_PAD_FOCUS } }, { duration: ANIM_FOCUS_MS });
  showInspector(id);
  const reached = egoNodes.length - 1;
  const dirTxt = focusDir === "dependents" ? "dependents ↑" : focusDir === "dependencies" ? "dependencies ↓" : "both";
  setCrumbs([
    { label: compById.get(id)!.name + " — depth " + focusDepth + " · " + dirTxt + " · " + reached + " reached" },
  ]);
}

function focusGroup(predicate: (n: any) => boolean, title: string): void {
  clearCycle();
  setState({ currentFocus: null });
  const ns = cy.nodes('[type="comp"]').filter(predicate);
  if (ns.empty()) return;
  cy.batch(() => {
    cy.elements().addClass("faded");
    cy.edges().removeClass("show");
    ns.removeClass("faded");
    ns.connectedEdges()
      .filter((e: any) => ns.contains(e.source()) && ns.contains(e.target()))
      .removeClass("faded")
      .addClass("show");
    cy.nodes().removeClass("hi");
  });
  cy.animate({ fit: { eles: ns, padding: FIT_PAD_GROUP } }, { duration: ANIM_FOCUS_MS });
  setPanelHtml(
    "<h2>" + esc(title) + '</h2><div class="muted">' + ns.length + " component" + (ns.length === 1 ? "" : "s") + ".</div>"
  );
  setCrumbs([{ label: title }]);
}

export function focusDirGroup(dir: string): void {
  focusGroup((n: any) => n.data("dir") === dir, dir);
}

export function focusFileGroup(file: string): void {
  focusGroup((n: any) => n.data("file") === file, file);
}

export function focusCycle(members: string[]): void {
  setState({ currentFocus: null });
  clearCycle();
  const set = new Set(members);
  const ns = cy.nodes('[type="comp"]').filter((n: any) => set.has(n.id()));
  if (ns.empty()) return;
  cy.batch(() => {
    cy.elements().addClass("faded");
    cy.edges().removeClass("show");
    ns.removeClass("faded").addClass("cycnode");
    ns.connectedEdges()
      .filter((e: any) => set.has(e.source().id()) && set.has(e.target().id()))
      .removeClass("faded")
      .addClass("cyc");
    cy.nodes().removeClass("hi");
  });
  cy.animate({ fit: { eles: ns, padding: FIT_PAD_FOCUS } }, { duration: ANIM_FOCUS_MS });
  setPanelHtml(
    "<h2>Dependency cycle</h2><div class=\"muted\">" + members.length +
      ' components form a cycle:</div><ul class="navlist">' +
      members
        .map((id) => {
          const c = compById.get(id) || { name: id };
          return '<li><a class="jump" data-id="' + esc(id) + '">' + esc(c.name) + "</a></li>";
        })
        .join("") +
      "</ul>",
    true
  );
  setCrumbs([{ label: "cycle (" + members.length + ")" }]);
}

export function resetView(): void {
  setState({ currentFocus: null });
  clearCycle();
  cy.batch(() => {
    cy.elements().removeClass("faded hi");
    cy.edges().removeClass("show");
  });
  applyFilter();
  if (byId<HTMLSelectElement>("filter").value === "all") restoreBase();
  else gridVisible();
  applyEdgeToggle();
  const vis = visibleNodes();
  cy.animate({ fit: { eles: vis.empty() ? cy.nodes() : vis, padding: FIT_PAD_OVERVIEW } }, { duration: ANIM_FOCUS_MS });
  setCrumbs(null);
}

// ---- filter ----

function nodeMatchesFilter(n: any, f: string): boolean {
  if (f === "dead") return n.data("state") === "dead";
  if (f === "dead-in-prod") return n.data("state") === "dead-in-prod";
  return true;
}

export function applyFilter(): void {
  const f = byId<HTMLSelectElement>("filter").value;
  cy.batch(() => {
    cy.nodes().forEach((n: any) => {
      if (n.data("type") === "label") {
        n.style("display", f === "all" && n.data("mode") === getState().layoutMode ? "element" : "none");
        return;
      }
      n.style("display", nodeMatchesFilter(n, f) ? "element" : "none");
    });
  });
}

// ---- overview edge toggle ----

export function applyEdgeToggle(): void {
  if (getState().currentFocus) return;
  const on = byId<HTMLInputElement>("edgesToggle").checked;
  cy.batch(() => {
    if (on) cy.edges().addClass("show");
    else cy.edges().removeClass("show");
  });
}

// ---- search highlight ----

export function highlightMatches(q: string): void {
  const needle = (q || "").trim().toLowerCase();
  cy.batch(() => {
    cy.nodes(".match").removeClass("match");
    if (!needle) return;
    cy.nodes('[type="comp"]')
      .filter((n: any) => n.data("label").toLowerCase().indexOf(needle) >= 0)
      .addClass("match");
  });
}

// ---- theme ----

export function applyGraphTheme(): void {
  const nodeLabel = cssVar("--node-label");
  const graphLabel = cssVar("--graph-label");
  const hiBorder = cssVar("--hi-border");
  cy.style()
    .selector('node[type="comp"]').style("color", nodeLabel)
    .selector('node[type="label"]').style("color", graphLabel)
    .selector("node.hi").style("border-color", hiBorder)
    .selector("node.match").style("border-color", hiBorder)
    .selector("node.tiphi").style("border-color", hiBorder)
    .update();
}

// ---- zoom ----

export function zoomBy(factor: number): void {
  const el = cyEl();
  cy.animate(
    { zoom: { level: cy.zoom() * factor, renderedPosition: { x: el.clientWidth / 2, y: el.clientHeight / 2 } } },
    { duration: ANIM_ZOOM_MS }
  );
}

export function fitVisible(duration = ANIM_FIT_MS): void {
  const vis = visibleNodes();
  cy.animate({ fit: { eles: vis.empty() ? cy.nodes() : vis, padding: FIT_PAD_OVERVIEW } }, { duration });
}

export { ZOOM_STEP };

// ---- cy events ----

function wireGraphEvents(): void {
  cy.on("tap", 'node[type="comp"]', (evt: any) => focusNode(evt.target.id()));
  cy.on("tap", 'node[type="label"]', (evt: any) => {
    const t = evt.target;
    if (t.data("mode") === getState().layoutMode && t.data("full") !== undefined && getState().layoutMode !== "clusters")
      focusDirGroup(t.data("full"));
  });
  cy.on("tap", (evt: any) => {
    if (evt.target === cy) resetView();
  });
}

// ---- hover tooltip ----

function wireTooltip(): void {
  const tip = byId("tip");
  const el = cyEl();
  function moveTip(evt: any): void {
    const p = evt.renderedPosition || { x: 0, y: 0 };
    let x = p.x + TIP_OFFSET;
    const y = p.y + TIP_OFFSET;
    if (x + TIP_FLIP_MARGIN > el.clientWidth) x = p.x - TIP_OFFSET - TIP_WIDTH;
    tip.style.left = x + "px";
    tip.style.top = y + "px";
  }
  cy.on("mouseover", 'node[type="comp"]', (evt: any) => {
    const id = evt.target.id();
    const c = compById.get(id)!;
    const u = usageById.get(id);
    const m = metricById.get(id);
    tip.innerHTML =
      "<b>" + esc(c.name) + '</b> <span class="t-file">' + esc(m?.role || u?.state || "used") + "</span>" +
      '<div class="t-file">' + esc(c.file) + ":" + c.line + "</div>" +
      "<div>fan-in <b>" + (m?.fanIn || 0) + "</b> · fan-out <b>" + (m?.fanOut || 0) + "</b> · prod <b>" + (u?.prodCount || 0) + "</b></div>";
    tip.style.display = "block";
    moveTip(evt);
    evt.target.addClass("tiphi");
  });
  cy.on("mouseout", 'node[type="comp"]', (evt: any) => {
    tip.style.display = "none";
    evt.target.removeClass("tiphi");
  });
  cy.on("mouseover", 'node[type="label"]', (evt: any) => {
    tip.innerHTML = "<b>" + esc(evt.target.data("label")) + "</b>";
    tip.style.display = "block";
    moveTip(evt);
  });
  cy.on("mouseout", 'node[type="label"]', () => {
    tip.style.display = "none";
  });
  cy.on("mousemove", (evt: any) => {
    if (tip.style.display === "block") moveTip(evt);
  });
  cy.on("pan zoom", () => {
    tip.style.display = "none";
  });
}

// ---- sizing ----

export function observeAndFit(): void {
  const el = cyEl();
  new ResizeObserver(() => cy.resize()).observe(el);
  const whenSized = (cb: () => void) => {
    if (el.clientWidth > 0 && el.clientHeight > 0) cb();
    else requestAnimationFrame(() => whenSized(cb));
  };
  whenSized(() => {
    cy.resize();
    cy.fit(undefined, FIT_PAD_OVERVIEW);
  });
}
