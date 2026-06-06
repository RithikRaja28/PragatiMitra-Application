import React from "react";
import { color, radius } from "./tokens";

/** Skeleton — shimmer placeholder. Used for loading states instead of spinners. */
export function Skeleton({ width = "100%", height = 14, style }) {
  return (
    <span style={{
      display: "inline-block", width, height, borderRadius: radius.sm,
      background: `linear-gradient(90deg, ${color.hover} 25%, #ECEFF3 37%, ${color.hover} 63%)`,
      backgroundSize: "400px 100%", animation: "ui-skeleton 1.2s ease-in-out infinite",
      ...style,
    }} />
  );
}

/** SkeletonRows — N table-row skeletons matching a column count. */
export function SkeletonRows({ rows = 6, cols = 4 }) {
  return (
    <div style={{ padding: "8px 0" }}>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} style={{ display: "flex", gap: 16, alignItems: "center", padding: "0 18px", height: 64, borderBottom: `1px solid ${color.border}` }}>
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} width={c === 0 ? 30 : `${Math.max(40, 100 - c * 12)}%`} height={c === 0 ? 30 : 13} style={c === 0 ? { borderRadius: 8, flexShrink: 0 } : { flex: 1 }} />
          ))}
        </div>
      ))}
    </div>
  );
}
