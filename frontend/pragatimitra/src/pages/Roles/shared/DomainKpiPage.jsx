import KpiManagementPage from "../../../components/KPI/KpiManagementPage";

/* Hospital Admin / Finance Admin KPI page. `domain` maps 1:1 to the KPI scope
   ("hospital" | "finance") so these KPIs are stored and listed in their own
   scope — fully isolated from Institute KPI and from each other. */
export default function DomainKpiPage({ domain }) {
  return <KpiManagementPage scope={domain} />;
}
