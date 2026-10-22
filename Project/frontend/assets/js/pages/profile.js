// ============================================================
// pages/profile.js
// Purpose:   The logged-in user's own settings: profile, password, and the
//            danger zone (deactivate / delete).
//
// Endpoints:
//   PATCH  /api/users/update-profile
//   PATCH  /api/users/update-password   (also kills the session)
//   PATCH  /api/users/deactivate-account
//   DELETE /api/users/delete-account
// ============================================================

import { api, setToken } from "../core/api.js";
import { CONFIG } from "../core/config.js";
import { session } from "../core/session.js";
import { mountChrome, refreshNavbar } from "../ui/navbar.js";
import { el, qs, setBusy, initials, formatDate, confirmTyped } from "../ui/dom.js";
import { roleBadge, userStatusBadge } from "../ui/pieces.js";
import { success as toastOk, error as toastError } from "../ui/toast.js";

// Mirrors src/config/limits.ts and regex.ts
const LIMITS = { name: [1, 50], email: [3, 254], password: [8, 72] };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SPECIAL_RE = /[@$!%*?&#^()_\-+=\[\]{}|;:,.<>]/;

const profileForm = qs("#profile-form");
const passwordForm = qs("#password-form");


// ---- Small helpers ----

function setFieldError(field, message) {
  const box = qs(`#${field}-error`);
  const input = qs(`#${field}`);

  if (box) box.textContent = message || "";

  if (input) {
    input.classList.toggle("is-invalid", Boolean(message));
    input.setAttribute("aria-invalid", message ? "true" : "false");
  }
}

function showBanner(id, message) {
  const banner = qs(`#${id}`);
  banner.textContent = message;
  banner.hidden = false;
}

function clearBanner(id) {
  const banner = qs(`#${id}`);
  banner.hidden = true;
  banner.textContent = "";
}


// ---- Account card: who you are, and what you have done ----

let account = null;

function statItem(value, label) {
  return el("div", { class: "account-stat" }, [
    el("span", { class: "account-stat__value", text: String(value) }),
    el("span", { class: "account-stat__label", text: label }),
  ]);
}

function renderAccount(user) {
  account = user;

  qs("#account-avatar").textContent = initials(user.name);
  qs("#account-name").textContent = user.name;
  qs("#account-email").textContent = user.email;
  qs("#account-badges").replaceChildren(roleBadge(user.role), userStatusBadge(user.status));
}

// Two count-only requests. A wrong number is worse than no number, so a failed
// request leaves the row empty instead of showing zeros.
async function loadAccountStats() {
  const box = qs("#account-stats");

  try {
    const [projects, applications] = await Promise.all([
      api.get("/projects/my-projects", { query: { limit: 1 } }),
      api.get("/applications/my-applications", { query: { limit: 1 } }),
    ]);

    box.replaceChildren(
      statItem(projects?.total ?? 0, "projects"),
      statItem(applications?.total ?? 0, "applications"),
      el("div", { class: "account-stat" }, [
        el("span", {
          class: "account-stat__value account-stat__value--sm",
          text: formatDate(account?.createdAt),
        }),
        el("span", { class: "account-stat__label", text: "member since" }),
      ])
    );
  } catch {
    box.replaceChildren();
  }
}


// ---- Live preview: what an owner sees while you type ----

function wirePreview() {
  const nameInput = qs("#name");
  const previewName = qs("#preview-name");
  const previewAvatar = qs("#preview-avatar");

  const sync = () => {
    const value = nameInput.value.trim();

    previewName.textContent = value || "Your name";
    previewAvatar.textContent = initials(value);
  };

  nameInput.addEventListener("input", sync);
  sync();
}


// ---- Profile ----

function wireProfile(user) {
  qs("#name").value = user.name || "";
  qs("#email").value = user.email || "";

  profileForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    setFieldError("name", "");
    setFieldError("email", "");
    clearBanner("profile-error");

    const name = qs("#name").value.trim();
    const email = qs("#email").value.trim().toLowerCase();
    const submit = qs("#profile-submit");

    let changed = false;
    const body = {};

    if (name !== user.name) {
      if (name.length < LIMITS.name[0] || name.length > LIMITS.name[1]) {
        return setFieldError("name", "Name must be between 1 and 50 characters.");
      }
      body.name = name;
      changed = true;
    }

    if (email !== user.email) {
      if (!EMAIL_RE.test(email) || email.length > LIMITS.email[1]) {
        return setFieldError("email", "Enter a valid email address.");
      }
      body.email = email;
      changed = true;
    }

    if (!changed) {
      return showBanner("profile-error", "Nothing changed yet.");
    }

    try {
      setBusy(submit, true);

      const data = await api.patch("/users/update-profile", body);

      // One forced read refreshes the session cache and returns the saved user.
      // Calling getUser() twice here meant two /auth/me round trips per save.
      const fresh = (await session.getUser({ force: true })) || data?.user || user;

      user = fresh;
      qs("#name").value = user.name;
      qs("#email").value = user.email;

      // The settings header AND the navbar both show the name
      renderAccount(fresh);
      refreshNavbar(fresh, "profile");

      toastOk("Profile updated");
      setBusy(submit, false);
    } catch (err) {
      setBusy(submit, false);
      showBanner("profile-error", err.message);
    }
  });
}


// ---- Password ----

function passwordChecks(value) {
  return {
    length: value.length >= LIMITS.password[0] && value.length <= LIMITS.password[1],
    lower: /[a-z]/.test(value),
    upper: /[A-Z]/.test(value),
    digit: /\d/.test(value),
    special: SPECIAL_RE.test(value),
  };
}

function wirePassword() {
  const newInput = qs("#newPassword");
  const rulesList = qs("#pw-rules");

  newInput.addEventListener("input", () => {
    const checks = passwordChecks(newInput.value);

    for (const [rule, passed] of Object.entries(checks)) {
      const item = qs(`[data-rule="${rule}"]`, rulesList);
      if (item) item.classList.toggle("is-ok", passed);
    }
  });

  passwordForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    for (const field of ["currentPassword", "newPassword", "confirmPassword"]) {
      setFieldError(field, "");
    }

    clearBanner("password-banner");

    const currentPassword = qs("#currentPassword").value;
    const newPassword = newInput.value;
    const confirmPassword = qs("#confirmPassword").value;
    const submit = qs("#password-submit");

    if (!currentPassword) {
      return setFieldError("currentPassword", "Enter your current password.");
    }

    const checks = passwordChecks(newPassword);

    if (!Object.values(checks).every(Boolean)) {
      return setFieldError("newPassword", "The new password must meet all five rules.");
    }

    if (newPassword === currentPassword) {
      return setFieldError("newPassword", "The new password must be different.");
    }

    if (newPassword !== confirmPassword) {
      return setFieldError("confirmPassword", "The two passwords do not match.");
    }

    try {
      setBusy(submit, true);

      await api.patch("/users/update-password", { currentPassword, newPassword });

      // The backend revokes the refresh token on purpose: sign in again
      setToken(null);
      toastOk("Password changed — please sign in again");

      setTimeout(() => {
        window.location.replace(`${CONFIG.PAGES.login}?next=${encodeURIComponent(CONFIG.PAGES.profile)}`);
      }, 1200);
    } catch (err) {
      setBusy(submit, false);
      showBanner("password-banner", err.message);
    }
  });
}


// ---- Typed confirmation for destructive actions ----
// confirmTyped() lives in ui/dom.js now, because the admin panel needs the
// same dialog when deleting an account.


// ---- Danger zone ----

function wireDanger() {
  qs("#deactivate").addEventListener("click", async (event) => {
    const button = event.currentTarget;

    const ok = await confirmTyped({
      title: "Deactivate this account?",
      text: "You will be signed out and blocked from signing in until an admin reactivates you.",
      word: "DEACTIVATE",
      confirmLabel: "Deactivate account",
    });

    if (!ok) return;

    try {
      setBusy(button, true);
      await api.patch("/users/deactivate-account");
      setToken(null);
      toastOk("Account deactivated");
      setTimeout(() => window.location.replace(CONFIG.PAGES.home), 900);
    } catch (err) {
      setBusy(button, false);
      toastError(err.message);
    }
  });

  qs("#delete").addEventListener("click", async (event) => {
    const button = event.currentTarget;

    const ok = await confirmTyped({
      title: "Delete this account permanently?",
      text: "Your projects and every application you sent or received are deleted with it. This cannot be undone.",
      word: "DELETE",
      confirmLabel: "Delete permanently",
    });

    if (!ok) return;

    try {
      setBusy(button, true);
      await api.del("/users/delete-account");
      setToken(null);
      toastOk("Account deleted");
      setTimeout(() => window.location.replace(CONFIG.PAGES.home), 900);
    } catch (err) {
      setBusy(button, false);
      toastError(err.message);
    }
  });
}


// ---- Boot ----

async function init() {
  const user = await session.requireAuth();
  if (!user) return;

  await mountChrome("profile");

  renderAccount(user);

  // wireProfile fills the inputs, so the preview must read them afterwards
  wireProfile(user);
  wirePreview();

  loadAccountStats();

  wirePassword();
  wireDanger();
}

init();
