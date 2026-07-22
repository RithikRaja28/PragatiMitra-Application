/**
 * PageHeader (consolidated).
 *
 * The canonical PageHeader now lives in `src/ui/PageHeader`. This module is a
 * thin re-export so that every existing `components/shared/PageHeader` import
 * renders the ONE standardized header — same props, no call-site changes:
 *
 *   breadcrumb  Array of crumbs (string | { label, onClick })
 *   title       Page title (string | node)
 *   description Supporting text (string | node, optional)
 *   actions     Right-aligned actions node (optional)
 *
 * Keeping a single implementation guarantees identical breadcrumb / title /
 * subtitle styling across the Institution, Department and every other module.
 */
export { default } from "../../ui/PageHeader";
