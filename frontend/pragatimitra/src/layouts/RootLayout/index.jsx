import { Outlet } from 'react-router-dom'
import { Suspense } from 'react'
import Navbar from '../../components/Navbar'
import './RootLayout.css'
import App from '../../App'
import AppShell from '../../components/Dashboard/AppShell'


function PageLoader() {
  return <div className="page-loader">Loading…</div>
}
function SalesPage() {
  return (
    <div style={{ padding: 32 }}>
      <h2 style={{ color: "#e2e8f0", fontFamily: "sans-serif" }}>Sales</h2>
      <p style={{ color: "#64748b", marginTop: 8 }}>
        Your sales content goes here.
      </p>
    </div>
  );
}

function ReportsPage() {
  return (
    <div style={{ padding: 32 }}>
      <h2 style={{ color: "#e2e8f0", fontFamily: "sans-serif" }}>Reports</h2>
      <p style={{ color: "#64748b", marginTop: 8 }}>
        Your reports content goes here.
      </p>
    </div>
  );
}

const NAV_ITEMS = [
  {
    group: "Finance",
    items: [
      { id: "sales", label: "Sales", icon: "TrendingUp", badge: "3" },
      { id: "reports", label: "Reports", icon: "BarChart2" },
    ],
  },
];

const PAGES = {
  sales: <SalesPage />,
  reports: <ReportsPage />,
};

export default function RootLayout() {
  return (
    <div className="root-layout">
      <AppShell
      appName="PragatiMitra"
      navItems={NAV_ITEMS}
      pages={PAGES}
      defaultPage="sales"
      user={{ name: "Rithik Raja S", initials: "RR", org: "RMK" }}
      notificationCount={2}
      onNavigate={(id) => console.log("Navigated to:", id)}
    />
      <main className="root-layout__content">
        <Suspense fallback={<PageLoader />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  )
}
