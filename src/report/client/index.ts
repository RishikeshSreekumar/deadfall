// Browser entry for the deadfall report. Bundled by
// scripts/build-client.mjs (esbuild → IIFE) into dist/report/client.bundle.js,
// which renderHtml inlines. cytoscape and MODEL are globals from earlier inlined
// <script> tags. This file only wires the DOM controls to the view/panels and
// runs the init sequence — all logic lives in the imported modules.

import type { ColorMode, SizeMode } from "./encodings.js";
import { COLOR_ENCODINGS, SIZE_ENCODINGS } from "./encodings.js";
import type { EgoDir } from "./graph/ego.js";
import { LAYOUT_MODES } from "./layout-modes.js";
import { VIEW_PRESETS, presetById } from "./presets.js";
import { model, compById } from "./context.js";
import { byId, esc } from "./dom.js";
import { getState, setState, subscribe } from "./state.js";
import { SEARCH_DEBOUNCE_MS, MAX_SEARCH_RESULTS } from "./constants.js";
import { searchComponents } from "./search.js";
import type { SearchHit } from "./search.js";
import { renderTree, renderTriage, setActiveTab } from "./panels.js";
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

// ---- URL hash (shareable view/focus state) ----

function syncHash(): void {
  const s = getState();
  const params = new URLSearchParams();
  if (s.preset !== "custom") params.set("view", s.preset);
  if (s.currentFocus) params.set("focus", s.currentFocus);
  try {
    const q = params.toString();
    history.replaceState(null, "", q ? "#" + q : location.pathname + location.search);
  } catch {
    /* file:// quirks — hash is a convenience, never required */
  }
}

function applyHash(): void {
  const params = new URLSearchParams(location.hash.slice(1));
  const preset = presetById(params.get("view") || "") || VIEW_PRESETS[0];
  view.applyPreset(preset);
  const focus = params.get("focus");
  if (focus && compById.has(focus)) view.focusNode(focus);
}

// ---- search palette ----

function wireSearch(): void {
  const searchEl = byId<HTMLInputElement>("search");
  const srEl = byId("searchresults");
  let hits: SearchHit[] = [];
  let active = -1;
  let searchTimer: ReturnType<typeof setTimeout> | null = null;

  const close = () => {
    srEl.style.display = "none";
    hits = [];
    active = -1;
  };

  const paint = () => {
    if (!hits.length) {
      srEl.innerHTML = '<div class="sr"><span class="muted">no matches</span></div>';
      return;
    }
    srEl.innerHTML = hits
      .map((h, i) => {
        const c = compById.get(h.id);
        return (
          '<div class="sr' + (i === active ? " act" : "") + '" data-i="' + i + '">' +
          '<span class="name">' + esc(h.name) + "</span>" +
          '<span class="srfile">' + esc(c ? c.file : "") + "</span></div>"
        );
      })
      .join("");
    srEl.querySelectorAll(".sr[data-i]").forEach((el) => {
      el.addEventListener("mousedown", (ev) => {
        ev.preventDefault(); // beat the input's blur
        pick(Number(el.getAttribute("data-i")));
      });
    });
  };

  const open = (q: string) => {
    if (!q.trim()) {
      close();
      return;
    }
    hits = searchComponents(q, model.components, MAX_SEARCH_RESULTS);
    active = hits.length ? 0 : -1;
    paint();
    srEl.style.display = "block";
  };

  const pick = (i: number) => {
    const hit = hits[i];
    close();
    if (hit) view.focusNode(hit.id);
  };

  searchEl.addEventListener("input", function () {
    if (searchTimer) clearTimeout(searchTimer);
    const v = this.value;
    searchTimer = setTimeout(() => {
      renderTree();
      view.highlightMatches(v);
      open(v);
    }, SEARCH_DEBOUNCE_MS);
  });
  searchEl.addEventListener("keydown", function (e) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!hits.length) return;
      e.preventDefault();
      active = (active + (e.key === "ArrowDown" ? 1 : hits.length - 1)) % hits.length;
      paint();
    } else if (e.key === "Enter") {
      if (active >= 0) pick(active);
    } else if (e.key === "Escape") {
      close();
    }
  });
  searchEl.addEventListener("blur", () => {
    setTimeout(close, 150);
  });
  searchEl.addEventListener("focus", function () {
    if (this.value.trim()) open(this.value);
  });
}

// ---- top-bar sync helpers ----

function syncLegendActive(): void {
  const f = byId<HTMLSelectElement>("filter").value;
  byId("legend")
    .querySelectorAll("span[data-filter]")
    .forEach((el) => el.classList.toggle("on", el.getAttribute("data-filter") === f));
}

function syncGroupingBtn(): void {
  const btn = byId("grouping");
  const s = getState();
  const applicable = s.layoutMode === "directory" && byId<HTMLSelectElement>("filter").value === "all";
  btn.style.display = applicable ? "" : "none";
  btn.textContent = s.overviewLevel === "dirs" ? "◉ bubbles" : "∴ all nodes";
  btn.title =
    s.overviewLevel === "dirs"
      ? "showing directory bubbles — click for every component"
      : "showing every component — click to group by directory";
}

function syncAdvancedSelects(): void {
  const s = getState();
  byId<HTMLSelectElement>("layout").value = s.layoutMode;
  byId<HTMLSelectElement>("color").value = s.colorMode;
  byId<HTMLSelectElement>("size").value = s.sizeMode;
  byId<HTMLSelectElement>("depth").value = String(s.focusDepth);
  byId<HTMLSelectElement>("dir").value = s.focusDir;
  byId<HTMLSelectElement>("view").value = s.preset;
}

function onFilterChanged(): void {
  view.resetView();
  renderTree();
  syncLegendActive();
  syncGroupingBtn();
}

function main(): void {
  byId("s-total").textContent = String(model.stats.totalComponents);
  byId("s-dead").textContent = String(model.stats.dead);
  byId("s-dip").textContent = String(model.stats.deadInProd);

  // Build the registry-driven control options from a single source of truth.
  const s = getState();
  fillSelect("view", VIEW_PRESETS, s.preset);
  byId("view").innerHTML += '<option value="custom" hidden>custom</option>';
  fillSelect("layout", LAYOUT_MODES, s.layoutMode);
  fillSelect("color", COLOR_ENCODINGS, s.colorMode);
  fillSelect("size", SIZE_ENCODINGS, s.sizeMode);

  view.initView();

  // ---- top-bar controls ----
  byId<HTMLSelectElement>("view").addEventListener("change", (e) => {
    const p = presetById((e.target as HTMLSelectElement).value);
    if (p) view.applyPreset(p);
  });
  byId("grouping").addEventListener("click", () => {
    view.setOverviewLevel(getState().overviewLevel === "dirs" ? "comps" : "dirs");
  });
  byId("reset").addEventListener("click", () => view.resetView());

  // Advanced knobs: any touch detaches from the named preset ("custom").
  byId<HTMLSelectElement>("layout").addEventListener("change", (e) =>
    view.setLayout((e.target as HTMLSelectElement).value)
  );
  byId<HTMLSelectElement>("color").addEventListener("change", (e) =>
    setState({ colorMode: (e.target as HTMLSelectElement).value as ColorMode, preset: "custom" })
  );
  byId<HTMLSelectElement>("size").addEventListener("change", (e) =>
    setState({ sizeMode: (e.target as HTMLSelectElement).value as SizeMode, preset: "custom" })
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
  byId<HTMLSelectElement>("filter").addEventListener("change", onFilterChanged);
  byId<HTMLInputElement>("edgesToggle").addEventListener("change", () => {
    if (getState().currentFocus) {
      view.resetView();
      return;
    }
    view.applyEdgeToggle();
  });

  // Legend doubles as a state filter (delegated: legend re-renders per encoding).
  byId("legend").addEventListener("click", (ev) => {
    const t = (ev.target as HTMLElement).closest("span[data-filter]");
    if (!t) return;
    byId<HTMLSelectElement>("filter").value = t.getAttribute("data-filter")!;
    onFilterChanged();
  });

  // State subscriptions: encoding repaint, control sync, shareable hash.
  subscribe((_s, changed) => {
    if (changed.has("colorMode") || changed.has("sizeMode")) {
      view.applyEncoding();
      syncLegendActive();
    }
    if (
      changed.has("preset") ||
      changed.has("layoutMode") ||
      changed.has("colorMode") ||
      changed.has("sizeMode") ||
      changed.has("focusDepth") ||
      changed.has("focusDir")
    )
      syncAdvancedSelects();
    if (changed.has("overviewLevel") || changed.has("layoutMode")) syncGroupingBtn();
    if (changed.has("preset") || changed.has("currentFocus")) syncHash();
  });

  // ---- tabs ----
  byId("tab-triage").addEventListener("click", () => setActiveTab("triage"));
  byId("tab-tree").addEventListener("click", () => {
    setActiveTab("tree");
    renderTree();
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
  wireSearch();

  // ---- init sequence ----
  setActiveTab("triage");
  renderTriage();
  applyHash(); // applies the initial preset (and a deep-linked focus, if any)
  syncHash();
  syncLegendActive();
  syncGroupingBtn();
  syncAdvancedSelects();
  view.observeAndFit();
}
