// ============================================================
// ui/popover.js
// Purpose:   A small anchored panel — one open at a time. Closes on an outside
//            click and on Escape, moves focus in on open and back on close.
//            Used by the browse page's filter button.
// Loaded by: pages that need a menu/panel next to a button
// ============================================================

let openHandle = null;

function closeOpen(restoreFocus = false) {
  if (!openHandle) return;
  openHandle.close({ restoreFocus });
}

// Registered once, for every popover on the page
document.addEventListener("click", (event) => {
  if (!openHandle) return;
  if (openHandle.root.contains(event.target)) return;

  closeOpen();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeOpen(true);
});


// createPopover({ root, trigger, panel })
//   root    — the wrapper that contains both, used for outside-click detection
//   trigger — the button that opens and closes it

function createPopover({ root, trigger, panel }) {
  panel.hidden = true;
  trigger.setAttribute("aria-expanded", "false");

  const handle = {
    root,

    isOpen() {
      return !panel.hidden;
    },

    open() {
      // Only one panel at a time
      if (openHandle && openHandle !== handle) openHandle.close();

      panel.hidden = false;
      openHandle = handle;
      trigger.setAttribute("aria-expanded", "true");

      const first = panel.querySelector("input, button, select, a[href]");
      if (first) first.focus();
    },

    close({ restoreFocus = false } = {}) {
      if (panel.hidden) return;

      panel.hidden = true;

      if (openHandle === handle) openHandle = null;

      trigger.setAttribute("aria-expanded", "false");

      if (restoreFocus) trigger.focus();
    },

    toggle() {
      if (panel.hidden) handle.open();
      else handle.close({ restoreFocus: true });
    },
  };

  trigger.addEventListener("click", (event) => {
    event.stopPropagation();
    handle.toggle();
  });

  return handle;
}

export { createPopover };
