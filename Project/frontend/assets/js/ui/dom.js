// ============================================================
// ui/dom.js
// Purpose:   Small DOM helpers every page reuses — element builder, dates,
//            modal (with focus trap), tabs (keyboard), pagination.
//            No fetching happens here.
// Loaded by: every page script
// ============================================================

// ---- Element builder ----
// el("div", { class: "card" }, [child, "text"])
// Attributes: class, text, html, dataset, on<Event>, everything else via property
// when the element has one, otherwise via setAttribute.

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;

    if (key === "class") {
      node.className = value;
    } else if (key === "text") {
      node.textContent = value;
    } else if (key === "html") {
      node.innerHTML = value;
    } else if (key === "dataset") {
      Object.assign(node.dataset, value);
    } else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key in node && key !== "list" && typeof value !== "object") {
      node[key] = value;
    } else {
      node.setAttribute(key, value);
    }
  }

  for (const child of [].concat(children)) {
    if (child === undefined || child === null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }

  return node;
}


// ---- Lookups ----

const qs = (selector, scope = document) => scope.querySelector(selector);
const qsa = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));


// ---- Text helpers ----

// "Alex Carter" -> "AC", "alex" -> "AL"
function initials(name) {
  const clean = String(name || "").trim();

  if (!clean) return "?";

  const parts = clean.split(/\s+/).filter(Boolean);

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function truncate(value, max = 120) {
  const text = String(value || "");
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}


// ---- Dates ----

// 2026-10-12T09:30:00Z -> "12 Oct 2026"
function formatDate(iso) {
  if (!iso) return "—";

  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}


// ---- Debounce (search input) ----

function debounce(fn, wait = 300) {
  let timer = null;

  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}


// ---- Busy state ----
// Buttons get the spinner; selects/other controls only get disabled, because a
// spinning circle inside a <select> looks like a rendering bug.

function setBusy(control, busy) {
  if (!control) return;

  control.disabled = busy;

  if (control.tagName === "BUTTON") {
    control.classList.toggle("is-loading", busy);
  } else {
    control.classList.toggle("is-busy", busy);
  }
}


// ---- Modal ----
// One implementation for every dialog: focus trap, Escape, scroll lock,
// backdrop click, and focus restored to whatever opened it.

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function openModal(panel, { onClose = null } = {}) {
  const previouslyFocused = document.activeElement;
  const overlay = el("div", { class: "modal", role: "dialog", "aria-modal": "true" }, [panel]);

  // Name the dialog from its heading when it has one
  const heading = qs(".modal__title", panel);

  if (heading) {
    if (!heading.id) heading.id = `modal-title-${Date.now()}`;
    overlay.setAttribute("aria-labelledby", heading.id);
  }

  function focusables() {
    return qsa(FOCUSABLE, panel).filter((node) => node.offsetParent !== null);
  }

  function onKey(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }

    if (event.key !== "Tab") return;

    const items = focusables();

    if (items.length === 0) {
      event.preventDefault();
      return;
    }

    const first = items[0];
    const last = items[items.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  let closed = false;

  function close(result) {
    if (closed) return;
    closed = true;

    document.removeEventListener("keydown", onKey);
    document.body.classList.remove("modal-open");
    overlay.remove();

    if (previouslyFocused && typeof previouslyFocused.focus === "function") {
      previouslyFocused.focus();
    }

    onClose?.(result);
  }

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });

  document.addEventListener("keydown", onKey);
  document.body.classList.add("modal-open");
  document.body.append(overlay);

  // Focus the first control, or the panel itself if there is none
  const items = focusables();

  if (items.length > 0) {
    items[0].focus();
  } else {
    panel.tabIndex = -1;
    panel.focus();
  }

  return { close, overlay };
}


// ---- Modal confirm ----
// const ok = await confirmDialog({ title, text, confirmLabel, danger });

function confirmDialog({
  title,
  text,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
}) {
  return new Promise((resolve) => {
    let handle = null;

    const panel = el("div", { class: "modal__panel" }, [
      el("h2", { class: "modal__title", text: title }),
      text ? el("p", { class: "modal__text", text }) : null,
      el("div", { class: "modal__actions" }, [
        el("button", {
          type: "button",
          class: "btn btn--secondary",
          text: cancelLabel,
          onclick: () => handle.close(false),
        }),
        el("button", {
          type: "button",
          class: `btn ${danger ? "btn--danger" : "btn--primary"}`,
          text: confirmLabel,
          onclick: () => handle.close(true),
        }),
      ]),
    ]);

    handle = openModal(panel, { onClose: (result) => resolve(Boolean(result)) });
  });
}


// ---- Typed confirmation ----
// For irreversible actions. The confirm button stays disabled until the user
// types the exact word, so a stray double-click cannot destroy anything.
// Inherits the modal's focus trap, Escape handling and focus restore.

function confirmTyped({ title, text, word, confirmLabel = "Confirm" }) {
  return new Promise((resolve) => {
    let handle = null;

    const input = el("input", {
      class: "input mt-3",
      type: "text",
      placeholder: word,
      autocomplete: "off",
      "aria-label": `Type ${word} to confirm`,
    });

    const confirmBtn = el("button", {
      type: "button",
      class: "btn btn--danger",
      text: confirmLabel,
      disabled: true,
      onclick: () => handle.close(true),
    });

    input.addEventListener("input", () => {
      confirmBtn.disabled = input.value.trim().toUpperCase() !== word.toUpperCase();
    });

    const panel = el("div", { class: "modal__panel" }, [
      el("h2", { class: "modal__title", text: title }),
      el("p", { class: "modal__text", text }),
      el("p", { class: "xs muted mt-3" }, [
        "Type ",
        el("code", { text: word }),
        " to confirm.",
      ]),
      input,
      el("div", { class: "modal__actions" }, [
        el("button", {
          type: "button",
          class: "btn btn--secondary",
          text: "Cancel",
          onclick: () => handle.close(false),
        }),
        confirmBtn,
      ]),
    ]);

    // The input is first in the DOM, so openModal focuses it automatically
    handle = openModal(panel, { onClose: (result) => resolve(Boolean(result)) });
  });
}


// ---- Tabs ----
// Turns a [role=tablist] into a keyboard-navigable control: click, Arrow
// keys, Home/End, and a roving tabindex so Tab does not walk through all tabs.

function wireTabs(onSelect) {
  const tabs = qsa('[role="tab"]');

  if (tabs.length === 0) return;

  function select(tab, { focus = false } = {}) {
    for (const item of tabs) {
      const active = item === tab;
      item.classList.toggle("is-active", active);
      item.setAttribute("aria-selected", String(active));
      item.tabIndex = active ? 0 : -1;
    }

    if (focus) tab.focus();
    onSelect(tab.dataset.tab);
  }

  tabs.forEach((tab, index) => {
    tab.tabIndex = tab.classList.contains("is-active") ? 0 : -1;

    tab.addEventListener("click", () => select(tab));

    tab.addEventListener("keydown", (event) => {
      let next = null;

      if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
      else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = tabs.length - 1;

      if (next === null) return;

      event.preventDefault();
      select(tabs[next], { focus: true });
    });
  });
}


// ---- Pagination ----
// buildPagination({ page, totalPages, total, limit, onChange })

function buildPagination({ page, totalPages, total, limit, onChange }) {
  const safeTotal = Number(total) || 0;
  const safePages = Math.max(Number(totalPages) || 1, 1);
  const from = safeTotal === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, safeTotal);

  const info = el("div", {
    class: "pagination__info",
    text: `Showing ${from}–${to} of ${safeTotal}`,
  });

  const wanted = new Set([1, safePages, page - 1, page, page + 1]);
  const numbers = [...wanted].filter((n) => n >= 1 && n <= safePages).sort((a, b) => a - b);

  const pages = el("div", { class: "pagination__pages" });

  pages.append(
    el("button", {
      type: "button",
      class: "page-btn page-btn--nav",
      text: "Prev",
      disabled: page <= 1,
      onclick: () => onChange(page - 1),
    })
  );

  let previous = 0;

  for (const number of numbers) {
    if (previous && number - previous > 1) {
      pages.append(el("span", { class: "page-btn page-btn--dots", text: "…" }));
    }

    pages.append(
      el("button", {
        type: "button",
        class: `page-btn${number === page ? " is-active" : ""}`,
        text: String(number),
        "aria-current": number === page ? "page" : null,
        onclick: () => {
          if (number !== page) onChange(number);
        },
      })
    );

    previous = number;
  }

  pages.append(
    el("button", {
      type: "button",
      class: "page-btn page-btn--nav",
      text: "Next",
      disabled: page >= safePages,
      onclick: () => onChange(page + 1),
    })
  );

  return el("div", { class: "pagination" }, [info, pages]);
}


// ---- Empty state ----

function emptyState({ title, text, action } = {}) {
  return el("div", { class: "empty" }, [
    el("div", { class: "empty__title", text: title || "Nothing here yet" }),
    text ? el("p", { class: "empty__text", text }) : null,
    action ? el("div", { class: "empty__actions" }, [action]) : null,
  ]);
}


export {
  el,
  qs,
  qsa,
  initials,
  truncate,
  formatDate,
  debounce,
  setBusy,
  openModal,
  confirmDialog,
  confirmTyped,
  wireTabs,
  buildPagination,
  emptyState,
};
