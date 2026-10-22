// ============================================================
// ui/toast.js
// Purpose:   Bottom-right notifications, plus the thin top progress bar.
// Loaded by: every page script
// ============================================================

import { CONFIG } from "../core/config.js";
import { el } from "./dom.js";

let container = null;

function getContainer() {
  if (container) return container;

  // The live region is the message text, not the container: a close button
  // inside role="status" would be announced as part of the status itself.
  container = el("div", { class: "toasts", role: "region", "aria-label": "Notifications" });
  document.body.append(container);

  return container;
}


// ---- toast("Saved", { type: "success", title: "Project created" }) ----

function toast(message, { type = "info", title = null, timeout = CONFIG.TOAST_MS } = {}) {
  const node = el("div", { class: `toast toast--${type}` }, [
    el("div", { role: "status" }, [
      title ? el("div", { class: "toast__title", text: title }) : null,
      el("div", { class: "toast__body", text: message }),
    ]),
    el("button", {
      type: "button",
      class: "toast__close",
      "aria-label": "Dismiss",
      text: "×",
      onclick: () => remove(),
    }),
  ]);

  function remove() {
    node.classList.add("is-leaving");
    setTimeout(() => node.remove(), 160);
  }

  getContainer().append(node);

  if (timeout > 0) {
    setTimeout(remove, timeout);
  }

  return remove;
}

const success = (message, options) => toast(message, { ...options, type: "success" });
const error = (message, options) => toast(message, { ...options, type: "error", timeout: 6000 });
const warn = (message, options) => toast(message, { ...options, type: "warn" });


// ---- Top progress bar ----
// startProgress() / stopProgress() around the first fetch of a page

let bar = null;
let pending = 0;

function startProgress() {
  if (!bar) {
    bar = el("div", { class: "progress" });
    document.body.append(bar);
  }

  // Reference counted: two lists loading at once should finish the bar only
  // when BOTH are done, not when the first one lands.
  pending += 1;

  // Jump back to 0 without animating, then grow to 70% on the next frame.
  // Without this the bar would run backwards from 100% every time.
  bar.classList.remove("is-done");
  bar.style.transition = "none";
  bar.style.width = "0%";

  requestAnimationFrame(() => {
    bar.style.transition = "";
    bar.style.width = "70%";
  });
}

function stopProgress() {
  if (!bar) return;

  pending = Math.max(0, pending - 1);

  if (pending > 0) return;

  bar.style.width = "100%";
  bar.classList.add("is-done");
}


export { toast, success, error, warn, startProgress, stopProgress };
