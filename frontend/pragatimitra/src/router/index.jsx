import { createBrowserRouter } from 'react-router-dom'
import { lazy } from 'react'

import RootLayout from '../layouts/RootLayout'
import AuthLayout from '../layouts/AuthLayout/Authlayout'


const Home      = lazy(() => import('../pages/Home'))
const Dashboard = lazy(() => import('../pages/Dashboard'))
const Reports   = lazy(() => import('../pages/Reports'))
const Login = lazy(() => import('../pages/Login/Login'))
const NotFound  = lazy(() => import('../pages/NotFound'))

const router = createBrowserRouter([
  
  {
    path: '/',
    element: <RootLayout />,      
    children: [
      { index: true,           element: <Home /> },
      { path: 'dashboard',     element: <Dashboard /> },
      { path: 'reports',       element: <Reports /> },
      
      
    ],
  },
  {
    element: <AuthLayout />,
    children: [
      { path: 'login', element: <Login /> },
      
      
    ],
  },
  
  { path: '*', element: <NotFound /> },
])

export default router
