// ============================================================
// pages/project-form.js
// Purpose:   One page for creating and editing a project. ?id= switches to
//            edit mode: it loads the project, prefills the form, and PATCHes
//            instead of POSTing.
//
// Endpoints:
//   POST  /api/projects/create-project
//   GET   /api/projects/project-details/:id
//   PATCH /api/projects/update-project/:id
// ============================================================

import { api } from "../core/api.js";
import { CONFIG } from "../core/config.js";
import { session } from "../core/session.js";
import { mountChrome } from "../ui/navbar.js";
import { el, qs, setBusy, emptyState } from "../ui/dom.js";
import { error as toastError, success as toastOk } from "../ui/toast.js";

// Mirrors src/config/limits.ts and config/regex.ts
const LIMITS = {
  title: [1, 500],
  description: [1, 10000],
  tags: 20,
};
const GITHUB_URL_RE = /^(https?:\/\/)?(www\.)?github\.com\/[a-zA-Z0-9-]+\/[a-zA-Z0-9-_.]+$/;

const projectId = new URLSearchParams(window.location.search).get("id");
const isEdit = Boolean(projectId);

const form = qs("#project-form");
const titleInput = qs("#title");
const descInput = qs("#description");
const githubInput = qs("#githubUrl");
const statusField = qs("#status-field");
const statusSelect = qs("#status");
const submitBtn = qs("#submit");
const errorBanner = qs("#form-error");

// Tags live here, not in the DOM: the chips are just a view of this array
let tags = [];


// ---- Field errors ----

function setFieldError(field, message) {
  const box = qs(`#${field}-error`);
  const input = qs(`#${field}`);

  if (box) box.textContent = message || "";

  if (input) {
    input.classList.toggle("is-invalid", Boolean(message));
    input.setAttribute("aria-invalid", message ? "true" : "false");
  }
}

function clearErrors() {
  for (const field of ["title", "description", "githubUrl", "techStack"]) {
    setFieldError(field, "");
  }

  errorBanner.hidden = true;
  errorBanner.textContent = "";
}

function showBanner(message) {
  errorBanner.textContent = message;
  errorBanner.hidden = false;
}


// ---- Character counters ----

function wireCounters() {
  const titleCount = qs("#title-count");
  const descCount = qs("#desc-count");

  const update = () => {
    titleCount.textContent = String(titleInput.value.length);
    descCount.textContent = String(descInput.value.length);
  };

  titleInput.addEventListener("input", update);
  descInput.addEventListener("input", update);

  update();
}


// ---- Tech stack chip input ----

function renderTags() {
  const container = qs("#tag-input");
  const field = qs("#tag-field");

  // Rebuild everything except the text input, which keeps focus
  for (const chip of container.querySelectorAll(".tag")) {
    chip.remove();
  }

  for (const tag of tags) {
    const chip = el("span", { class: "tag" }, [
      tag,
      el("button", {
        type: "button",
        "aria-label": `Remove ${tag}`,
        text: "×",
        onclick: () => {
          tags = tags.filter((item) => item !== tag);
          renderTags();
        },
      }),
    ]);

    container.insertBefore(chip, field);
  }

  qs("#tag-count").textContent = String(tags.length);
  setFieldError("techStack", "");
}

function addTag(rawValue) {
  // Accept "React, node" or "react node" typed at once
  const parts = String(rawValue)
    .split(/[,\n]/)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);

  for (const part of parts) {
    if (!part) continue;

    if (tags.includes(part)) continue;

    if (tags.length >= LIMITS.tags) {
      setFieldError("techStack", `Maximum ${LIMITS.tags} technologies.`);
      return;
    }

    tags.push(part);
  }

  renderTags();
}

function wireTagInput() {
  const container = qs("#tag-input");
  const field = qs("#tag-field");

  // Clicking anywhere in the box focuses the typing area
  container.addEventListener("click", () => field.focus());

  field.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addTag(field.value);
      field.value = "";
      return;
    }

    // Backspace on an empty field removes the last chip
    if (event.key === "Backspace" && field.value === "" && tags.length > 0) {
      tags.pop();
      renderTags();
    }
  });

  // Pasting "react, node, postgres" should split into three chips
  field.addEventListener("input", () => {
    if (field.value.includes(",")) {
      addTag(field.value);
      field.value = "";
    }
  });

  renderTags();
}


// ---- Mode setup ----

function setCreateMode() {
  document.title = `New project · ${CONFIG.BRAND}`;
}

function setEditMode(project) {
  document.title = `Edit ${project.title} · ${CONFIG.BRAND}`;

  qs("#eyebrow").textContent = "// Edit project";
  qs("#page-title").textContent = "Edit project";
  qs("#page-lead").textContent = "Changes are visible immediately.";

  titleInput.value = project.title || "";
  descInput.value = project.description || "";
  githubInput.value = project.githubUrl || "";
  tags = [...(project.techStack || [])];

  statusSelect.value = project.status || "OPEN";
  statusField.hidden = false;

  submitBtn.textContent = "Save changes";

  titleInput.dispatchEvent(new Event("input"));
  descInput.dispatchEvent(new Event("input"));
  renderTags();
}


// ---- Validation ----

function validate() {
  let valid = true;

  const title = titleInput.value.trim();
  const description = descInput.value.trim();
  const githubUrl = githubInput.value.trim();

  if (title.length < LIMITS.title[0] || title.length > LIMITS.title[1]) {
    setFieldError("title", "Title must be between 1 and 500 characters.");
    valid = false;
  }

  if (description.length < LIMITS.description[0] || description.length > LIMITS.description[1]) {
    setFieldError("description", "Description must be between 1 and 10000 characters.");
    valid = false;
  }

  if (!GITHUB_URL_RE.test(githubUrl)) {
    setFieldError("githubUrl", "Use a full repository URL, like github.com/alex/api.");
    valid = false;
  }

  if (tags.length === 0) {
    setFieldError("techStack", "Add at least one technology.");
    valid = false;
  }

  return valid;
}


// ---- Submit ----

async function onSubmit(event) {
  event.preventDefault();
  clearErrors();

  // A tag still sitting in the input should not be lost on submit
  const pending = qs("#tag-field").value.trim();
  if (pending) {
    addTag(pending);
    qs("#tag-field").value = "";
  }

  if (!validate()) return;

  const body = {
    title: titleInput.value.trim(),
    description: descInput.value.trim(),
    githubUrl: githubInput.value.trim(),
    techStack: tags,
  };

  if (isEdit) {
    body.status = statusSelect.value;
  }

  try {
    setBusy(submitBtn, true);

    const data = isEdit
      ? await api.patch(`/projects/update-project/${projectId}`, body)
      : await api.post("/projects/create-project", body);

    const savedId = data?.project?.id || projectId;

    toastOk(isEdit ? "Project updated" : "Project created");
    window.location.replace(`${CONFIG.PAGES.project}?id=${savedId}`);
  } catch (err) {
    setBusy(submitBtn, false);
    showBanner(err.message);
    toastError(err.message);
  }
}


// ---- Boot ----

async function init() {
  const user = await session.requireAuth();
  if (!user) return;

  await mountChrome("dashboard");

  if (!isEdit) {
    setCreateMode();
  }

  wireCounters();
  wireTagInput();

  form.addEventListener("submit", onSubmit);

  // Cancel returns to where the user came from in a sensible way
  qs("#cancel").href = isEdit
    ? `${CONFIG.PAGES.project}?id=${projectId}`
    : CONFIG.PAGES.dashboard;

  if (!isEdit) return;

  // Edit mode: load the project, then check the caller may touch it
  try {
    const data = await api.get(`/projects/project-details/${projectId}`);
    const project = data?.project;

    if (!project) {
      throw new Error("Project not found.");
    }

    const allowed = project.owner?.id === user.id || user.role === "ADMIN";

    if (!allowed) {
      form.replaceWith(
        emptyState({
          title: "You cannot edit this project",
          text: "Only its owner or an admin can change it.",
          action: el("a", {
            class: "btn btn--secondary",
            href: `${CONFIG.PAGES.project}?id=${projectId}`,
            text: "Back to the project",
          }),
        })
      );
      return;
    }

    setEditMode(project);
  } catch (err) {
    form.replaceWith(
      emptyState({
        title: "Could not load this project",
        text: err.message,
        action: el("a", { class: "btn btn--secondary", href: CONFIG.PAGES.dashboard, text: "Back" }),
      })
    );
  }
}

init();
