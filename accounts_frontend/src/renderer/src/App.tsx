import React, { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from './context/AuthContext'
import TitleBar from './components/TitleBar'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Customers from './pages/Customers'
import Products from './pages/Products'
import Invoices from './pages/Invoices'
import Payments from './pages/Payments'
import Ledger from './pages/Ledger'
import Reports from './pages/Reports'
import Settings from './pages/Settings'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isValidated } = useAuth()
  if (!isValidated) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" style={{ width: 40, height: 40 }} />
      </div>
    )
  }
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
}

function AppRoutes() {
  const { isAuthenticated, isValidated } = useAuth()
  return (
    <>
      <TitleBar />
      <Routes>
        <Route
          path="/login"
          element={isAuthenticated && isValidated ? <Navigate to="/" replace /> : <Login />}
        />
        <Route
          path="/"
          element={
            <PrivateRoute>
              <Layout />
            </PrivateRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="customers" element={<Customers />} />
          <Route path="products" element={<Products />} />
          <Route path="invoices" element={<Invoices />} />
          <Route path="payments" element={<Payments />} />
          <Route path="ledger" element={<Ledger />} />
          <Route path="reports" element={<Reports />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route
          path="*"
          element={
            isAuthenticated && isValidated ? (
              <Navigate to="/" replace />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
      </Routes>
    </>
  )
}

export default function App() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
            refetchOnWindowFocus: false
          }
        }
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </QueryClientProvider>
  )
}
