// The cytoscape view: sole owner of the graph instance and every operation that
// touches it (encoding, presets, layout switching, semantic zoom, focus/ego,
// filtering, search highlight, theme, zoom, tooltip). Pure graph logic lives in
// ./graph and ./encodings; this module maps it onto cytoscape elements and DOM.

import type { NodePosition } from "../model.js";
import { model, compById, usageById, metricById, layouts, adjacency } from "./context.js";
import { buildNodes, buildAllLabels, buildEdges, buildDirElements } from "./elements.js";
import { nodeColor, nodeSize, legendHtml } from "./encodings.js";
import { ego, edgeKey } from "./graph/ego.js";
import type { ViewPreset } from "./presets.js";
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
  MAX_FOCUS_DEPTH,
  TIP_OFFSET,
  TIP_WIDTH,
  TIP_FLIP_MARGIN,
  LOD_NODE_THRESHOLD,
  LABEL_MIN_ZOOM_FONT,
  LABEL_MIN_ZOOM_FONT_LARGE,
  DIR_OVERVIEW_THRESHOLD,
  EDGE_AUTO_MAX,
  STATE_COLORS,
} from "./constants.js";
import { showInspector, showDirPanel, setPanelHtml, setCrumbs } from "./panels.js";

declare const cytoscape: any;

let cy: any = null;
let basePos: Record<string, NodePosition> = {};
const edgesByKey = new Map<string, any>(); // edgeKey -> cytoscape edge collection
/** Directories whose bubbles have been expanded into their components. */
const expandedDirs = new Set<string>();
const cyEl = () => byId("cy");

function visibleNodes(): any {
  return cy.nodes().filter((n: any) => n.style("display") !== "none");
}

function filterValue(): string {
  return byId<HTMLSelectElement>("filter").value;
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
  const dirEls = buildDirElements(basePos);

  // Level-of-detail: on large graphs only reveal node labels when zoomed in far
  // enough, so thousands of labels don't repaint on every pan/zoom.
  const large = model.components.length > LOD_NODE_THRESHOLD;
  const labelMinZoomFont = large ? LABEL_MIN_ZOOM_FONT_LARGE : LABEL_MIN_ZOOM_FONT;

  cy = cytoscape({
    container: el,
    elements: { nodes: nodes.concat(labels, dirEls.nodes), edges: edges.concat(dirEls.edges) },
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
      // Directory bubbles for the semantic-zoom overview: pie slice = dead share.
      { selector: 'node[type="dir"]', style: {
        width: "data(size)", height: "data(size)", shape: "ellipse",
        "background-color": STATE_COLORS.used, "background-opacity": 0.25,
        "border-width": 1.5, "border-color": STATE_COLORS.used, "border-opacity": 0.7,
        "pie-size": "78%",
        "pie-1-background-color": STATE_COLORS.dead, "pie-1-background-size": "data(deadPct)",
        "pie-1-background-opacity": 0.9,
        "pie-2-background-color": STATE_COLORS.used, "pie-2-background-size": "data(alivePct)",
        "pie-2-background-opacity": 0.35,
        label: "data(label)", "font-size": 12, color: cssVar("--node-label"),
        "text-valign": "bottom", "text-margin-y": 4, "min-zoomed-font-size": 6 } },
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
      // Aggregated dir→dir links (drawn when the edges toggle is on; cytoscape
      // hides them whenever an endpoint bubble is hidden), width = edge count.
      { selector: "edge.diredge", style: {
        display: "none", width: "data(width)", "line-color": "#6e7681", opacity: 0.45,
        "target-arrow-color": "#6e7681", "target-arrow-shape": "triangle",
        "curve-style": "bezier", "arrow-scale": 0.7 } },
      { selector: "edge.diredge.show", style: { display: "element" } },
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

  // Index component edges by directional key so the pure ego result maps back
  // to elements (aggregated dir links are not part of the ego graph).
  cy.edges().not(".diredge").forEach((e: any) => {
    const k = edgeKey(e.data("source"), e.data("target"));
    const existing = edgesByKey.get(k);
    edgesByKey.set(k, existing ? existing.union(e) : e);
  });

  wireGraphEvents();
  wireTooltip();
  // Debug/console handle (also used by automated checks of the report).
  (window as unknown as Record<string, unknown>).__deadfallCy = cy;
}

// ---- presets ----

/** Resolve an "auto" overview level by graph size. */
function resolveOverview(p: ViewPreset): "dirs" | "comps" {
  if (p.overview === "auto")
    return model.components.length > DIR_OVERVIEW_THRESHOLD ? "dirs" : "comps";
  return p.overview;
}

function resolveEdges(p: ViewPreset): boolean {
  if (p.edges === "on") return true;
  if (p.edges === "off") return false;
  return model.components.length <= EDGE_AUTO_MAX;
}

/** Activate a named view: bundles layout, encodings, filter, edges, overview. */
export function applyPreset(p: ViewPreset): void {
  setState({
    preset: p.id,
    layoutMode: p.layoutMode,
    colorMode: p.colorMode,
    sizeMode: p.sizeMode,
    overviewLevel: resolveOverview(p),
  });
  byId<HTMLSelectElement>("filter").value = p.filter;
  basePos = (layouts && (layouts as Record<string, Record<string, NodePosition>>)[p.layoutMode]) || basePos;
  cy.batch(() => {
    restoreBase();
    showLabelsFor(p.layoutMode);
  });
  byId<HTMLInputElement>("edgesToggle").checked = resolveEdges(p);
  applyEncoding();
  resetView();
}

/** Switch the overview between directory bubbles and all components. */
export function setOverviewLevel(level: "dirs" | "comps"): void {
  setState({ overviewLevel: level });
  resetView();
}

/** True when the current overview shows directory bubbles. */
export function dirsOverviewActive(): boolean {
  const s = getState();
  return s.overviewLevel === "dirs" && s.layoutMode === "directory" && filterValue() === "all";
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

// ---- layout switching (advanced knob; marks the view "custom") ----

export function showLabelsFor(mode: string): void {
  cy.nodes('[type="label"]').forEach((n: any) => {
    n.toggleClass("hidden", n.data("mode") !== mode);
  });
}

export function setLayout(mode: string): void {
  if (!layouts || !(layouts as Record<string, unknown>)[mode]) return;
  setState({ layoutMode: mode as never, preset: "custom" });
  basePos = (layouts as Record<string, Record<string, NodePosition>>)[mode];
  cy.batch(() => {
    restoreBase();
    showLabelsFor(mode);
  });
  byId<HTMLInputElement>("edgesToggle").checked = mode !== "directory" || model.components.length <= EDGE_AUTO_MAX;
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

function focusCrumbActions(id: string): { label: string; onClick: () => void }[] {
  const { focusDepth } = getState();
  if (focusDepth >= MAX_FOCUS_DEPTH) return [];
  return [
    {
      label: "+ depth",
      onClick: () => {
        setState({ focusDepth: getState().focusDepth + 1 });
        byId<HTMLSelectElement>("depth").value = String(getState().focusDepth);
        focusNode(id);
      },
    },
  ];
}

export function focusNode(id: string): void {
  const n = cy.getElementById(id);
  if (n.empty() || n.data("type") !== "comp") return;
  clearCycle();
  setState({ currentFocus: id });
  const { focusDepth, focusDir } = getState();
  const res = ego(adjacency, id, focusDepth, focusDir);
  const egoNodes = idsToCollection(res.nodes);
  const egoEdges = edgeKeysToCollection(res.edgeKeys);
  cy.batch(() => {
    // The ego neighbourhood must be fully visible even if the overview (dirs
    // bubbles or a dead-only filter) was hiding some of its members.
    cy.nodes('[type="dir"]').style("display", "none");
    egoNodes.style("display", "element");
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
  setCrumbs(
    [{ label: compById.get(id)!.name + " — depth " + focusDepth + " · " + dirTxt + " · " + reached + " reached" }],
    focusCrumbActions(id)
  );
}

function focusGroup(predicate: (n: any) => boolean, title: string): void {
  clearCycle();
  setState({ currentFocus: null });
  const ns = cy.nodes('[type="comp"]').filter(predicate);
  if (ns.empty()) return;
  cy.batch(() => {
    cy.nodes('[type="dir"]').style("display", "none");
    ns.style("display", "element");
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
    cy.nodes('[type="dir"]').style("display", "none");
    ns.style("display", "element");
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

// ---- semantic zoom: expand a directory bubble into its components ----

export function expandDir(dir: string): void {
  if (!dirsOverviewActive()) return;
  expandedDirs.add(dir);
  applyVisibility();
  applyEdgeToggle();
  const ns = cy.nodes('[type="comp"]').filter((n: any) => n.data("dir") === dir);
  if (!ns.empty()) cy.animate({ fit: { eles: ns, padding: FIT_PAD_GROUP } }, { duration: ANIM_FOCUS_MS });
  showDirPanel(dir);
  setCrumbs([{ label: dir + "/ — " + ns.length + " expanded · background click collapses" }]);
}

export function resetView(): void {
  setState({ currentFocus: null });
  clearCycle();
  expandedDirs.clear();
  cy.batch(() => {
    cy.elements().removeClass("faded hi");
    cy.edges().removeClass("show");
  });
  applyVisibility();
  if (filterValue() === "all") restoreBase();
  else gridVisible();
  applyEdgeToggle();
  const vis = visibleNodes();
  cy.animate({ fit: { eles: vis.empty() ? cy.nodes() : vis, padding: FIT_PAD_OVERVIEW } }, { duration: ANIM_FOCUS_MS });
  setCrumbs(null);
}

// ---- visibility (filter × overview level × expanded dirs) ----

function nodeMatchesFilter(n: any, f: string): boolean {
  if (f === "dead") return n.data("state") === "dead";
  if (f === "dead-in-prod") return n.data("state") === "dead-in-prod";
  return true;
}

/**
 * One place that decides what is visible: the filter hides non-matching
 * components; the dirs overview swaps components for directory bubbles, except
 * inside expanded directories.
 */
export function applyVisibility(): void {
  const f = filterValue();
  const dirs = dirsOverviewActive();
  const mode = getState().layoutMode;
  cy.batch(() => {
    cy.nodes().forEach((n: any) => {
      const t = n.data("type");
      if (t === "label") {
        n.style("display", f === "all" && !dirs && n.data("mode") === mode ? "element" : "none");
      } else if (t === "dir") {
        n.style("display", dirs && !expandedDirs.has(n.data("dir")) ? "element" : "none");
      } else {
        const passes = nodeMatchesFilter(n, f);
        const visible = dirs ? passes && expandedDirs.has(n.data("dir")) : passes;
        n.style("display", visible ? "element" : "none");
      }
    });
  });
}

// Back-compat name used by the controls wiring.
export const applyFilter = applyVisibility;

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
    .selector('node[type="dir"]').style("color", nodeLabel)
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
  cy.on("tap", 'node[type="dir"]', (evt: any) => expandDir(evt.target.data("dir")));
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
  cy.on("mouseover", 'node[type="dir"]', (evt: any) => {
    const d = evt.target.data();
    tip.innerHTML =
      "<b>" + esc(d.dir) + "/</b>" +
      "<div>" + d.count + " component" + (d.count === 1 ? "" : "s") +
      (d.dead ? ' · <b style="color:#f85149">' + d.dead + " dead</b>" : "") + "</div>" +
      '<div class="t-file">click to expand</div>';
    tip.style.display = "block";
    moveTip(evt);
  });
  cy.on("mouseout", 'node[type="dir"]', () => {
    tip.style.display = "none";
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
