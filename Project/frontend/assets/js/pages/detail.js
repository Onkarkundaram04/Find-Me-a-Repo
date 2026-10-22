// ============================================================
// pages/detail.js
// Purpose:   One project: description, owner, and the right action panel
//            for whoever is looking at it (visitor / applicant / owner / admin).
//
// Endpoints:
//   GET    /api/projects/project-details/:id
//   GET    /api/applications/my-applications   (only when logged in)
//   POST   /api/applications/apply
//   DELETE /api/projects/delete-project/:id    (owner or admin)
// ============================================================

import { api } from "../core/api.js";
import { CONFIG } from "../core/config.js";
import { session } from "../core/session.js";
import { mountChrome } from "../ui/navbar.js";
import { el, qs, formatDate, confirmDialog, setBusy } from "../ui/dom.js";
import { statusBadge, chipList, avatar } from "../ui/pieces.js";
import { success as toastOk, error as toastError } from "../ui/toast.js";

// Same rule the backend applies, so the user sees the mistake before the round trip
const GITHUB_PROFILE = /^(https?:\/\/)?(www\.)?github\.com\/[a-zA-Z0-9-]+\/?$/;
const NOTE_MAX = 500;

const root = qs("#detail");
const params = new URLSearchParams(window.location.search);
const projectId = params.get("id");

let user = null;
let project = null;
let myApplication = null;


// ---- Page shell ----

async function copyProjectId() {
  try {
    await navigator.clipboard.writeText(project.id);
    toastOk("Project ID copied");
  } catch {
    toastError("Could not copy the ID");
  }
}

function renderNotFound(message) {
  root.replaceChildren(
    el("div", { class: "empty" }, [
      el("div", { class: "empty__title", text: "Project not found" }),
      el("p", { class: "empty__text", text: message || "This project may have been deleted." }),
      el("div", { class: "empty__actions" }, [
        el("a", { class: "btn btn--secondary", href: CONFIG.PAGES.browse, text: "Browse projects" }),
      ]),
    ])
  );
}

function render() {
  const isOwner = Boolean(user && project.owner?.id === user.id);
  const isAdmin = user?.role === "ADMIN";
  const isOpen = project.status === "OPEN";
  const applicantCount = project.applicationsCount ?? 0;

  const title = el("h1", { class: "detail__title", text: project.title });

  const head = el("header", { class: "detail__head" }, [
    el("div", { class: "detail__head-row" }, [title, statusBadge(project.status)]),
    el("div", { class: "detail__meta" }, [
      el("span", { class: "owner" }, [
        avatar(project.owner?.name || "?"),
        el("span", { class: "owner__name", text: project.owner?.name || "Unknown" }),
      ]),
      el("span", { class: "dot", text: "·" }),
      el("span", { class: "xs muted", text: `posted ${formatDate(project.createdAt)}` }),
      el("span", { class: "dot", text: "·" }),
      // The id is the thing you search by, so it has to be visible somewhere
      el("button", {
        type: "button",
        class: "detail__id mono-text xs",
        title: `Copy the full project id: ${project.id}`,
        text: `id ${project.id.slice(0, 8)}…`,
        onclick: () => copyProjectId(),
      }),
      project.githubUrl
        ? el("a", {
            class: "detail__github mono-text xs",
            href: project.githubUrl,
            target: "_blank",
            rel: "noopener noreferrer",
            text: "repository ↗",
          })
        : null,
    ]),
  ]);

  const body = el("div", { class: "card detail__body" }, [
    el("div", { class: "card__sub", text: "ABOUT" }),
    el("div", { class: "detail__desc", text: project.description }),
    el("div", { class: "detail__stack" }, [
      el("div", { class: "card__sub", text: "STACK" }),
      chipList(project.techStack || [], 20),
    ]),
  ]);

  const side = el("aside", { class: "detail__side" }, [
    el("div", { class: "card" }, [
      el("div", { class: "side__count" }, [
        el("span", { class: "side__count-value", text: String(applicantCount) }),
        el("span", {
          class: "side__count-label",
          text: applicantCount === 1 ? "applicant" : "applicants",
        }),
      ]),
      el("hr", { class: "divider" }),
      buildActionPanel({ isOwner, isAdmin, isOpen }),
    ]),
  ]);

  root.replaceChildren(el("div", { class: "split detail" }, [el("div", {}, [head, body]), side]));
}


// ---- The action panel: one of six states ----

function buildActionPanel({ isOwner, isAdmin, isOpen }) {
  // 1. Owner looking at their own project
  if (isOwner) {
    return el("div", { class: "stack stack--tight" }, [
      el("div", { class: "panel-note", text: "This is your project." }),
      el("a", {
        class: "btn btn--secondary btn--full",
        href: `${CONFIG.PAGES.applications}?id=${project.id}`,
        text: "Review applications",
      }),
      el("a", {
        class: "btn btn--ghost btn--full",
        href: `${CONFIG.PAGES.projectForm}?id=${project.id}`,
        text: "Edit project",
      }),
      el("button", {
        type: "button",
        class: "btn btn--danger-ghost btn--full",
        text: "Delete project",
        onclick: (event) => onDelete(event.currentTarget),
      }),
    ]);
  }

  // 2. Visitor who is not signed in
  if (!user) {
    return el("div", { class: "stack stack--tight" }, [
      el("p", { class: "panel-note", text: isOpen ? "Sign in to apply to this project." : "This project is closed." }),
      isOpen
        ? el("a", {
            class: "btn btn--primary btn--full",
            href: `${CONFIG.PAGES.login}?next=${encodeURIComponent(`project.html?id=${project.id}`)}`,
            text: "Sign in to apply",
          })
        : null,
      isAdmin ? adminDeleteButton() : null,
    ]);
  }

  // 3. Already applied
  if (myApplication) {
    const decided = myApplication.status !== "PENDING";

    return el("div", { class: "stack stack--tight" }, [
      el("p", { class: "panel-note", text: "You already applied to this project." }),
      el("div", { class: "row" }, [
        el("span", { class: "xs muted", text: "Status" }),
        statusBadge(myApplication.status),
      ]),
      el("p", {
        class: "xs muted",
        text: decided
          ? "The owner has made a decision."
          : "The owner has not decided yet.",
      }),
      el("a", {
        class: "btn btn--secondary btn--full",
        href: CONFIG.PAGES.dashboard,
        text: "Go to my applications",
      }),
    ]);
  }

  // 4. Project closed
  if (!isOpen) {
    return el("div", { class: "stack stack--tight" }, [
      el("p", { class: "panel-note", text: "This project is closed and no longer takes applications." }),
      isAdmin ? adminDeleteButton() : null,
    ]);
  }

  // 5. Admin who is not the owner — can collaborate like anyone else, and
  //    keeps the moderation tools underneath. Being an admin does not stop
  //    you applying to somebody else's project.
  if (isAdmin) {
    return el("div", { class: "stack stack--tight" }, [
      buildApplyForm(),
      el("hr", { class: "divider" }),
      el("p", { class: "panel-note", text: "Admin tools" }),
      el("a", {
        class: "btn btn--ghost btn--full",
        href: `${CONFIG.PAGES.projectForm}?id=${project.id}`,
        text: "Edit project",
      }),
      adminDeleteButton(),
    ]);
  }

  // 6. The normal case: a logged-in user applying
  return buildApplyForm();
}


function adminDeleteButton() {
  return el("button", {
    type: "button",
    class: "btn btn--danger-ghost btn--full",
    text: "Delete project (admin)",
    onclick: async (event) => {
      const ok = await confirmDialog({
        title: "Delete this project?",
        text: "Its applications are deleted too. This cannot be undone.",
        confirmLabel: "Delete",
        danger: true,
      });

      if (!ok) return;

      const button = event.currentTarget;

      try {
        setBusy(button, true);
        await api.del(`/admin/delete-project/${project.id}`);
        toastOk("Project deleted");
        window.location.replace(CONFIG.PAGES.browse);
      } catch (err) {
        setBusy(button, false);
        toastError(err.message);
      }
    },
  });
}


function buildApplyForm() {
  const errorBox = el("div", {
    class: "form-error",
    id: "apply-error",
    role: "alert",
    hidden: true,
  });

  const noteInput = el("textarea", {
    class: "textarea textarea--short",
    id: "apply-note",
    maxLength: NOTE_MAX,
    placeholder: "Why do you want to join? What can you contribute?",
    "aria-describedby": "apply-error",
  });

  const githubInput = el("input", {
    class: "input",
    id: "apply-github",
    type: "url",
    placeholder: "https://github.com/your-handle",
    autocomplete: "off",
    "aria-describedby": "apply-error",
  });

  const submit = el("button", {
    type: "submit",
    class: "btn btn--primary btn--full",
    text: "Apply to this project",
  });

  const form = el("form", { class: "stack stack--tight", novalidate: true }, [
    errorBox,
    el("label", { class: "field" }, [
      el("span", { class: "field__label" }, ["Note ", el("span", { class: "req", text: "*" })]),
      noteInput,
      el("span", { class: "field__hint", text: `${NOTE_MAX} characters max` }),
    ]),
    el("label", { class: "field" }, [
      el("span", { class: "field__label" }, ["GitHub profile ", el("span", { class: "req", text: "*" })]),
      githubInput,
      el("span", { class: "field__hint", text: "github.com/your-handle" }),
    ]),
    submit,
  ]);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    errorBox.hidden = true;
    noteInput.removeAttribute("aria-invalid");
    githubInput.removeAttribute("aria-invalid");

    const note = noteInput.value.trim();
    const githubProfile = githubInput.value.trim();

    // Client-side checks mirror the backend so the user gets instant feedback
    if (!note || note.length > NOTE_MAX) {
      noteInput.setAttribute("aria-invalid", "true");
      return showFormError(errorBox, "Please write a note between 1 and 500 characters.");
    }

    if (!GITHUB_PROFILE.test(githubProfile)) {
      githubInput.setAttribute("aria-invalid", "true");
      return showFormError(errorBox, "Please enter a valid GitHub profile URL, like github.com/alex.");
    }

    try {
      setBusy(submit, true);

      await api.post("/applications/apply", {
        projectId: project.id,
        note,
        githubProfile,
      });

      toastOk("Application sent");

      // Re-read so the panel switches to the "already applied" state
      myApplication = { status: "PENDING" };
      project.applicationsCount = (project.applicationsCount || 0) + 1;
      render();
    } catch (err) {
      setBusy(submit, false);

      // 409 = this account already applied. It happens when the application
      // was not on the first page of my-applications, so the panel wrongly
      // offered the form. Switch to the honest state instead of showing an error.
      if (err.status === 409) {
        myApplication = { status: "PENDING" };
        render();
        toastError(err.message);
        return;
      }

      showFormError(errorBox, err.message);
    }
  });

  return el("div", { class: "stack stack--tight" }, [
    el("p", { class: "panel-note", text: "Open to collaborators." }),
    form,
  ]);
}


function showFormError(box, message) {
  box.textContent = message;
  box.hidden = false;
}


// ---- Owner delete ----

async function onDelete(button) {
  const ok = await confirmDialog({
    title: "Delete this project?",
    text: "Every application sent to it is deleted as well. This cannot be undone.",
    confirmLabel: "Delete project",
    danger: true,
  });

  if (!ok) return;

  try {
    setBusy(button, true);
    await api.del(`/projects/delete-project/${project.id}`);
    toastOk("Project deleted");
    window.location.replace(CONFIG.PAGES.dashboard);
  } catch (err) {
    setBusy(button, false);
    toastError(err.message);
  }
}


// ---- Data ----

async function loadApplication() {
  if (!user) return;

  try {
    const data = await api.get("/applications/my-applications", { query: { limit: 50 } });
    const list = data?.applications || [];
    myApplication = list.find((item) => item.projectId === project.id) || null;
  } catch {
    // Not fatal: worst case the apply form is shown and the API rejects with 409
    myApplication = null;
  }
}


async function init() {
  user = await mountChrome("projects");

  if (!projectId) {
    renderNotFound("No project id was given in the URL.");
    return;
  }

  try {
    const data = await api.get(`/projects/project-details/${projectId}`, { auth: Boolean(user) });
    project = data?.project;

    if (!project) {
      renderNotFound();
      return;
    }

    project.applicationsCount = data.applicationsCount ?? project._count?.applications ?? 0;

    document.title = `${project.title} · ${CONFIG.BRAND}`;

    await loadApplication();
    render();
  } catch (err) {
    if (err.status === 404) {
      renderNotFound();
      return;
    }

    renderNotFound(err.message);
    toastError(err.message);
  }
}

init();
