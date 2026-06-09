// accounts_frontend\src\renderer\src\components\Layout.tsx
import { Component, ErrorInfo, ReactNode } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null
  }

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in page:', error, errorInfo)
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: 24,
          background: 'var(--danger-bg)',
          border: '1px solid var(--danger)',
          borderRadius: 8,
          margin: '20px 0',
          animation: 'fadeUp 0.3s ease'
        }}>
          <h3 style={{ color: 'var(--danger)', marginBottom: 8, fontSize: 16, fontWeight: 700 }}>Something went wrong</h3>
          <p style={{ color: 'var(--t2)', fontSize: 13, marginBottom: 16 }}>
            An unexpected error occurred while rendering this page.
          </p>
          <pre style={{
            fontSize: 12,
            fontFamily: 'monospace',
            overflow: 'auto',
            background: 'rgba(0,0,0,0.04)',
            padding: '12px 14px',
            borderRadius: 6,
            color: '#333'
          }}>
            {this.state.error?.message || String(this.state.error)}
          </pre>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="btn btn-danger btn-sm"
            style={{ marginTop: 16 }}
          >
            Try Again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

export default function Layout() {
  return (
    <>
      <Sidebar />
      <main className="layout">
        <div className="page">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </div>
      </main>
    </>
  )
}
