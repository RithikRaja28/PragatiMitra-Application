import React from "react";
import { color, size, font } from "./tokens";

/**
 * PageContainer — the SINGLE standard page-body wrapper.
 *
 * Establishes the same max width, horizontal padding and left/right edges for
 * EVERY page, so the header, toolbar, tables and cards all share one alignment.
 * Matches the convention already used by the migrated pages
 * (maxWidth 1600, centered, 24px×32px padding).
 *
 * Structure the body follows:
 *   <PageContainer>
 *     <PageHeader … />
 *     <Toolbar> … </Toolbar>
 *     <Card> … table / cards / EmptyState / ErrorState … </Card>
 *   </PageContainer>
 */
export default function PageContainer({ children, style, ...rest }) {
  return (
    <div
      style={{
        maxWidth: size.maxContent,
        margin: "0 auto",
        padding: "24px 32px",
        minHeight: "100%",
        display: "flex",
        flexDirection: "column",
        fontFamily: font.family,
        color: color.text,
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
