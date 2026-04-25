import { Outlet } from 'react-router-dom'
import { Suspense } from 'react'
import Navbar from '../../components/Navbar'
import './RootLayout.css'

function PageLoader() {
  return <div className="page-loader">Loading…</div>
}

export default function RootLayout() {
  return (
    <div className="root-layout">
      <Navbar />
      <main className="root-layout__content">
        <Suspense fallback={<PageLoader />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  )
}
