// ============================================================
// core/theme.js
// Purpose:   Light / dark theme. Loaded as a CLASSIC script in <head> (not a
//            module) so it runs before the first paint — a module is deferred,
//            which would show a white flash on a dark screen.
//
// It sets data-theme on <html>; base/tokens.css does the rest.
// Choice: "light" | "dark" | "system" (default), stored in localStorage.
// Loaded by: every page, before the stylesheet matters
// ============================================================

(function () {
  "use strict";

  var STORAGE_KEY = "findmearepo.theme";
  var root = document.documentElement;
  var media = window.matchMedia("(prefers-color-scheme: dark)");

  function stored() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      // Private mode or blocked storage: fall back to the OS preference
      return null;
    }
  }

  function save(value) {
    try {
      if (value === "system") localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, value);
    } catch (error) {
      /* not fatal */
    }
  }

  // "light" | "dark" — what is actually on screen right now
  function resolved() {
    var choice = stored();

    if (choice === "light" || choice === "dark") return choice;

    return media.matches ? "dark" : "light";
  }

  function apply(theme) {
    root.setAttribute("data-theme", theme);

    // Keeps the browser chrome and scrollbars in step with the page
    root.style.colorScheme = theme;
  }

  function set(theme) {
    save(theme);
    apply(theme);
    sync();

    // Let the page react (the navbar swaps its icon)
    window.dispatchEvent(
      new CustomEvent("themechange", {
        detail: { theme: resolved(), choice: stored() || "system" },
      })
    );
  }

  // light <-> dark. A system preference is kept until the user picks a side.
  function toggle() {
    set(resolved() === "dark" ? "light" : "dark");
  }


  // ---- Keep the toggle buttons in sync ----
  // Any element with [data-theme-toggle] gets the right label and icon state.

  function sync() {
    var theme = resolved();

    var nodes = document.querySelectorAll("[data-theme-toggle]");

    for (var i = 0; i < nodes.length; i += 1) {
      nodes[i].setAttribute("aria-label", theme === "dark" ? "Switch to light theme" : "Switch to dark theme");
      nodes[i].setAttribute("data-theme-state", theme);
      nodes[i].setAttribute("title", theme === "dark" ? "Light theme" : "Dark theme");
    }
  }

  // One delegated listener: works for buttons rendered later by ui/navbar.js
  document.addEventListener("click", function (event) {
    var button = event.target.closest("[data-theme-toggle]");
    if (!button) return;

    event.preventDefault();
    toggle();
  });

  // First paint: decide before anything is rendered
  apply(resolved());

  // Follow the OS while the user has not chosen a side
  var onSystemChange = function () {
    if (stored() === "light" || stored() === "dark") return;
    apply(resolved());
    sync();
  };

  if (typeof media.addEventListener === "function") {
    media.addEventListener("change", onSystemChange);
  } else if (typeof media.addListener === "function") {
    media.addListener(onSystemChange); // Safari < 14
  }

  // The navbar mounts after this file runs
  document.addEventListener("DOMContentLoaded", sync);

  // Public API, used by ui/navbar.js to render the right icon
  window.AppTheme = {
    get: resolved,
    choice: function () {
      return stored() || "system";
    },
    set: set,
    toggle: toggle,
    sync: sync,
  };
})();
