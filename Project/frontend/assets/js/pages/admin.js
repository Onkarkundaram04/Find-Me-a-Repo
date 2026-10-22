// ============================================================
// pages/admin.js
// Purpose:   Three panels behind requireAdmin():
//              Overview  — platform counters
//              Users     — list, filter, change role/status, view details
//              Projects  — list via the public search, force delete
//
// Endpoints:
//   GET    /api/admin/platform-stats
//   GET    /api/admin/all-users
//   GET    /api/admin/user-details/:id
//   PATCH  /api/admin/update-user-status/:id
//   PATCH  /api/admin/update-user-role/:id
//   DELETE /api/admin/delete-project/:id
//   GET    /api/search                       (project list fallback)
// ============================================================

import { api } from "../core/api.js";
import { CONFIG } from "../core/config.js";
import { session } from "../core/session.js";
import { mountChrome } from "../ui/navbar.js";
import {
  el,
  qs,
  formatDate,
  confirmDialog,
  confirmTyped,
  buildPagination,
  setBusy,
  openModal,
  wireTabs,
} from "../ui/dom.js";
import { roleBadge, userStatusBadge, statusBadge, avatar, filterSelect } from "../ui/pieces.js";
import { success as toastOk, error as toastError, startProgress, stopProgress } from "../ui/toast.js";

const LIMIT = 10;

// Filled from /api/meta — the enums live in the schema, not in this file
const meta = {
  roles: [],
  userStatuses: [],
  projectStatuses: [],
};

const usersBody = qs("#users-body");
const usersPagination = qs("#users-pagination");
const projectsBody = qs("#projects-body");
const projectsPagination = qs("#projects-pagination");

let me = null;

// Only the first load shows skeletons; re-entering the tab refreshes silently
let overviewLoaded = false;

const state = {
  tab: "overview",
  users: { page: 1, role: "", status: "", loaded: false },
  projects: { page: 1, status: "", loaded: false },
};


// ---- Tabs ----

function setTab(tab, { load = true } = {}) {
  state.tab = tab;

  for (const button of Array.from(document.querySelectorAll(".tab"))) {
    const active = button.dataset.tab === tab;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  }

  qs("#panel-overview").hidden = tab !== "overview";
  qs("#panel-users").hidden = tab !== "users";
  qs("#panel-projects").hidden = tab !== "projects";

  window.history.replaceState(null, "", `${window.location.pathname}#${tab}`);

  if (!load) return;

  // Always refetch on entry. A deleted project or a changed role invalidates
  // every other tab's numbers, and a cached panel has no way to notice.
  if (tab === "overview") loadStats();
  else if (tab === "users") loadUsers();
  else loadProjects();
}


// After a row is removed its button is gone; put focus on the tab instead of
// dropping it back to <body>.
function focusTab(tab) {
  const button = document.querySelector(`.tab[data-tab="${tab}"]`);
  if (button) button.focus();
}

// Reloading the users table rebuilds every row, so focus is restored to the
// control the admin just used on that user.
function focusUserControl(kind, userId) {
  const control = document.querySelector(`[data-user-${kind}="${userId}"]`);
  if (control) control.focus();
}


// ---- Overview ----

// Three headline numbers, each with a one-line summary underneath.
function kpiCard({ label, value, note }) {
  return el("div", { class: "kpi" }, [
    el("div", { class: "kpi__label", text: label }),
    el("div", { class: "kpi__value", text: String(value) }),
    el("div", { class: "kpi__note", text: note }),
  ]);
}

// A proportion is easier to read as a bar than as another row of numbers.
// rows: [{ label, count, tone }]
function breakdownCard({ title, rows }) {
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const body = el("div", { class: "bar-list" });

  for (const row of rows) {
    const percent = total === 0 ? 0 : Math.round((row.count / total) * 100);

    const fill = el("div", { class: `bar-row__fill bar-row__fill--${row.tone || "neutral"}` });
    fill.style.width = `${percent}%`;

    body.append(
      el("div", { class: "bar-row" }, [
        el("div", { class: "bar-row__head" }, [
          el("span", { class: "bar-row__label", text: row.label }),
          el("span", { class: "bar-row__count" }, [
            String(row.count),
            el("span", { class: "bar-row__pct", text: `${percent}%` }),
          ]),
        ]),
        el("div", { class: "bar-row__track" }, [fill]),
      ])
    );
  }

  return el("section", { class: "card overview-card" }, [
    el("div", { class: "card__sub", text: title }),
    body,
  ]);
}

function showOverviewSkeletons() {
  qs("#overview-kpis").replaceChildren(
    ...[0, 1, 2].map(() => el("div", { class: "skeleton kpi-skeleton" }))
  );

  qs("#overview-breakdowns").replaceChildren(
    ...[0, 1, 2].map(() => el("div", { class: "skeleton breakdown-skeleton" }))
  );
}

async function loadStats() {
  if (!overviewLoaded) {
    showOverviewSkeletons();
  }

  try {
    const stats = await api.get("/admin/platform-stats");

    overviewLoaded = true;

    const users = stats.users;
    const projects = stats.projects;
    const applications = stats.applications;

    qs("#overview-kpis").replaceChildren(
      kpiCard({
        label: "Accounts",
        value: users.total,
        note: `${users.active} active · ${users.suspended} suspended · ${users.deactivated} deactivated`,
      }),
      kpiCard({
        label: "Projects",
        value: projects.total,
        note: `${projects.open} open · ${projects.closed} closed`,
      }),
      kpiCard({
        label: "Applications",
        value: applications.total,
        note: `${applications.pending} waiting on an owner`,
      })
    );

    qs("#overview-breakdowns").replaceChildren(
      breakdownCard({
        title: "ACCOUNTS BY STATUS",
        rows: [
          { label: "Active", count: users.active, tone: "ok" },
          { label: "Suspended", count: users.suspended, tone: "warn" },
          { label: "Deactivated", count: users.deactivated, tone: "neutral" },
        ],
      }),
      breakdownCard({
        title: "PROJECTS BY STATUS",
        rows: [
          { label: "Open", count: projects.open, tone: "ok" },
          // Red, matching Rejected on the applications card: both are the
          // state where the thing has stopped accepting anything.
          { label: "Closed", count: projects.closed, tone: "danger" },
        ],
      }),
      breakdownCard({
        title: "APPLICATIONS BY RESULT",
        rows: [
          { label: "Pending", count: applications.pending, tone: "warn" },
          { label: "Accepted", count: applications.accepted, tone: "ok" },
          { label: "Rejected", count: applications.rejected, tone: "danger" },
        ],
      })
    );
  } catch (err) {
    qs("#overview-kpis").replaceChildren();
    qs("#overview-breakdowns").replaceChildren(
      el("div", { class: "empty" }, [
        el("div", { class: "empty__title", text: "Could not load the platform numbers" }),
        el("p", { class: "empty__text", text: err.message }),
      ])
    );

    toastError(err.message);
  }
}


// ---- Metadata ----

async function fetchMeta() {
  try {
    const data = await api.get("/meta");

    meta.roles = data?.roles || [];
    meta.userStatuses = data?.userStatuses || [];
    meta.projectStatuses = data?.projectStatuses || [];
  } catch (err) {
    toastError(`Filter options unavailable: ${err.message}`);
  }
}


// ---- Filters (same control as the browse page) ----

function buildUserFilters() {
  filterSelect({
    container: qs("#user-role-filters"),
    label: "Role",
    allLabel: "All roles",
    values: meta.roles,
    value: state.users.role,
    format: (value) => value.toLowerCase(),
    onChange: (value) => {
      state.users.role = value;
      state.users.page = 1;
      loadUsers();
    },
  });

  filterSelect({
    container: qs("#user-status-filters"),
    label: "Status",
    allLabel: "All statuses",
    values: meta.userStatuses,
    value: state.users.status,
    format: (value) => value.toLowerCase(),
    onChange: (value) => {
      state.users.status = value;
      state.users.page = 1;
      loadUsers();
    },
  });
}

function buildProjectFilters() {
  filterSelect({
    container: qs("#project-status-filters"),
    label: "Status",
    allLabel: "All statuses",
    values: meta.projectStatuses,
    value: state.projects.status,
    format: (value) => value.toLowerCase(),
    onChange: (value) => {
      state.projects.status = value;
      state.projects.page = 1;
      loadProjects();
    },
  });
}


// ---- Users ----

function loadingRow(colspan) {
  return el("tr", {}, [
    el("td", { colspan: String(colspan) }, [el("div", { class: "skeleton skeleton--row" })]),
  ]);
}

async function loadUsers() {
  if (state.users.loaded) {
    usersBody.classList.add("is-loading");
  } else {
    usersBody.replaceChildren(loadingRow(6));
  }

  usersPagination.replaceChildren();
  startProgress();

  try {
    const data = await api.get("/admin/all-users", {
      query: {
        page: state.users.page,
        limit: LIMIT,
        role: state.users.role || undefined,
        status: state.users.status || undefined,
      },
    });

    const users = data?.users || [];
    state.users.loaded = true;

    if (users.length === 0) {
      usersBody.replaceChildren(
        el("tr", { class: "table__empty" }, [
          el("td", { colspan: "6", text: "No users match these filters." }),
        ])
      );
      return;
    }

    usersBody.replaceChildren(...users.map(userRow));

    usersPagination.replaceChildren(
      buildPagination({
        page: data.page,
        totalPages: data.totalPages,
        total: data.total,
        limit: data.limit,
        onChange: (page) => {
          state.users.page = page;
          loadUsers();
        },
      })
    );
  } catch (err) {
    usersBody.replaceChildren(
      el("tr", { class: "table__empty" }, [el("td", { colspan: "6", text: err.message })])
    );
    toastError(err.message);
  } finally {
    usersBody.classList.remove("is-loading");
    stopProgress();
  }
}

function userRow(user) {
  const isMe = user.id === me.id;

  // The backend refuses self-targeting; disable instead of failing a click
  const statusSelect = el("select", {
    class: "select select--sm",
    disabled: isMe,
    "aria-label": `Status for ${user.name}`,
    "data-user-status": user.id,
    title: isMe ? "You cannot change your own account" : "Change status",
    onchange: (event) => updateUserStatus(user, event.currentTarget, event.target.value),
  });

  // What an admin may set. DEACTIVATED is deliberately not offered: that is a
  // state the user chooses for themselves, and an admin reactivates them.
  const settableStatuses = meta.userStatuses.filter((value) => value !== "DEACTIVATED");

  // A deactivated account has no matching option, so it is prepended as current
  if (user.status === "DEACTIVATED") {
    statusSelect.append(el("option", { value: "DEACTIVATED", text: "DEACTIVATED" }));
  }

  for (const value of settableStatuses) {
    statusSelect.append(el("option", { value, text: value }));
  }

  statusSelect.value = user.status;

  const roleSelect = el("select", {
    class: "select select--sm",
    disabled: isMe,
    "aria-label": `Role for ${user.name}`,
    "data-user-role": user.id,
    title: isMe ? "You cannot change your own role" : "Change role",
    onchange: (event) => updateUserRole(user, event.currentTarget, event.target.value),
  });

  for (const value of meta.roles) {
    roleSelect.append(el("option", { value, text: value }));
  }

  roleSelect.value = user.role;

  return el("tr", {}, [
    el("td", {}, [
      el("div", { class: "person" }, [
        avatar(user.name),
        el("div", {}, [
          el("div", { class: "person__name", text: user.name + (isMe ? " (you)" : "") }),
          el("div", { class: "person__sub", text: user.email }),
        ]),
      ]),
    ]),
    el("td", {}, [roleBadge(user.role)]),
    el("td", {}, [userStatusBadge(user.status)]),
    el("td", { class: "num", text: String(user._count?.projects ?? 0) }),
    el("td", { class: "num", text: String(user._count?.applications ?? 0) }),
    el("td", { class: "actions" }, [
      el("div", { class: "admin-actions" }, [
        statusSelect,
        roleSelect,
        el("button", {
          type: "button",
          class: "btn btn--ghost btn--sm",
          text: "View",
          onclick: () => openUserDetails(user),
        }),
      ]),
    ]),
  ]);
}

async function updateUserStatus(user, select, status) {
  if (status === user.status) return;

  const ok = await confirmDialog({
    title: `${status === "SUSPENDED" ? "Suspend" : "Reactivate"} ${user.name}?`,
    text:
      status === "SUSPENDED"
        ? "They will be signed out and blocked from signing in."
        : "They will be able to sign in again.",
    confirmLabel: status === "SUSPENDED" ? "Suspend" : "Reactivate",
    danger: status === "SUSPENDED",
  });

  if (!ok) {
    select.value = user.status;
    return;
  }

  try {
    setBusy(select, true);
    await api.patch(`/admin/update-user-status/${user.id}`, { status });
    toastOk(`${user.name} is now ${status.toLowerCase()}`);
    await loadUsers();
    focusUserControl("status", user.id);
  } catch (err) {
    select.value = user.status;
    setBusy(select, false);
    toastError(err.message);
  }
}

async function updateUserRole(user, select, role) {
  if (role === user.role) return;

  const ok = await confirmDialog({
    title: `Make ${user.name} ${role === "ADMIN" ? "an admin" : "a regular user"}?`,
    text:
      role === "ADMIN"
        ? "Admins can manage every user and delete any project."
        : "They lose access to the admin panel immediately.",
    confirmLabel: "Change role",
    danger: role === "USER",
  });

  if (!ok) {
    select.value = user.role;
    return;
  }

  try {
    setBusy(select, true);
    await api.patch(`/admin/update-user-role/${user.id}`, { role });
    toastOk(`${user.name} is now ${role}`);
    await loadUsers();
    focusUserControl("role", user.id);
  } catch (err) {
    select.value = user.role;
    setBusy(select, false);
    toastError(err.message);
  }
}


// ---- User details modal ----

async function openUserDetails(userSummary) {
  let data;

  try {
    data = await api.get(`/admin/user-details/${userSummary.id}`, { query: { limit: 10 } });
  } catch (err) {
    toastError(err.message);
    return;
  }

  const user = data.user;
  const projects = data.projects?.projects || [];
  const applications = data.applications?.applications || [];

  let handle = null;

  const section = (title, rows, emptyText) =>
    el("div", { class: "modal__section" }, [
      el("div", { class: "card__sub", text: title }),
      rows.length
        ? el("div", { class: "stack stack--tight mt-2" }, rows)
        : el("p", { class: "xs muted mt-2", text: emptyText }),
    ]);

  const panel = el("div", { class: "modal__panel modal__panel--lg" }, [
    el("div", { class: "row modal__head" }, [
      avatar(user.name, "lg"),
      el("div", { class: "modal__head-text" }, [
        el("div", { class: "strong", text: user.name }),
        el("div", { class: "xs muted", text: user.email }),
      ]),
      el("div", { class: "row" }, [roleBadge(user.role), userStatusBadge(user.status)]),
    ]),

    el("hr", { class: "divider" }),

    section(
      `PROJECTS (${data.projects?.total ?? 0})`,
      projects.map((project) =>
        el("a", {
          class: "modal__list-item",
          href: `${CONFIG.PAGES.project}?id=${project.id}`,
          text: `${project.title} — ${project.status}`,
        })
      ),
      "No projects."
    ),

    section(
      `APPLICATIONS (${data.applications?.total ?? 0})`,
      applications.map((application) =>
        el("div", { class: "modal__list-item" }, [
          el("span", { text: application.project?.title || "Project" }),
          statusBadge(application.status),
        ])
      ),
      "No applications."
    ),

    el("div", { class: "modal__actions" }, [
      // Deleting someone else's account is irreversible and cascades their
      // projects with them, so it needs the typed confirmation, not a click.
      user.id === me.id
        ? null
        : el("button", {
            type: "button",
            class: "btn btn--danger-ghost",
            text: "Delete account",
            onclick: () => deleteUser(user, handle),
          }),
      el("button", {
        type: "button",
        class: "btn btn--secondary",
        text: "Close",
        onclick: () => handle.close(),
      }),
    ]),
  ]);

  // openModal owns the focus trap, Escape handling, scroll lock and focus restore
  handle = openModal(panel);
}


// ---- Delete a user (admin) ----

async function deleteUser(user, modalHandle) {
  const ok = await confirmTyped({
    title: `Delete ${user.name}?`,
    text:
      "The account is removed for good, and every project and application " +
      "belonging to it is deleted with it. Suspending keeps the data instead.",
    word: "DELETE",
    confirmLabel: "Delete account",
  });

  if (!ok) return;

  try {
    await api.del(`/admin/delete-user/${user.id}`);

    modalHandle.close();
    toastOk(`${user.name} deleted`);
    await loadUsers();
    focusTab("users");
  } catch (err) {
    toastError(err.message);
  }
}


// ---- Projects ----

async function loadProjects() {
  if (state.projects.loaded) {
    projectsBody.classList.add("is-loading");
  } else {
    projectsBody.replaceChildren(loadingRow(6));
  }

  projectsPagination.replaceChildren();
  startProgress();

  try {
    // There is no admin project list endpoint, so this uses the public search
    const data = await api.get("/search", {
      query: {
        page: state.projects.page,
        limit: LIMIT,
        status: state.projects.status || undefined,
      },
    });

    const projects = data?.projects || [];
    state.projects.loaded = true;

    if (projects.length === 0) {
      projectsBody.replaceChildren(
        el("tr", { class: "table__empty" }, [
          el("td", { colspan: "6", text: "No projects match these filters." }),
        ])
      );
      return;
    }

    projectsBody.replaceChildren(...projects.map(projectRow));

    projectsPagination.replaceChildren(
      buildPagination({
        page: data.page,
        totalPages: data.totalPages,
        total: data.total,
        limit: data.limit,
        onChange: (page) => {
          state.projects.page = page;
          loadProjects();
        },
      })
    );
  } catch (err) {
    projectsBody.replaceChildren(
      el("tr", { class: "table__empty" }, [el("td", { colspan: "6", text: err.message })])
    );
    toastError(err.message);
  } finally {
    projectsBody.classList.remove("is-loading");
    stopProgress();
  }
}

function projectRow(project) {
  return el("tr", {}, [
    el("td", {}, [
      el("a", {
        class: "strong",
        href: `${CONFIG.PAGES.project}?id=${project.id}`,
        text: project.title,
      }),
      el("div", { class: "xs muted mono-text", text: project.id.slice(0, 8) }),
    ]),
    el("td", {}, [
      el("div", { class: "person" }, [
        avatar(project.owner?.name || "?"),
        el("span", { class: "person__sub", text: project.owner?.name || "—" }),
      ]),
    ]),
    el("td", {}, [projectStatusSelect(project)]),
    el("td", { class: "num", text: String(project._count?.applications ?? 0) }),
    el("td", { class: "num", text: formatDate(project.createdAt) }),
    el("td", { class: "actions" }, [
      el("button", {
        type: "button",
        class: "btn btn--danger-ghost btn--sm",
        text: "Delete",
        onclick: (event) => deleteProject(project, event.currentTarget),
      }),
    ]),
  ]);
}

// Admin can open or close a project straight from the table, without going
// through the edit form. verifyOwner lets an admin through on this route.
function projectStatusSelect(project) {
  const select = el("select", {
    class: "select select--sm",
    "aria-label": `Status for ${project.title}`,
    "data-project-status": project.id,
    onchange: (event) => updateProjectStatus(project, event.currentTarget, event.target.value),
  });

  for (const value of meta.projectStatuses) {
    select.append(el("option", { value, text: value }));
  }

  select.value = project.status;

  return select;
}

async function updateProjectStatus(project, select, status) {
  if (status === project.status) return;

  try {
    setBusy(select, true);
    await api.patch(`/projects/update-project/${project.id}`, { status });
    toastOk(`${project.title} is now ${status.toLowerCase()}`);

    await loadProjects();

    // Re-render replaces the row, so put focus back on the same control
    const fresh = document.querySelector(`[data-project-status="${project.id}"]`);
    if (fresh) fresh.focus();
  } catch (err) {
    select.value = project.status;
    setBusy(select, false);
    toastError(err.message);
  }
}


async function deleteProject(project, button) {  const ok = await confirmDialog({
    title: `Delete "${project.title}"?`,
    text: "Every application sent to it is deleted too. This cannot be undone.",
    confirmLabel: "Delete",
    danger: true,
  });

  if (!ok) return;

  try {
    setBusy(button, true);
    await api.del(`/admin/delete-project/${project.id}`);
    toastOk("Project deleted");
    await loadProjects();
    focusTab("projects");
  } catch (err) {
    setBusy(button, false);
    toastError(err.message);
  }
}


// ---- Boot ----

async function init() {
  me = await session.requireAdmin();
  if (!me) return;

  await mountChrome("admin");

  const hash = window.location.hash.replace("#", "");
  const tab = ["users", "projects"].includes(hash) ? hash : "overview";

  setTab(tab, { load: false });
  wireTabs(setTab);

  // Everything the filter rows and row selects offer comes from the schema
  await fetchMeta();

  buildUserFilters();
  buildProjectFilters();

  // Load only the panel that is actually visible
  if (tab === "overview") loadStats();
  if (tab === "users") loadUsers();
  if (tab === "projects") loadProjects();
}

init();
