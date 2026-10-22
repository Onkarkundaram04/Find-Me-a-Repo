// ============================================================
// pages/dashboard.js
// Purpose:   Two lists behind one page — the projects you own and the
//            applications you sent. Each tab owns its data, filter and
//            pagination; the open tab is kept in the URL hash.
//
// Endpoints:
//   GET    /api/projects/my-projects
//   GET    /api/applications/my-applications
//   DELETE /api/projects/delete-project/:id
//   DELETE /api/applications/delete-application/:id
// ============================================================

import { api } from "../core/api.js";
import { CONFIG } from "../core/config.js";
import { session } from "../core/session.js";
import { mountChrome } from "../ui/navbar.js";
import {
  el,
  qs,
  qsa,
  formatDate,
  confirmDialog,
  buildPagination,
  emptyState,
  setBusy,
  wireTabs,
} from "../ui/dom.js";
import {
  projectCard,
  statusBadge,
  skeletonCards,
  skeletonRows,
  filterSelect,
} from "../ui/pieces.js";
import { icon } from "../ui/icons.js";
import { success as toastOk, error as toastError, startProgress, stopProgress } from "../ui/toast.js";

const LIMIT = 9;

// Filled from /api/meta — the enum lives in the schema, not in this file
let applicationStatuses = [];

const projectsList = qs("#projects-list");
const projectsPagination = qs("#projects-pagination");
const appsList = qs("#apps-list");
const appsPagination = qs("#apps-pagination");
const statusFilters = qs("#app-status-filters");
const projectsCount = qs("#projects-count");
const appsCount = qs("#apps-count");

const state = {
  projects: { page: 1, loaded: false },
  // total = the unfiltered count, so the tab badge stays stable while filtering
  applications: { page: 1, status: "", loaded: false, total: null },
};

let statusGroup = null;


// ---- Tabs ----

function setTab(tab, { refresh = true } = {}) {
  for (const button of qsa(".tab")) {
    const active = button.dataset.tab === tab;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  }

  qs("#panel-projects").hidden = tab !== "projects";
  qs("#panel-applications").hidden = tab !== "applications";

  window.history.replaceState(null, "", `${window.location.pathname}#${tab}`);

  // Re-entering a tab refetches it. Without this, a project deleted on one tab
  // stayed visible on the other until a full page reload.
  if (!refresh) return;

  if (tab === "projects") loadProjects();
  else loadApplications();
}


// ---- Tab counters ----
// Hidden until the real number arrives. Showing "0" while the request is in
// flight is a lie the user can see.

function setCount(element, value) {
  element.textContent = String(value);
  element.hidden = false;
}


// After a row is removed its button is gone, so focus would fall back to <body>.
// The tab that owns the list is a stable, meaningful target.
function focusTab(tab) {
  const button = qs(`.tab[data-tab="${tab}"]`);
  if (button) button.focus();
}


// ---- Applications status filters (built once, then only toggled) ----

async function fetchMeta() {
  try {
    const data = await api.get("/meta");
    applicationStatuses = data?.applicationStatuses || [];
  } catch (err) {
    toastError(`Filter options unavailable: ${err.message}`);
  }
}

function buildStatusFilters() {
  // Same control as the browse page: one labelled select, not a row of chips
  statusGroup = filterSelect({
    container: statusFilters,
    label: "Status",
    allLabel: "All statuses",
    values: applicationStatuses,
    value: state.applications.status,
    format: (value) => value.toLowerCase(),
    onChange: (value) => {
      state.applications.status = value;
      state.applications.page = 1;
      loadApplications();
    },
  });
}


// ---- My projects ----

async function loadProjects() {
  if (state.projects.loaded) {
    projectsList.classList.add("is-loading");
  } else {
    projectsList.replaceChildren(...skeletonCards(3));
  }

  projectsPagination.replaceChildren();
  startProgress();

  try {
    const data = await api.get("/projects/my-projects", {
      query: { page: state.projects.page, limit: LIMIT },
    });

    const projects = data?.projects || [];
    state.projects.loaded = true;

    setCount(projectsCount, data?.total ?? 0);

    if (projects.length === 0) {
      projectsList.replaceChildren(
        emptyState({
          title: "No projects yet",
          text: "Post your first project and people can start applying.",
          action: el("a", {
            class: "btn btn--primary",
            href: CONFIG.PAGES.projectForm,
            text: "Create a project",
          }),
        })
      );
      return;
    }

    projectsList.replaceChildren(
      ...projects.map((project) =>
        projectCard(project, {
          href: `${CONFIG.PAGES.project}?id=${project.id}`,
          actions: el("div", { class: "row" }, [
            el(
              "a",
              {
                class: "btn btn--icon",
                href: `${CONFIG.PAGES.projectForm}?id=${project.id}`,
                title: "Edit project",
                "aria-label": `Edit ${project.title}`,
              },
              [icon("edit")]
            ),
            el(
              "button",
              {
                type: "button",
                class: "btn btn--icon",
                title: "Delete project",
                "aria-label": `Delete ${project.title}`,
                onclick: (event) => deleteProject(project, event.currentTarget),
              },
              [icon("trash")]
            ),
          ]),
        })
      )
    );

    projectsPagination.replaceChildren(
      buildPagination({
        page: data.page,
        totalPages: data.totalPages,
        total: data.total,
        limit: data.limit,
        onChange: (page) => {
          state.projects.page = page;
          loadProjects();
          window.scrollTo({ top: 0, behavior: "smooth" });
        },
      })
    );
  } catch (err) {
    projectsList.replaceChildren(
      emptyState({ title: "Could not load your projects", text: err.message })
    );
    toastError(err.message);
  } finally {
    projectsList.classList.remove("is-loading");
    stopProgress();
  }
}


async function deleteProject(project, button) {
  const ok = await confirmDialog({
    title: `Delete "${project.title}"?`,
    text: "Every application sent to it is deleted too. This cannot be undone.",
    confirmLabel: "Delete",
    danger: true,
  });

  if (!ok) return;

  try {
    setBusy(button, true);
    await api.del(`/projects/delete-project/${project.id}`);
    toastOk("Project deleted");
    await loadProjects();
    focusTab("projects");
  } catch (err) {
    setBusy(button, false);
    toastError(err.message);
  }
}


// ---- My applications ----

async function loadApplications() {
  if (state.applications.loaded) {
    appsList.classList.add("is-loading");
  } else {
    appsList.replaceChildren(...skeletonRows(3));
  }

  appsPagination.replaceChildren();
  startProgress();

  try {
    const data = await api.get("/applications/my-applications", {
      query: {
        page: state.applications.page,
        limit: LIMIT,
        status: state.applications.status || undefined,
      },
    });

    const applications = data?.applications || [];
    state.applications.loaded = true;

    // Unfiltered total drives the tab badge; filtering must not change it
    if (!state.applications.status) {
      state.applications.total = data?.total ?? 0;
    }

    if (state.applications.total !== null) {
      setCount(appsCount, state.applications.total);
    }

    if (applications.length === 0) {
      appsList.replaceChildren(
        emptyState({
          title: state.applications.status ? "Nothing with that status" : "No applications yet",
          text: state.applications.status
            ? "Try a different filter."
            : "Browse the board and apply to a project that fits your stack.",
          action: el("a", {
            class: "btn btn--primary",
            href: CONFIG.PAGES.browse,
            text: "Browse projects",
          }),
        })
      );
      return;
    }

    appsList.replaceChildren(...applications.map(applicationRow));

    appsPagination.replaceChildren(
      buildPagination({
        page: data.page,
        totalPages: data.totalPages,
        total: data.total,
        limit: data.limit,
        onChange: (page) => {
          state.applications.page = page;
          loadApplications();
          window.scrollTo({ top: 0, behavior: "smooth" });
        },
      })
    );
  } catch (err) {
    appsList.replaceChildren(
      emptyState({ title: "Could not load your applications", text: err.message })
    );
    toastError(err.message);
  } finally {
    appsList.classList.remove("is-loading");
    stopProgress();
  }
}


function applicationRow(application) {
  const project = application.project || {};
  const pending = application.status === "PENDING";

  return el("article", { class: "card app-row" }, [
    el("div", { class: "app-row__main" }, [
      el("div", { class: "app-row__head" }, [
        el("a", {
          class: "app-row__title",
          href: `${CONFIG.PAGES.project}?id=${project.id}`,
          text: project.title || "Project",
        }),
        statusBadge(application.status),
        project.status ? statusBadge(project.status) : null,
      ]),
      el("p", { class: "app-row__note", text: application.note }),
      el("div", { class: "app-row__meta" }, [
        el("span", { class: "xs muted", text: `sent ${formatDate(application.createdAt)}` }),
        el("span", { class: "dot", text: "·" }),
        el("a", {
          class: "xs mono-text",
          href: application.githubProfile,
          target: "_blank",
          rel: "noopener noreferrer",
          text: "your profile ↗",
        }),
        // The project's repository belongs next to your own profile: one link
        // to who you are, one to what you applied to.
        project.githubUrl
          ? el("span", { class: "dot", text: "·" })
          : null,
        project.githubUrl
          ? el("a", {
              class: "xs mono-text",
              href: project.githubUrl,
              target: "_blank",
              rel: "noopener noreferrer",
              text: "project repo ↗",
            })
          : null,
      ]),
    ]),
    el("div", { class: "app-row__actions" }, [
      pending
        ? el("button", {
            type: "button",
            class: "btn btn--secondary btn--sm",
            text: "Withdraw",
            onclick: (event) => withdraw(application, event.currentTarget),
          })
        : el("span", { class: "xs muted", text: "decided" }),
    ]),
  ]);
}


async function withdraw(application, button) {
  const ok = await confirmDialog({
    title: "Withdraw this application?",
    text: "You can apply again later, as long as the project is still open.",
    confirmLabel: "Withdraw",
    danger: true,
  });

  if (!ok) return;

  try {
    setBusy(button, true);
    await api.del(`/applications/delete-application/${application.id}`);

    // Withdrawing removes one application outright, so the badge can follow
    // immediately even when a status filter is hiding the rest.
    if (state.applications.total !== null) {
      state.applications.total = Math.max(0, state.applications.total - 1);
      setCount(appsCount, state.applications.total);
    }

    toastOk("Application withdrawn");
    await loadApplications();
    focusTab("applications");
  } catch (err) {
    setBusy(button, false);
    toastError(err.message);
  }
}


// ---- Boot ----

async function init() {
  const user = await session.requireAuth();
  if (!user) return;

  await mountChrome("dashboard");

  const hash = window.location.hash.replace("#", "");
  setTab(hash === "applications" ? "applications" : "projects", { refresh: false });

  // One wiring call: click + arrow keys + roving tabindex
  wireTabs(setTab);

  await fetchMeta();
  buildStatusFilters();

  // BOTH lists load up front. The tab counters have to be true before you
  // click anything, and switching tabs should never wait on the network.
  await Promise.all([loadProjects(), loadApplications()]);
}

init();
