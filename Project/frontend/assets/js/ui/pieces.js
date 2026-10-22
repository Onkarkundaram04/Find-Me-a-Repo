// ============================================================
// ui/pieces.js
// Purpose:   Reusable markup builders — badge, chip list, avatar, project card,
//            empty list row. Keeps the same markup on every page.
// Loaded by: every page that renders projects or applications
// ============================================================

import { el, initials, truncate, formatDate } from "./dom.js";
import { icon } from "./icons.js";


// ---- Status pill ----
// OPEN / CLOSED -> project, PENDING / ACCEPTED / REJECTED -> application

function statusBadge(status) {
  const key = String(status || "").toUpperCase();
  const known = ["OPEN", "CLOSED", "PENDING", "ACCEPTED", "REJECTED"];
  const variant = known.includes(key) ? key.toLowerCase() : "closed";

  return el("span", { class: `badge badge--${variant}`, text: key || "—" });
}

function roleBadge(role) {
  const isAdmin = String(role).toUpperCase() === "ADMIN";

  return el("span", {
    class: `badge badge--${isAdmin ? "admin" : "user"}`,
    text: isAdmin ? "ADMIN" : "USER",
  });
}

function userStatusBadge(status) {
  const key = String(status || "").toUpperCase();

  // ACTIVE and DEACTIVATED reuse the neutral/green pair; SUSPENDED is amber
  const variant =
    key === "ACTIVE" ? "open" : key === "SUSPENDED" ? "pending" : "closed";

  return el("span", { class: `badge badge--${variant}`, text: key || "—" });
}


// ---- Tech chips, with "+N" when there are too many ----

function chipList(tags, max = 4) {
  const list = Array.isArray(tags) ? tags : [];
  const wrap = el("div", { class: "chips" });

  for (const tag of list.slice(0, max)) {
    wrap.append(el("span", { class: "chip", text: tag }));
  }

  if (list.length > max) {
    wrap.append(el("span", { class: "chip chip--more", text: `+${list.length - max}` }));
  }

  return wrap;
}


// ---- Initials avatar ----

function avatar(name, variant = "") {
  return el("span", {
    class: `avatar${variant ? ` avatar--${variant}` : ""}`,
    text: initials(name),
    title: name || "",
  });
}


// ---- Project card ----
// compact: the browse-grid variant. Without it, the same card is used on the
// dashboard with an actions slot on the right.

function projectCard(project, { href = null, actions = null } = {}) {
  const title = href
    ? el("a", { class: "project-card__title", href, text: project.title })
    : el("div", { class: "project-card__title", text: project.title });

  const applicantCount = project._count?.applications;
  const hasCount = typeof applicantCount === "number";

  const owner = project.owner
    ? el("div", { class: "owner" }, [
        avatar(project.owner.name),
        el("div", {}, [
          el("div", { class: "owner__name", text: project.owner.name }),
          hasCount
            ? el("div", {
                class: "owner__meta",
                text: `${applicantCount} applicant${applicantCount === 1 ? "" : "s"}`,
              })
            : null,
        ]),
      ])
    : el("div", { class: "owner__meta", text: formatDate(project.createdAt) });

  const foot = el("div", { class: "project-card__foot" }, [owner]);

  if (actions) {
    foot.append(actions);
  } else if (href) {
    foot.append(el("a", { class: "link-arrow", href, text: "Details" }));
  }

  return el("article", { class: "project-card" }, [
    el("div", { class: "project-card__head" }, [title, statusBadge(project.status)]),
    el("p", { class: "project-card__desc clamp-2", text: truncate(project.description, 140) }),
    chipList(project.techStack, 4),
    foot,
  ]);
}


// ---- Skeleton placeholders shown before the first fetch resolves ----

function skeletonCards(count = 6) {
  return Array.from({ length: count }, () => el("div", { class: "skeleton skeleton--card" }));
}

function skeletonRows(count = 5) {
  return Array.from({ length: count }, () => el("div", { class: "skeleton skeleton--row" }));
}


// ---- Single-choice filter ----
// The control the browse page uses for status, reused everywhere else so no
// page falls back to a row of hand-built chips.
//
// const control = filterSelect({ container, label, allLabel, values, value, onChange });
// control.setValue("OPEN");

function filterSelect({ container, label, allLabel, values, value = "", format, onChange }) {
  const select = el("select", {
    class: "select select--filter",
    "aria-label": label,
    onchange: (event) => onChange(event.target.value),
  });

  select.append(el("option", { value: "", text: allLabel }));

  for (const item of values) {
    select.append(el("option", { value: item, text: format ? format(item) : item }));
  }

  select.value = value;

  container.replaceChildren(
    el("span", { class: "filter-group__label", text: label }),
    select
  );

  return {
    setValue(next) {
      select.value = next;
    },
  };
}


// ---- Show / hide a password ----
// The button is in the markup, so the field still works if JS never loads.
// This only swaps the input type and the icon.

function wirePasswordToggle(input, button) {
  if (!input || !button) return;

  button.hidden = false;
  button.replaceChildren(icon("eye"));
  button.setAttribute("aria-pressed", "false");
  button.setAttribute("aria-label", "Show password");

  button.addEventListener("click", () => {
    const revealed = input.type === "text";

    input.type = revealed ? "password" : "text";
    button.replaceChildren(icon(revealed ? "eye" : "eyeOff"));
    button.setAttribute("aria-pressed", String(!revealed));
    button.setAttribute("aria-label", revealed ? "Show password" : "Hide password");

    // Put the caret back where the person was typing
    input.focus({ preventScroll: true });
  });
}


export {
  statusBadge,
  roleBadge,
  userStatusBadge,
  chipList,
  filterSelect,
  avatar,
  projectCard,
  skeletonCards,
  skeletonRows,
  wirePasswordToggle,
};
