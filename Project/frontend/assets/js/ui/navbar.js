// ============================================================
// ui/navbar.js
// Purpose:   The one navbar and footer used by every page.
//
//            Navbar layout, left to right:
//              brand | hairline | nav links ......... theme | account
//
//            Links are pills, not underlines. Below 720px the same <nav>
//            element becomes a dropdown panel toggled by the hamburger — one
//            list in the DOM, re-laid-out by CSS, so the two can never drift.
//
// Loaded by: every page (call mountChrome("dashboard"))
// ============================================================

import { CONFIG } from "../core/config.js";
import { session } from "../core/session.js";
import { el, initials } from "./dom.js";
import { icon } from "./icons.js";

// Which nav item is active, keyed by the name passed from the page
const NAV_ITEMS = [
  { key: "projects", label: "Projects", href: CONFIG.PAGES.browse },
  { key: "dashboard", label: "Dashboard", href: CONFIG.PAGES.dashboard, authOnly: true },
  { key: "profile", label: "Profile", href: CONFIG.PAGES.profile, authOnly: true },
  { key: "admin", label: "Admin", href: CONFIG.PAGES.admin, adminOnly: true },
];

// The auth pages should not offer "Sign in" while you are already there
function isAuthPage() {
  const file = window.location.pathname.split("/").pop();
  return file === CONFIG.PAGES.login || file === CONFIG.PAGES.register;
}


// ---- One set of document listeners, not one per render ----
// refreshNavbar() can rebuild the bar at any time (after a profile save), so
// the handlers must be registered once and point at whatever is mounted.

let mounted = null;   // { navbar, setOpen } — the navbar currently in the DOM
let openMenu = null;  // { menu, trigger } — the account menu currently open

function closeUserMenu() {
  if (!openMenu) return;

  const { menu, trigger } = openMenu;

  menu.hidden = true;
  trigger.setAttribute("aria-expanded", "false");

  // If the caret was inside the menu, send it back to the trigger
  if (menu.contains(document.activeElement)) {
    trigger.focus();
  }

  openMenu = null;
}

document.addEventListener("click", (event) => {
  // A click INSIDE the menu is not a click outside it
  if (openMenu && !openMenu.menu.contains(event.target)) {
    closeUserMenu();
  }

  if (mounted && !mounted.navbar.contains(event.target)) {
    mounted.setOpen(false);
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && mounted) {
    mounted.setOpen(false);
    closeUserMenu();
  }
});

window.addEventListener(
  "scroll",
  () => {
    if (!mounted) return;
    mounted.navbar.classList.toggle("is-scrolled", window.scrollY > 4);
  },
  { passive: true }
);


// ---- Theme toggle ----
// Both icons are rendered; CSS shows the one matching the active theme.
// The click is handled by a delegated listener in core/theme.js.

function buildThemeToggle() {
  const sun = icon("sun");
  const moon = icon("moon");

  sun.classList.add("theme-icon", "theme-icon--sun");
  moon.classList.add("theme-icon", "theme-icon--moon");

  return el(
    "button",
    {
      type: "button",
      class: "btn btn--icon theme-toggle",
      "data-theme-toggle": "",
      "aria-label": "Switch theme",
      title: "Switch theme",
    },
    [sun, moon]
  );
}


// ---- Nav links (one list, reused by the mobile panel) ----

function buildLinks(user, active) {
  const nav = el("nav", { class: "nav-links", id: "main-nav", "aria-label": "Main" });

  for (const item of NAV_ITEMS) {
    if (item.authOnly && !user) continue;
    if (item.adminOnly && user?.role !== "ADMIN") continue;

    nav.append(
      el("a", {
        class: `nav-link${item.key === active ? " is-active" : ""}`,
        href: item.href,
        text: item.label,
        "aria-current": item.key === active ? "page" : null,
      })
    );
  }

  return nav;
}


// ---- User menu (initials only, no photo) ----

function buildUserMenu(user) {
  const chevron = icon("chevron", 12);
  chevron.classList.add("nav-user__chevron");

  const menu = el("div", { class: "nav-user__menu", id: "user-menu", hidden: true }, [
    el("div", { class: "nav-user__head" }, [
      el("div", { class: "nav-user__name", text: user.name }),
      el("div", { class: "nav-user__email", text: user.email }),
    ]),
    el("a", { class: "nav-user__item", href: CONFIG.PAGES.dashboard, text: "Dashboard" }),
    el("a", { class: "nav-user__item", href: CONFIG.PAGES.profile, text: "Profile settings" }),
    el("button", {
      type: "button",
      class: "nav-user__item nav-user__item--danger",
      text: "Sign out",
      onclick: () => session.logout(),
    }),
  ]);

  const trigger = el(
    "button",
    {
      type: "button",
      class: "nav-user__trigger",
      "aria-haspopup": "true",
      "aria-expanded": "false",
      "aria-controls": "user-menu",
      "aria-label": `Account menu for ${user.name}`,
      onclick: (event) => {
        event.stopPropagation();
        const open = menu.hasAttribute("hidden");

        menu.hidden = !open;
        trigger.setAttribute("aria-expanded", String(open));
        openMenu = open ? { menu, trigger } : null;
      },
    },
    [el("span", { class: "avatar avatar--accent", text: initials(user.name) }), chevron]
  );

  return el("div", { class: "nav-user" }, [trigger, menu]);
}


// ---- Brand mark ----
// The app icon lives at assets/coding_cat.png. The terminal mark stays as a
// fallback, so a missing file shows ">_" instead of a broken-image glyph.

const BRAND_ICON = "assets/coding_cat.png";

function buildBrandMark() {
  const logo = el("img", {
    class: "brand__logo",
    src: BRAND_ICON,
    alt: "",
    width: "28",
    height: "28",
    decoding: "async",
  });

  logo.addEventListener("error", () => {
    logo.replaceWith(el("span", { class: "brand__mark", text: ">_" }));
  });

  return logo;
}


// ---- Navbar ----

function buildNavbar(user, active) {
  const links = buildLinks(user, active);

  const burger = el(
    "button",
    {
      type: "button",
      class: "nav-burger",
      "aria-label": "Open menu",
      "aria-expanded": "false",
      "aria-controls": "main-nav",
    },
    [icon("menu", 18)]
  );

  const rightChildren = [buildThemeToggle()];

  if (user) {
    rightChildren.push(buildUserMenu(user));
  } else if (!isAuthPage()) {
    rightChildren.push(
      el("a", { class: "btn btn--primary btn--sm", href: CONFIG.PAGES.login, text: "Sign in" })
    );
  }

  const navbar = el("header", { class: "navbar" }, [
    el("div", { class: "container navbar__inner" }, [
      el("a", { class: "brand", href: CONFIG.PAGES.home, "aria-label": `${CONFIG.BRAND} home` }, [
        buildBrandMark(),
        el("span", { class: "brand__word", text: CONFIG.BRAND }),
      ]),
      el("span", { class: "navbar__rule", "aria-hidden": "true" }),
      links,
      el("div", { class: "navbar__right" }, rightChildren),
      // Last in the DOM so it sits at the far right on phones; hidden on desktop
      burger,
    ]),
  ]);


  // ---- Mobile menu (same links, panel layout under 720px) ----

  function setOpen(open) {
    navbar.classList.toggle("is-open", open);
    burger.setAttribute("aria-expanded", String(open));
    burger.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  }

  burger.addEventListener("click", (event) => {
    event.stopPropagation();
    setOpen(!navbar.classList.contains("is-open"));
  });

  // Any link closes the panel
  links.addEventListener("click", (event) => {
    if (event.target.closest("a")) setOpen(false);
  });

  // Register this bar for the module-level outside-click, Escape and scroll
  // handlers, so a rebuild never stacks listeners.
  mounted = { navbar, setOpen };
  navbar.classList.toggle("is-scrolled", window.scrollY > 4);

  return navbar;
}


// ---- Rebuild the bar in place ----
// Used after a profile save, so the avatar and name stop showing the old value.

function refreshNavbar(user, active = "") {
  const existing = document.querySelector(".navbar");

  if (!existing) return;

  existing.replaceWith(buildNavbar(user, active));
  window.AppTheme?.sync();
}


// ---- Skip link ----
// Keyboard users land here first and can jump past the navigation.

function ensureSkipLink() {
  const main = document.querySelector("main");

  if (!main) return;

  if (!main.id) main.id = "main-content";
  if (document.querySelector(".skip-link")) return;

  document.body.prepend(
    el("a", { class: "skip-link", href: `#${main.id}`, text: "Skip to content" })
  );
}


// ---- Footer ----

function buildFooter() {
  return el("footer", { class: "footer" }, [
    el("div", { class: "container footer__inner" }, [
      el("span", { text: `[${CONFIG.BRAND}] © ${new Date().getFullYear()}` }),
    ]),
  ]);
}


// ---- Mount ----
// mountChrome("projects") renders into <div id="navbar"></div> and
// <div id="footer"></div>. Both are optional.

async function mountChrome(active = "") {
  const user = await session.getUser();

  ensureSkipLink();

  const navTarget = document.querySelector("#navbar");
  const footTarget = document.querySelector("#footer");

  if (navTarget) {
    navTarget.replaceWith(buildNavbar(user, active));
  }

  if (footTarget) {
    footTarget.replaceWith(buildFooter());
  }

  // The toggle was just created, so give it the right label and icon state
  window.AppTheme?.sync();

  return user;
}


export { mountChrome, buildNavbar, buildFooter, refreshNavbar };
