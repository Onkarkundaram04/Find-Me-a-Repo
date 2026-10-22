// ============================================================
// ui/icons.js
// Purpose:   Inline SVG icons. Emoji were replaced because they render
//            differently on every OS and cannot inherit colour or stroke.
// Loaded by: any page that needs an icon-only button
// ============================================================

const PATHS = {
  // pencil
  edit: '<path d="M11.2 2.6a1.4 1.4 0 0 1 2 2L5.6 12.2 3 13l.8-2.6z"/>',

  // bin
  trash:
    '<path d="M2.8 4.2h10.4M6.2 4.2V2.6h3.6v1.6M4.4 4.2l.6 9h6l.6-9"/>',

  // external link
  external: '<path d="M6.5 3.2h6.3v6.3M12.8 3.2 6.4 9.6M9.4 12.8H3.2V6.6"/>',

  // arrow left
  back: '<path d="M9.5 3 5 8l4.5 5"/>',

  // sun — shown while the dark theme is active
  sun:
    '<circle cx="8" cy="8" r="3.1"/>' +
    '<path d="M8 1.3v1.7M8 13v1.7M1.3 8h1.7M13 8h1.7M3.3 3.3l1.2 1.2M11.5 11.5l1.2 1.2M12.7 3.3l-1.2 1.2M4.5 11.5l-1.2 1.2"/>',

  // moon — shown while the light theme is active
  moon: '<path d="M13.2 9.6A5.6 5.6 0 0 1 6.4 2.8a5.6 5.6 0 1 0 6.8 6.8z"/>',

  // hamburger — mobile nav
  menu: '<path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11"/>',

  // chevron — user menu affordance
  chevron: '<path d="M4.5 6.5 8 10l3.5-3.5"/>',

  // funnel — opens a filter panel
  filter: '<path d="M2.5 3.5h11l-4.2 5v4L6.7 13.7V8.5z"/>',

  // eye — reveal a password
  eye:
    '<path d="M0.8 8s2.6-5.2 7.2-5.2 7.2 5.2 7.2 5.2-2.6 5.2-7.2 5.2S0.8 8 0.8 8z"/>' +
    '<circle cx="8" cy="8" r="2.2"/>',

  // eye with a slash — hide it again
  eyeOff:
    '<path d="M0.8 8s2.6-5.2 7.2-5.2 7.2 5.2 7.2 5.2-2.6 5.2-7.2 5.2S0.8 8 0.8 8z"/>' +
    '<circle cx="8" cy="8" r="2.2"/>' +
    '<path d="M2.6 2.6l10.8 10.8"/>',
};

function icon(name, size = 16) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");

  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.4");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.innerHTML = PATHS[name] || "";

  return svg;
}

export { icon, PATHS };
