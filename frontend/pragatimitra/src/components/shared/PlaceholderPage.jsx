import React from "react";
import { FileText } from "lucide-react";

export default function PlaceholderPage({ title, subtitle, color = "#2563eb" }) {
  return (
    <div style={{ padding: "32px 36px", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          background: color + "14", borderRadius: 8, padding: "4px 12px", marginBottom: 12,
        }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: color }} />
          <span style={{ fontSize: 11, fontWeight: 600, color, textTransform: "uppercase", letterSpacing: 1 }}>
            {title}
          </span>
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "#1e293b", letterSpacing: "-0.4px", marginBottom: 6 }}>
          {title}
        </h1>
        <p style={{ color: "#94a3b8", fontSize: 14 }}>{subtitle}</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16, marginBottom: 28 }}>
        {["Total", "Active", "Pending", "Resolved"].map((label, i) => (
          <div key={label} style={{
            background: "#fff", border: "1px solid #e6eaf0",
            borderRadius: 14, padding: "20px 22px",
            boxShadow: "0 1px 2px rgba(16,24,40,0.04), 0 4px 12px rgba(16,24,40,0.05)",
          }}>
            <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>
              {label}
            </div>
            <div style={{ fontSize: 30, fontWeight: 700, color: "#1e293b", letterSpacing: "-1px" }}>
              {(i + 1) * 148 + 17}
            </div>
            <div style={{ fontSize: 12, color: "#16a34a", marginTop: 6, fontWeight: 600 }}>
              ↑ {((i + 1) * 2.3).toFixed(1)}% this month
            </div>
          </div>
        ))}
      </div>

      <div style={{
        background: "#fff", border: "1px solid #e6eaf0",
        borderRadius: 14, overflow: "hidden",
        boxShadow: "0 1px 2px rgba(16,24,40,0.04), 0 4px 12px rgba(16,24,40,0.05)",
      }}>
        <div style={{
          padding: "16px 22px", borderBottom: "1px solid #f1f5f9",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: "#1e293b" }}>Recent Activity</span>
          <span style={{ fontSize: 12.5, color: "#2563eb", cursor: "pointer", fontWeight: 600 }}>View all</span>
        </div>
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 14, padding: "14px 22px",
            borderBottom: i < 5 ? "1px solid #f1f5f9" : "none",
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 9, background: "#eef2f7",
              border: "1px solid #e6eaf0", flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b",
            }}>
              <FileText size={17} strokeWidth={1.8} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b", marginBottom: 2 }}>Record #{i * 100 + 43}</div>
              <div style={{ fontSize: 11.5, color: "#94a3b8" }}>Updated {i} hour{i > 1 ? "s" : ""} ago</div>
            </div>
            <div style={{
              padding: "3px 11px", borderRadius: 20, fontSize: 11, fontWeight: 600,
              background: i % 2 === 0 ? "#eff6ff" : "#dcfce7",
              color: i % 2 === 0 ? "#2563eb" : "#16a34a",
            }}>
              {i % 2 === 0 ? "Active" : "Done"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
