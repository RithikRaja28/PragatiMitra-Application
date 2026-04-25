import { createBrowserRouter, Navigate } from 'react-router-dom'
import { lazy } from 'react'

import RootLayout from '../layouts/RootLayout'
import AuthLayout from '../layouts/AuthLayout/Authlayout'


const Home = lazy(() => import('../pages/Home'))
const Dashboard = lazy(() => import('../pages/Dashboard'))
const Reports = lazy(() => import('../pages/Reports'))
const Login = lazy(() => import('../pages/Login/Login'))
const NotFound = lazy(() => import('../pages/NotFound'))
const App = lazy(() => import('../App'))
const router = createBrowserRouter([

  // Redirect root to login
  { index: true, path: '/', element: <Navigate to="/login" replace /> },

  // Auth routes (login, etc.)
  {
    path: '/',
    element: <AuthLayout />,
    children: [
      { path: 'login', element: <Login /> },
    ],
  },

  // Protected app routes
  {
    element: <RootLayout />,
    children: [
      { path: 'dashboard', element: <Dashboard /> },
      { path: 'reports',   element: <Reports /> },
    ],
  },

  { path: '*', element: <NotFound /> },
])

export default router
