export default function ContributorDashboardPage() {
  return (
    <div style={{ padding: "32px 36px", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          background: "#dcfce714", borderRadius: 8, padding: "4px 12px", marginBottom: 12,
        }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#16a34a" }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: "#16a34a", textTransform: "uppercase", letterSpacing: 1 }}>
            Contributor
          </span>
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "#1e293b", letterSpacing: "-0.4px", marginBottom: 6 }}>
          Dashboard
        </h1>
        <p style={{ color: "#94a3b8", fontSize: 14 }}>
          Welcome to PragatiMitra. Your assigned tasks and forms will appear here.
        </p>
      </div>

      <div style={{
        background: "#fff", borderRadius: 14,
        border: "1px solid rgba(0,0,0,0.07)",
        boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
        padding: "56px 48px",
        textAlign: "center", color: "#94a3b8",
      }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: "#1e293b", marginBottom: 8 }}>
          No tasks assigned yet
        </h3>
        <p style={{ fontSize: 14, maxWidth: 380, margin: "0 auto", lineHeight: 1.6 }}>
          Your Department Admin will assign tasks and form sections to you.
          Check back after your admin has configured the current reporting year.
        </p>
      </div>
    </div>
  );
}
