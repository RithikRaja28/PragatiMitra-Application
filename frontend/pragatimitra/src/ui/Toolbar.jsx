import React from "react";
import { space } from "./tokens";

/**
 * Toolbar — the SINGLE action-bar row that holds Search + Filters + Buttons.
 *
 * Everything lives on one vertically-centered row (it wraps gracefully on
 * narrow viewports) so search, filters and actions never float independently.
 * Use <Toolbar.Spacer/> to push trailing actions to the right edge.
 *
 *   <Toolbar>
 *     <SearchInput … />
 *     <FilterChip … />
 *     <Toolbar.Spacer />
 *     <Button>Create</Button>
 *   </Toolbar>
 */
export default function Toolbar({ children, style, ...rest }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: space.md,
        flexWrap: "wrap",
        marginBottom: space.lg,
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

/** Flexible gap that pushes following items to the right edge of the toolbar. */
Toolbar.Spacer = function ToolbarSpacer() {
  return <div style={{ flex: 1, minWidth: 0 }} />;
};

/** Optional grouping wrapper so a cluster of filters stays together when wrapping. */
Toolbar.Group = function ToolbarGroup({ children, style, ...rest }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: space.sm, flexWrap: "wrap", ...style }} {...rest}>
      {children}
    </div>
  );
};
