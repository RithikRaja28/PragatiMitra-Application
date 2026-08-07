"use strict";

/* Same charset/collapsing convention as departmentFormService.js's slugify,
   duplicated here (not imported) since that module is a heavy DB-schema-
   management service and this is a pure, dependency-free storage-path helper. */
function slugify(str) {
  return String(str || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s_]/g, "")
    .replace(/\s+/g, "_") || "untitled";
}

function shortId(id) {
  return String(id || "").replace(/-/g, "").slice(0, 8).toLowerCase();
}

function slugWithId(name, id) {
  return `${slugify(name)}-${shortId(id)}`;
}

module.exports = { slugify, shortId, slugWithId };
