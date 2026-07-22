import React from "react";
import { color, radius, shadow, space } from "./tokens";

/** Card — white surface, hairline border, subtle shadow, 24px padding default.
 *  No huge shadows, no gradients. Pass padding={0} for table containers. */
export default function Card({ children, padding = space["2xl"], style, ...rest }) {
  return (
    <div
      style={{
        background: color.surface,
        border: `1px solid ${color.border}`,
        borderRadius: radius.xl,
        boxShadow: shadow.card,
        padding,
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
