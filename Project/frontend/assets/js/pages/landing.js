// ============================================================
// pages/landing.js
// Purpose:   The first page anyone sees. Everything that can be real is real:
//            the platform numbers, the newest projects, and the tags people
//            actually use all come from the API. Only the prose is static.
//
// Endpoints:
//   GET /api/meta                  — counts + tech tags
//   GET /api/search?status=OPEN    — three newest open projects
// ============================================================

import { api } from "../core/api.js";
import { CONFIG } from "../core/config.js";
import { mountChrome } from "../ui/navbar.js";
import { el, qs } from "../ui/dom.js";
import { projectCard, skeletonCards } from "../ui/pieces.js";

const statsBox = qs("#hero-stats");
const latestBox = qs("#latest");
const stacksBox = qs("#top-stacks");


// ---- Hero: posting needs an account, so route through login ----

function wireHero(user) {
  if (user) return;

  qs("#hero-secondary").href =
    `${CONFIG.PAGES.login}?next=${encodeURIComponent(CONFIG.PAGES.projectForm)}`;
}


// ---- The four numbers ----

function heroStat(value, label) {
  return el("div", { class: "hero-stat" }, [
    el("span", { class: "hero-stat__value", text: String(value) }),
    el("span", { class: "hero-stat__label", text: label }),
  ]);
}

function renderStats(meta) {
  const counts = meta?.counts;

  if (!counts) {
    statsBox.replaceChildren();
    return;
  }

  statsBox.replaceChildren(
    heroStat(counts.openProjects, "open projects"),
    heroStat(counts.users, "developers"),
    heroStat((meta.techStack || []).length, "technologies"),
    heroStat(counts.applications, "applications sent")
  );
}


// ---- Three newest projects ----

function renderLatest(data) {
  // A failed request must not look like an empty board
  if (!data) {
    latestBox.replaceChildren();
    return;
  }

  const projects = data.projects || [];

  if (projects.length === 0) {
    latestBox.replaceChildren(
      el("div", { class: "empty" }, [
        el("div", { class: "empty__title", text: "Nothing on the board yet" }),
        el("p", { class: "empty__text", text: "Post the first project and it will show up here." }),
        el("div", { class: "empty__actions" }, [
          el("a", { class: "btn btn--primary", href: CONFIG.PAGES.projectForm, text: "Post a project" }),
        ]),
      ])
    );
    return;
  }

  latestBox.replaceChildren(
    ...projects.map((project) =>
      projectCard(project, { href: `${CONFIG.PAGES.project}?id=${project.id}` })
    )
  );
}


// ---- Stacks, most used first ----

function renderStacks(meta) {
  const tags = (meta?.techStack || []).slice(0, 8);

  if (tags.length === 0) {
    stacksBox.replaceChildren();
    return;
  }

  stacksBox.replaceChildren(
    ...tags.map((tag) =>
      el(
        "a",
        {
          class: "stack-link",
          href: `${CONFIG.PAGES.browse}?tech=${encodeURIComponent(tag.name)}`,
          title: `${tag.count} project${tag.count === 1 ? "" : "s"} using ${tag.name}`,
        },
        [
          el("span", { text: tag.name }),
          el("span", { class: "stack-link__count", text: String(tag.count) }),
        ]
      )
    )
  );
}


// ---- Boot ----

async function init() {
  const user = await mountChrome("home");

  wireHero(user);

  latestBox.replaceChildren(...skeletonCards(3));

  // Both are public. A failure hides that section rather than showing a false 0.
  const [meta, latest] = await Promise.all([
    api.get("/meta").catch(() => null),
    api.get("/search", { query: { status: "OPEN", limit: 3 } }).catch(() => null),
  ]);

  renderStats(meta);
  renderStacks(meta);
  renderLatest(latest);
}

init();
