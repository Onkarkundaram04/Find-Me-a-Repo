// ============================================================
// pages/auth.js
// Purpose:   One script for both login.html and register.html — it branches on
//            which form is on the page, so validation and redirects are written
//            exactly once.
//
// Endpoints: POST /api/auth/login, POST /api/auth/register
// ============================================================

import { api, setToken } from "../core/api.js";
import { CONFIG } from "../core/config.js";
import { session } from "../core/session.js";
import { mountChrome } from "../ui/navbar.js";
import { qs, qsa, setBusy } from "../ui/dom.js";
import { wirePasswordToggle } from "../ui/pieces.js";
import { error as toastError } from "../ui/toast.js";


// ---- Rules that mirror src/config/limits.ts and regex.ts on the backend ----

const LIMITS = { name: [1, 50], email: [3, 254], password: [8, 72] };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SPECIAL_RE = /[@$!%*?&#^()_\-+=\[\]{}|;:,.<>]/;

function passwordChecks(value) {
  return {
    length: value.length >= LIMITS.password[0] && value.length <= LIMITS.password[1],
    lower: /[a-z]/.test(value),
    upper: /[A-Z]/.test(value),
    digit: /\d/.test(value),
    special: SPECIAL_RE.test(value),
  };
}

function passwordValid(value) {
  const checks = passwordChecks(value);
  return Object.values(checks).every(Boolean);
}


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
  for (const field of ["name", "email", "password"]) {
    setFieldError(field, "");
  }

  const banner = qs("#form-error");
  banner.hidden = true;
  banner.textContent = "";
}

function showBanner(message) {
  const banner = qs("#form-error");
  banner.textContent = message;
  banner.hidden = false;
}

// After a failed submit, put the caret in the first field that needs fixing
function focusFirstInvalid() {
  const invalid = qs(".input.is-invalid");

  if (invalid) invalid.focus();
}

// Editing a field clears its own error, and the banner, straight away
function clearOnEdit(form) {
  for (const input of qsa("input", form)) {
    input.addEventListener("input", () => {
      setFieldError(input.id, "");

      const banner = qs("#form-error");

      if (banner) {
        banner.hidden = true;
        banner.textContent = "";
      }
    });
  }
}


// ---- ?next= must stay inside this site ----

function safeNext() {
  const next = new URLSearchParams(window.location.search).get("next");

  if (!next) return CONFIG.PAGES.dashboard;

  // Only a plain relative page is allowed: no scheme, no //host, no ../
  if (/^[a-z][a-z0-9+.-]*:/i.test(next) || next.startsWith("//") || next.includes("..")) {
    return CONFIG.PAGES.dashboard;
  }

  return next;
}


// ---- Shared submit handling ----

async function submitForm({ button, request }) {
  clearErrors();
  setBusy(button, true);

  try {
    const data = await request();
    const token = data?.accessToken;

    if (!token) {
      throw new Error("The server did not return an access token.");
    }

    setToken(token);

    // No toast here: the page is replaced immediately, so it would never be seen
    window.location.replace(safeNext());
  } catch (err) {
    setBusy(button, false);

    // 409 = email taken, 401 = wrong credentials: the banner is enough
    showBanner(err.message || "Something went wrong. Please try again.");
    toastError(err.message);
  }
}


// ---- Login ----

function initLogin(form) {
  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const email = qs("#email").value.trim().toLowerCase();
    const password = qs("#password").value;

    clearErrors();

    if (!email) {
      setFieldError("email", "Email is required.");
      return focusFirstInvalid();
    }

    if (!EMAIL_RE.test(email) || email.length > LIMITS.email[1]) {
      setFieldError("email", "Enter a valid email address.");
      return focusFirstInvalid();
    }

    if (!password) {
      setFieldError("password", "Password is required.");
      return focusFirstInvalid();
    }

    submitForm({
      button: qs("#submit"),
      request: () => api.post("/auth/login", { email, password }, { auth: false }),
    });
  });
}


// ---- Register ----

function initRegister(form) {
  const passwordInput = qs("#password");
  const rulesList = qs("#pw-rules");

  // Live checklist
  passwordInput.addEventListener("input", () => {
    const checks = passwordChecks(passwordInput.value);

    for (const [rule, passed] of Object.entries(checks)) {
      const item = qs(`[data-rule="${rule}"]`, rulesList);
      if (item) item.classList.toggle("is-ok", passed);
    }
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const name = qs("#name").value.trim();
    const email = qs("#email").value.trim().toLowerCase();
    const password = passwordInput.value;

    clearErrors();

    let valid = true;

    if (name.length < LIMITS.name[0] || name.length > LIMITS.name[1]) {
      setFieldError("name", "Name must be between 1 and 50 characters.");
      valid = false;
    }

    if (!EMAIL_RE.test(email) || email.length > LIMITS.email[1]) {
      setFieldError("email", "Enter a valid email address.");
      valid = false;
    }

    if (!passwordValid(password)) {
      setFieldError("password", "Password must be 8–72 characters and meet all five rules.");
      valid = false;
    }

    if (!valid) return focusFirstInvalid();

    submitForm({
      button: qs("#submit"),
      request: () => api.post("/auth/register", { name, email, password }, { auth: false }),
    });
  });
}


// ---- Boot ----

async function init() {
  await mountChrome("");

  // Someone already signed in has no business on these pages
  if (await session.redirectIfLoggedIn()) return;

  // Keep ?next= across the login <-> register links, so switching your mind
  // halfway does not drop where you were going.
  const next = new URLSearchParams(window.location.search).get("next");

  if (next) {
    for (const link of qsa(".auth-card__foot a")) {
      const base = link.getAttribute("href").split("?")[0];
      link.href = `${base}?next=${encodeURIComponent(next)}`;
    }
  }

  const loginForm = qs("#login-form");
  const registerForm = qs("#register-form");

  if (loginForm) initLogin(loginForm);
  if (registerForm) initRegister(registerForm);

  // Both pages drive the eye button the same way: the markup says which input
  for (const button of qsa("[data-password-toggle]")) {
    wirePasswordToggle(qs(`#${button.dataset.passwordToggle}`), button);
  }

  // Typing clears the error that was showing for that field
  for (const form of [loginForm, registerForm]) {
    if (form) clearOnEdit(form);
  }

  // Focus the first empty field
  const firstInput = qs("input:not([type=hidden])");
  if (firstInput) firstInput.focus();
}

init();
