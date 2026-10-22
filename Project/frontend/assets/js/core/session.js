// ============================================================
// core/session.js
// Purpose:   Who is logged in right now, and the guards that protect pages.
//            One shared user object — pages never fetch /auth/me themselves.
// Loaded by: ui/navbar.js and every protected page
// ============================================================

import { api, setToken, hasToken, refreshToken } from "./api.js";
import { CONFIG } from "./config.js";


// Cached state for this page load only
let currentUser = null;
let loadPromise = null;


// ---- Get the user, once per page ----

async function getUser({ force = false } = {}) {
  if (force) {
    currentUser = null;
    loadPromise = null;
  }

  if (currentUser) {
    return currentUser;
  }

  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = (async () => {
    try {
      // No access token yet (fresh tab): the cookie may still give us one
      if (!hasToken()) {
        const refreshed = await refreshToken();

        if (!refreshed) {
          return null;
        }
      }

      const data = await api.get("/auth/me");
      currentUser = data?.user || null;
      return currentUser;
    } catch {
      currentUser = null;
      setToken(null);
      return null;
    } finally {
      loadPromise = null;
    }
  })();

  return loadPromise;
}


// ---- Guard: must be logged in ----

async function requireAuth() {
  const user = await getUser();

  if (!user) {
    redirectToLogin();
    return null;
  }

  return user;
}


// ---- Guard: must be an admin ----

async function requireAdmin() {
  const user = await requireAuth();

  if (!user) {
    return null;
  }

  if (user.role !== "ADMIN") {
    window.location.replace(CONFIG.PAGES.browse);
    return null;
  }

  return user;
}


// ---- Guard: a logged-in user should not see login/register ----

async function redirectIfLoggedIn() {
  const user = await getUser();

  if (user) {
    window.location.replace(CONFIG.PAGES.dashboard);
    return true;
  }

  return false;
}


function redirectToLogin() {
  // "/" has no filename to return to, so fall back to the project list
  const page = window.location.pathname.split("/").pop() || CONFIG.PAGES.browse;
  const target = `${page}${window.location.search}`;
  const next = encodeURIComponent(page ? target : CONFIG.PAGES.browse);

  window.location.replace(`${CONFIG.PAGES.login}?next=${next}`);
}


// ---- Logout ----

async function logout() {
  try {
    await api.post("/auth/logout");
  } catch {
    // A failed logout must still clear the local token
  }

  setToken(null);
  currentUser = null;
  window.location.replace(CONFIG.PAGES.home);
}


// ---- Helpers used by the UI ----

function isAdmin() {
  return currentUser?.role === "ADMIN";
}


const session = {
  getUser,
  requireAuth,
  requireAdmin,
  redirectIfLoggedIn,
  redirectToLogin,
  logout,
  isAdmin,
};

export { session };
