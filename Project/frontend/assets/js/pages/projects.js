// ============================================================
// pages/projects.js
// Purpose:   The browse screen: search by title, filter by status and by any
//            number of technologies, paginate, and open a project.
//
// Endpoints:
//   GET /api/meta        — every filter option (enums + live tech tags)
//   GET /api/search      — the projects themselves
//
// Nothing about the available filters is written in this file. The status list,
// the technology list, and their counts all come from /api/meta, so a tag
// appears in the panel the moment somebody posts a project that uses it.
//
// State lives in the URL (?q=&status=&tech=&tech=&page=), so a filtered view
// can be bookmarked, refreshed or shared and comes back identical.
// ============================================================

import { api } from "../core/api.js";
import { CONFIG } from "../core/config.js";
import { mountChrome } from "../ui/navbar.js";
import { el, qs, qsa, debounce, buildPagination, emptyState } from "../ui/dom.js";
import { projectCard, skeletonCards } from "../ui/pieces.js";
import { icon } from "../ui/icons.js";
import { createPopover } from "../ui/popover.js";
import { error as toastError, startProgress, stopProgress } from "../ui/toast.js";

const LIMIT = 9;

const grid = qs("#grid");
const paginationBox = qs("#pagination");
const countChip = qs("#count-chip");
const searchInput = qs("#search");
const submitBtn = qs("#submit-btn");
const statusSelect = qs("#status-filter");
const filtersBtn = qs("#filters-btn");
const filtersCount = qs("#filters-count");
const techList = qs("#tech-list");
const techEmpty = qs("#tech-empty");
const appliedBox = qs("#applied-filters");

const state = {
  q: "",
  status: "",
  techs: [],
  page: 1,
  loaded: false,
};

// Filled from /api/meta — never hard-coded
const meta = {
  projectStatuses: [],
  techStack: [],
};


// ---- URL <-> state ----

function readStateFromUrl() {
  const params = new URLSearchParams(window.location.search);

  state.q = params.get("q") || "";
  state.status = (params.get("status") || "").toUpperCase();
  state.techs = params
    .getAll("tech")
    .map((tech) => tech.trim().toLowerCase())
    .filter(Boolean);
  state.page = Math.max(Number(params.get("page")) || 1, 1);

  searchInput.value = state.q;
}

function writeStateToUrl() {
  const params = new URLSearchParams();

  if (state.q) params.set("q", state.q);
  if (state.status) params.set("status", state.status);

  for (const tech of state.techs) {
    params.append("tech", tech);
  }

  if (state.page > 1) params.set("page", String(state.page));

  const query = params.toString();
  const next = query ? `?${query}` : window.location.pathname;

  window.history.replaceState(null, "", next);
}


// ---- Metadata: what can actually be filtered on ----

async function fetchMeta() {
  try {
    const data = await api.get("/meta");

    meta.projectStatuses = data?.projectStatuses || [];
    meta.techStack = data?.techStack || [];
  } catch (err) {
    // No filters is survivable; the board itself still works
    toastError(`Filter options unavailable: ${err.message}`);
  }
}


// ---- Status select ----

function labelFor(value) {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

function buildStatusSelect() {
  const options = [el("option", { value: "", text: "All statuses" })];

  for (const status of meta.projectStatuses) {
    options.push(el("option", { value: status, text: labelFor(status) }));
  }

  statusSelect.replaceChildren(...options);

  // A status that is no longer in the enum is dropped, not shown as a blank row
  if (!meta.projectStatuses.includes(state.status)) {
    state.status = "";
  }

  statusSelect.value = state.status;

  statusSelect.addEventListener("change", () => {
    state.status = statusSelect.value;
    state.page = 1;
    load();
  });
}


// ---- Technology checkboxes (multi-select, OR semantics on the backend) ----

function buildTechList() {
  if (meta.techStack.length === 0) {
    techList.replaceChildren();
    techEmpty.hidden = false;
    return;
  }

  techEmpty.hidden = true;

  techList.replaceChildren(
    ...meta.techStack.map((tag) =>
      el("label", { class: "filter-option" }, [
        el("input", {
          type: "checkbox",
          value: tag.name,
          checked: state.techs.includes(tag.name),
          onchange: (event) => toggleTech(tag.name, event.target.checked),
        }),
        el("span", { class: "filter-option__name", text: tag.name }),
        el("span", { class: "filter-option__count", text: String(tag.count) }),
      ])
    )
  );
}

function syncTechChecks() {
  for (const input of qsa("input", techList)) {
    input.checked = state.techs.includes(input.value);
  }
}

function toggleTech(name, checked) {
  if (checked) {
    if (!state.techs.includes(name)) state.techs.push(name);
  } else {
    state.techs = state.techs.filter((item) => item !== name);
  }

  state.page = 1;
  syncTechChecks();
  renderApplied();
  syncFilterCount();
  load();
}

function clearTech(reload = true) {
  state.techs = [];
  state.page = 1;
  syncTechChecks();
  renderApplied();
  syncFilterCount();
  if (reload) load();
}


// ---- Applied pills: an active filter must never be invisible ----

function renderApplied() {
  if (state.techs.length === 0) {
    appliedBox.hidden = true;
    appliedBox.replaceChildren();
    return;
  }

  appliedBox.hidden = false;

  appliedBox.replaceChildren(
    ...state.techs.map((tech) =>
      el(
        "button",
        {
          type: "button",
          class: "applied-pill",
          "aria-label": `Remove the ${tech} filter`,
          onclick: () => toggleTech(tech, false),
        },
        [
          el("span", { text: tech }),
          el("span", { class: "applied-pill__x", "aria-hidden": "true", text: "×" }),
        ]
      )
    ),
    el("button", {
      type: "button",
      class: "link-btn applied-clear",
      text: "Clear all",
      onclick: () => clearTech(true),
    })
  );
}

function syncFilterCount() {
  const count = state.techs.length;

  filtersCount.textContent = String(count);
  filtersCount.hidden = count === 0;
  filtersBtn.classList.toggle("has-filters", count > 0);
  filtersBtn.setAttribute("aria-label", count === 0 ? "Filters" : `Filters, ${count} active`);
}


// ---- Loading / empty / error states ----

function showSkeletons() {
  grid.replaceChildren(...skeletonCards(LIMIT));
  paginationBox.replaceChildren();
}

function showEmpty() {
  const filtered = Boolean(state.q || state.status || state.techs.length);

  grid.replaceChildren(
    emptyState({
      title: filtered ? "No projects match those filters" : "No projects yet",
      text: filtered
        ? "Try a different stack or status, or clear the filters."
        : "Be the first to post one — it takes about a minute.",
      action: el("a", {
        class: "btn btn--primary",
        href: CONFIG.PAGES.projectForm,
        text: "Submit Project",
      }),
    })
  );
}


// ---- The fetch ----

let requestId = 0;

async function load() {
  const mine = ++requestId;

  writeStateToUrl();

  // First paint gets skeletons; later loads dim the current grid instead of
  // blanking it, so changing a filter never makes the page jump.
  if (state.loaded) {
    grid.classList.add("is-loading");
  } else {
    showSkeletons();
  }

  startProgress();

  try {
    const data = await api.get("/search", {
      query: {
        // `q` is the omni search: title, developer name or project id.
        // `title` would only ever look at the title.
        q: state.q || undefined,
        status: state.status || undefined,
        techStack: state.techs.length > 0 ? state.techs : undefined,
        page: state.page,
        limit: LIMIT,
      },
    });

    // A slower earlier request must not overwrite a newer one
    if (mine !== requestId) return;

    const projects = data?.projects || [];

    state.loaded = true;

    countChip.textContent = `${data?.total ?? 0} project${(data?.total ?? 0) === 1 ? "" : "s"}`;

    if (projects.length === 0) {
      showEmpty();
      return;
    }

    grid.replaceChildren(
      ...projects.map((project) =>
        projectCard(project, { href: `${CONFIG.PAGES.project}?id=${project.id}` })
      )
    );

    paginationBox.replaceChildren(
      buildPagination({
        page: data.page,
        totalPages: data.totalPages,
        total: data.total,
        limit: data.limit,
        onChange: (nextPage) => {
          state.page = nextPage;
          load();
          window.scrollTo({ top: 0, behavior: "smooth" });
        },
      })
    );
  } catch (err) {
    if (mine !== requestId) return;

    grid.replaceChildren(
      emptyState({
        title: "Could not load projects",
        text: err.message,
      })
    );

    countChip.textContent = "—";
    toastError(err.message);
  } finally {
    // Every startProgress() needs its stop, including a superseded request —
    // otherwise the bar's pending count never returns to zero and it hangs.
    if (mine === requestId) {
      grid.classList.remove("is-loading");
    }

    stopProgress();
  }
}


// ---- Keyboard hint ----
// The label has to match the keyboard in front of the user: Apple shows ⌘,
// everything else shows Ctrl. The handler below accepts both.

function paintShortcutHint() {
  const box = qs("#search-kbd");
  if (!box) return;

  const isApple = /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);

  box.replaceChildren(
    el("kbd", { class: "kbd", text: isApple ? "⌘" : "Ctrl" }),
    el("kbd", { class: "kbd", text: "K" })
  );
}


// ---- Wiring ----

async function init() {
  readStateFromUrl();

  const user = await mountChrome("projects");

  // Posting a project needs an account: send people through login first
  if (!user) {
    submitBtn.href = `${CONFIG.PAGES.login}?next=${encodeURIComponent(CONFIG.PAGES.projectForm)}`;
  }

  // The filter button carries the funnel icon
  filtersBtn.prepend(icon("filter", 14));

  paintShortcutHint();

  await fetchMeta();
  buildStatusSelect();
  buildTechList();
  syncFilterCount();
  renderApplied();

  createPopover({
    root: qs("#filters-root"),
    trigger: filtersBtn,
    panel: qs("#filters-panel"),
  });

  qs("#clear-tech").addEventListener("click", () => clearTech(true));

  await load();

  // Clicking anywhere in the search box (icon or hint) focuses the input
  const iconBox = qs(".input-icon");
  if (iconBox) iconBox.addEventListener("click", () => searchInput.focus());

  // Search is debounced so typing does not fire a request per keystroke
  searchInput.addEventListener(
    "input",
    debounce(() => {
      state.q = searchInput.value.trim();
      state.page = 1;
      load();
    }, 350)
  );

  // ⌘K / Ctrl+K focuses the search box
  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      searchInput.focus();
      searchInput.select();
    }
  });
}

init();
