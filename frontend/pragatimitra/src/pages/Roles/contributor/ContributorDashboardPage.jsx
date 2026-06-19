import { useLanguage } from "../../../i18n/LanguageContext";
import { t } from "../../../i18n/translations";
import PageHeader from "../../../ui/PageHeader";

export default function ContributorDashboardPage() {
  const { lang } = useLanguage();
  return (
    <div style={{ padding: "32px 36px", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <PageHeader
        breadcrumb={[t("Home", lang), t("Dashboard", lang)]}
        title={t("Dashboard", lang)}
        description={t("Welcome to PragatiMitra. Your assigned tasks and forms will appear here.", lang)}
      />

      <div style={{
        background: "#fff", borderRadius: 14,
        border: "1px solid rgba(0,0,0,0.07)",
        boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
        padding: "56px 48px",
        textAlign: "center", color: "#94a3b8",
      }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: "#1e293b", marginBottom: 8 }}>
          {t("No tasks assigned yet", lang)}
        </h3>
        <p style={{ fontSize: 14, maxWidth: 380, margin: "0 auto", lineHeight: 1.6 }}>
          {t("Your Department Admin will assign tasks and form sections to you. Check back after your admin has configured the current reporting year.", lang)}
        </p>
      </div>
    </div>
  );
}
