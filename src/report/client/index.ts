// Browser entry for the deadfall report. Bundled by
// scripts/build-client.mjs (esbuild → IIFE) into dist/report/client.bundle.js,
// which renderHtml inlines. cytoscape and MODEL are globals from earlier inlined
// <script> tags. This file only wires the DOM controls to the view/panels and
// runs the init sequence — all logic lives in the imported modules.

import type { ColorMode, SizeMode } from "./encodings.js";
import { COLOR_ENCODINGS, SIZE_ENCODINGS } from "./encodings.js";
import type { EgoDir } from "./graph/ego.js";
import type { LayoutMode } from "../model.js";
import { LAYOUT_MODES } from "./layout-modes.js";
import { model } from "./context.js";
import { byId, esc } from "./dom.js";
import { getState, setState, subscribe } from "./state.js";
import { SEARCH_DEBOUNCE_MS } from "./constants.js";
import { renderTree, renderInsights, setActiveTab } from "./panels.js";
import * as view from "./cy-view.js";

/** Populate a <select> from a registry, marking the active option selected. */
function fillSelect(id: string, items: ReadonlyArray<{ id: string; label: string }>, selected: string): void {
  byId(id).innerHTML = items
    .map(
      (it) =>
        '<option value="' + esc(it.id) + '"' + (it.id === selected ? " selected" : "") + ">" + esc(it.label) + "</option>"
    )
    .join("");
}

declare const cytoscape: undefined | unknown;

// Theme: light by default, dark persisted in localStorage.
try {
  if (localStorage.getItem("cut-theme") === "dark") document.documentElement.dataset.theme = "dark";
} catch {
  /* ignore storage errors */
}

if (typeof cytoscape === "undefined") {
  byId("cy").innerHTML =
    '<p style="padding:20px;color:#f85149">cytoscape failed to load — report is corrupt.</p>';
} else {
  main();
}

function firstMatch(q: string): string | null {
  const needle = (q || "").trim().toLowerCase();
  if (!needle) return null;
  const hit = model.components.find((c) => c.name.toLowerCase().indexOf(needle) >= 0);
  return hit ? hit.id : null;
}

function main(): void {
  byId("s-total").textContent = String(model.stats.totalComponents);
  byId("s-dead").textContent = String(model.stats.dead);
  byId("s-dip").textContent = String(model.stats.deadInProd);

  // Build the registry-driven control options from a single source of truth.
  const s = getState();
  fillSelect("layout", LAYOUT_MODES, s.layoutMode);
  fillSelect("color", COLOR_ENCODINGS, s.colorMode);
  fillSelect("size", SIZE_ENCODINGS, s.sizeMode);

  view.initView();

  // ---- top-bar controls ----
  byId("reset").addEventListener("click", () => view.resetView());
  byId<HTMLSelectElement>("layout").addEventListener("change", (e) =>
    view.setLayout((e.target as HTMLSelectElement).value)
  );
  byId<HTMLSelectElement>("color").addEventListener("change", (e) =>
    setState({ colorMode: (e.target as HTMLSelectElement).value as ColorMode })
  );
  byId<HTMLSelectElement>("size").addEventListener("change", (e) =>
    setState({ sizeMode: (e.target as HTMLSelectElement).value as SizeMode })
  );
  byId<HTMLSelectElement>("depth").addEventListener("change", (e) => {
    setState({ focusDepth: Number((e.target as HTMLSelectElement).value) });
    const cf = getState().currentFocus;
    if (cf) view.focusNode(cf);
  });
  byId<HTMLSelectElement>("dir").addEventListener("change", (e) => {
    setState({ focusDir: (e.target as HTMLSelectElement).value as EgoDir });
    const cf = getState().currentFocus;
    if (cf) view.focusNode(cf);
  });
  byId<HTMLSelectElement>("filter").addEventListener("change", () => {
    view.resetView();
    renderTree();
  });
  byId<HTMLInputElement>("edgesToggle").addEventListener("change", () => {
    if (getState().currentFocus) {
      view.resetView();
      return;
    }
    view.applyEdgeToggle();
  });

  // Encoding reacts to colour/size changes via the store (no direct coupling).
  subscribe((_s, changed) => {
    if (changed.has("colorMode") || changed.has("sizeMode")) view.applyEncoding();
  });

  // ---- tabs ----
  byId("tab-tree").addEventListener("click", () => setActiveTab("tree"));
  byId("tab-insights").addEventListener("click", () => {
    setActiveTab("insights");
    renderInsights();
  });

  // ---- zoom ----
  byId("zin").addEventListener("click", () => view.zoomBy(view.ZOOM_STEP));
  byId("zout").addEventListener("click", () => view.zoomBy(1 / view.ZOOM_STEP));
  byId("zfit").addEventListener("click", () => view.fitVisible());

  // ---- theme toggle ----
  const themeBtn = byId("theme");
  const syncThemeBtn = () => {
    themeBtn.textContent = document.documentElement.dataset.theme === "dark" ? "☀︎" : "🌙";
  };
  themeBtn.addEventListener("click", () => {
    const dark = document.documentElement.dataset.theme === "dark";
    if (dark) delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = "dark";
    try {
      localStorage.setItem("cut-theme", dark ? "light" : "dark");
    } catch {
      /* ignore */
    }
    syncThemeBtn();
    view.applyGraphTheme();
  });
  syncThemeBtn();

  // ---- search ----
  const searchEl = byId<HTMLInputElement>("search");
  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  searchEl.addEventListener("input", function () {
    if (searchTimer) clearTimeout(searchTimer);
    const v = this.value;
    searchTimer = setTimeout(() => {
      renderTree();
      view.highlightMatches(v);
    }, SEARCH_DEBOUNCE_MS);
  });
  searchEl.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      const id = firstMatch(this.value);
      if (id) view.focusNode(id);
    }
  });

  // ---- init sequence ----
  view.showLabelsFor(getState().layoutMode as LayoutMode);
  view.applyFilter();
  renderTree();
  view.renderLegend();
  view.observeAndFit();
}
