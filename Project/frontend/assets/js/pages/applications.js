// ============================================================
// pages/applications.js
// Purpose:   The owner's review screen for one project: every applicant, their
//            note and GitHub profile, and Accept / Reject.
//
// Endpoints:
//   GET   /api/projects/project-details/:id
//   GET   /api/projects/project-applications/:id
//   PATCH /api/applications/update-status/:id
//
// Note: the list endpoint returns every application at once (no pagination),
// so filtering by status happens in the browser — nothing is hidden.
// ============================================================

import { api } from "../core/api.js";
import { CONFIG } from "../core/config.js";
import { session } from "../core/session.js";
import { mountChrome } from "../ui/navbar.js";
import { el, qs, formatDate, emptyState, setBusy } from "../ui/dom.js";
import { statusBadge, avatar, filterSelect } from "../ui/pieces.js";
import { success as toastOk, error as toastError } from "../ui/toast.js";

const projectId = new URLSearchParams(window.location.search).get("id");

const listBox = qs("#list");
const summaryBox = qs("#summary");
const filtersBox = qs("#status-filters");
const pageTitle = qs("#page-title");
const pageLead = qs("#page-lead");
const backLink = qs("#back-link");
const headActions = qs("#head-actions");

const state = {
  project: null,
  applications: [],
  filter: "",
};

// Filled from /api/meta — the enum lives in the schema, not in this file
let applicationStatuses = [];


// ---- Header ----

function renderHeader() {
  const project = state.project;

  pageTitle.textContent = `Applications · ${project.title}`;
  pageLead.textContent =
    project.status === "OPEN"
      ? "Accept or reject each applicant. Their note is what they wrote when applying."
      : "This project is closed, so decisions are locked.";

  backLink.href = `${CONFIG.PAGES.project}?id=${project.id}`;
  backLink.textContent = "← Back to project";

  headActions.replaceChildren(
    el("a", {
      class: "btn btn--secondary",
      href: `${CONFIG.PAGES.project}?id=${project.id}`,
      text: "View project",
    }),
    // Same weight as its neighbour: a borderless ghost next to a bordered
    // button reads as plain text, not as a second action
    el("a", {
      class: "btn btn--secondary",
      href: `${CONFIG.PAGES.projectForm}?id=${project.id}`,
      text: "Edit",
    })
  );
}


// ---- Counters ----

function countBy(status) {
  return state.applications.filter((item) => item.status === status).length;
}

function renderSummary() {
  const pending = countBy("PENDING");
  const accepted = countBy("ACCEPTED");
  const rejected = countBy("REJECTED");

  const card = (label, value, note) =>
    el("div", { class: "stat" }, [
      el("div", { class: "stat__label", text: label }),
      el("div", { class: "stat__value", text: String(value) }),
      el("div", { class: "stat__note", text: note }),
    ]);

  summaryBox.replaceChildren(
    card("Total", state.applications.length, "applications received"),
    card("Pending", pending, pending === 0 ? "nothing waiting" : "waiting on you"),
    card("Accepted", accepted, "will collaborate"),
    card("Rejected", rejected, "turned down")
  );
}


// ---- Filters ----
// Same control as the browse page: one labelled select instead of a chip row.

let filterGroup = null;

function buildFilters() {
  filterGroup = filterSelect({
    container: filtersBox,
    label: "Status",
    allLabel: "All statuses",
    values: applicationStatuses,
    value: state.filter,
    format: (value) => value.toLowerCase(),
    onChange: (value) => {
      state.filter = value;
      renderList();
    },
  });
}

// After a decision the row's buttons are rebuilt, so put focus somewhere real
function focusFilters() {
  const select = filtersBox.querySelector("select");
  if (select) select.focus();
}


// ---- The list ----

function renderList() {
  const visible = state.filter
    ? state.applications.filter((item) => item.status === state.filter)
    : state.applications;

  if (state.applications.length === 0) {
    listBox.replaceChildren(
      emptyState({
        title: "No applications yet",
        text: "Once someone applies, their note shows up here.",
        action: el("a", {
          class: "btn btn--secondary",
          href: `${CONFIG.PAGES.project}?id=${state.project.id}`,
          text: "Back to the project",
        }),
      })
    );
    return;
  }

  if (visible.length === 0) {
    listBox.replaceChildren(
      emptyState({
        title: `Nothing ${state.filter.toLowerCase()}`,
        text: "Try another filter.",
      })
    );
    return;
  }

  listBox.replaceChildren(...visible.map(applicationCard));
}


function applicationCard(application) {
  const user = application.user || {};
  const projectOpen = state.project.status === "OPEN";
  const status = application.status;

  const actions = el("div", { class: "app-card__actions" });

  if (!projectOpen) {
    // Decisions are frozen while the project is closed
    actions.append(
      el("span", { class: "xs muted", text: `decided ${formatDate(application.updatedAt)}` }),
      el("span", { class: "badge badge--more", text: "project closed" })
    );
  } else {
    // Every other status is reachable at any time — the owner can undo a
    // decision by putting the applicant back to pending.
    if (status !== "PENDING") {
      actions.append(
        el("button", {
          type: "button",
          class: "btn btn--ghost btn--sm",
          text: "Set pending",
          onclick: (event) => decide(application, "PENDING", event.currentTarget),
        })
      );
    }

    if (status !== "REJECTED") {
      actions.append(
        el("button", {
          type: "button",
          class: "btn btn--secondary btn--sm",
          text: "Reject",
          onclick: (event) => decide(application, "REJECTED", event.currentTarget),
        })
      );
    }

    if (status !== "ACCEPTED") {
      actions.append(
        el("button", {
          type: "button",
          class: "btn btn--primary btn--sm",
          text: "Accept",
          onclick: (event) => decide(application, "ACCEPTED", event.currentTarget),
        })
      );
    }
  }

  // The status belongs beside the decision buttons — both answer "where does
  // this application stand, and what can I do about it?"
  actions.prepend(statusBadge(status));

  return el("article", { class: "card app-card" }, [
    el("div", { class: "app-card__main" }, [
      el("div", { class: "app-card__head" }, [
        el("div", { class: "person" }, [
          avatar(user.name || "?"),
          el("div", {}, [
            el("div", { class: "person__name", text: user.name || "Unknown" }),
            el("div", { class: "person__sub", text: user.email || "" }),
          ]),
        ]),
      ]),

      el("p", { class: "app-card__note", text: application.note }),

      el("div", { class: "app-card__meta" }, [
        el("a", {
          class: "xs mono-text",
          href: application.githubProfile,
          target: "_blank",
          rel: "noopener noreferrer",
          text: "github profile ↗",
        }),
        el("span", { class: "dot", text: "·" }),
        el("span", { class: "xs muted", text: `applied ${formatDate(application.createdAt)}` }),
      ]),
    ]),
    actions,
  ]);
}


// ---- Decisions ----

async function decide(application, status, button) {
  // Disable the whole action row BEFORE any re-render: the button still exists
  // in the DOM at this point, so the spinner is actually visible.
  const actions = button.closest(".app-card__actions");
  const buttons = actions ? Array.from(actions.querySelectorAll("button")) : [button];

  for (const item of buttons) setBusy(item, true);

  try {
    await api.patch(`/applications/update-status/${application.id}`, { status });

    application.status = status;

    renderSummary();
    renderList();
    focusFilters();

    toastOk(status === "ACCEPTED" ? "Application accepted" : "Application rejected");
  } catch (err) {
    for (const item of buttons) setBusy(item, false);
    toastError(err.message);
  }
}


// ---- Boot ----

async function init() {
  const user = await session.requireAuth();
  if (!user) return;

  await mountChrome("dashboard");

  if (!projectId) {
    listBox.replaceChildren(
      emptyState({
        title: "No project selected",
        text: "Open a project from your dashboard and choose “Review applications”.",
        action: el("a", { class: "btn btn--primary", href: CONFIG.PAGES.dashboard, text: "Go to dashboard" }),
      })
    );
    summaryBox.replaceChildren();
    return;
  }

  listBox.replaceChildren(el("div", { class: "skeleton skeleton--row" }));

  try {
    const [projectData, applicationsData, metaData] = await Promise.all([
      api.get(`/projects/project-details/${projectId}`),
      api.get(`/projects/project-applications/${projectId}`),
      // Filter vocabulary is decoration here — if it fails, show the list anyway
      api.get("/meta").catch(() => null),
    ]);

    state.project = projectData?.project;
    state.applications = applicationsData?.applications || [];
    applicationStatuses = metaData?.applicationStatuses || [];

    if (!state.project) {
      throw new Error("Project not found.");
    }

    document.title = `Applications · ${state.project.title} · ${CONFIG.BRAND}`;

    renderHeader();
    renderSummary();
    buildFilters();
    renderList();
  } catch (err) {
    // 403/404 here means the caller does not own this project
    listBox.replaceChildren(
      emptyState({
        title: "You cannot review this project",
        text:
          err.status === 403 || err.status === 404
            ? "Only the project's owner or an admin can see its applications."
            : err.message,
        action: el("a", {
          class: "btn btn--secondary",
          href: CONFIG.PAGES.dashboard,
          text: "Back to dashboard",
        }),
      })
    );

    summaryBox.replaceChildren();
    filtersBox.replaceChildren();
  }
}

init();
