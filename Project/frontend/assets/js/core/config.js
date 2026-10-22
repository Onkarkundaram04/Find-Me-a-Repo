// ============================================================
// core/config.js
// Purpose:   The few values every script needs, in one place.
// Loaded by: core/api.js, core/session.js, ui/navbar.js
// ============================================================

// Where the API lives depends on how the page was opened:
//
//   1. Served BY the API (http://localhost:5000/...)  -> same origin, "/api".
//      No CORS preflight, no ports to keep in sync.
//   2. Live Server on :5500, or opened from disk       -> talk to :5000.
//
// Set window.APP_API_BASE before this module loads to override both.
function resolveApiBase() {
  if (window.APP_API_BASE) {
    return window.APP_API_BASE;
  }

  const servedByApi =
    window.location.protocol.startsWith("http") && window.location.port !== "5500";

  return servedByApi ? `${window.location.origin}/api` : "http://localhost:5000/api";
}

const API_BASE = resolveApiBase();

// The product name, in exactly one place. Every title, the navbar and the
// footer read this, so renaming the app is a one-line change.
const BRAND = "Find Me a Repo";

// The access token lives in sessionStorage: it survives page navigation
// inside the tab, and disappears when the tab closes. The refresh token
// stays in the httpOnly cookie, which JS cannot read at all.
const STORAGE_KEY = "findmearepo.accessToken";

// Page names, so a typo shows up here instead of in a link
const PAGES = {
  home: "index.html",        // the landing page: what this product is
  browse: "projects.html",   // the grid of projects you can join
  login: "login.html",
  register: "register.html",
  project: "project.html",
  dashboard: "dashboard.html",
  projectForm: "project-form.html",
  applications: "applications.html",
  profile: "profile.html",
  admin: "admin.html",
};

const CONFIG = {
  API_BASE,
  STORAGE_KEY,
  BRAND,
  PAGES,

  // Requests that must never trigger the refresh-and-retry loop
  AUTH_PATHS: ["/auth/login", "/auth/register", "/auth/refresh"],

  // How long a toast stays on screen (ms)
  TOAST_MS: 4000,

  // Give up on a request after this long, instead of shimmering forever
  REQUEST_TIMEOUT_MS: 15000,
};

export { CONFIG };
