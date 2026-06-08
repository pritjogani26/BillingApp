// accounts_frontend\src\renderer\src\pages\Login.tsx
import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Zap, Eye, EyeOff, AlertCircle } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { useAuth } from '../context/AuthContext'
import client from '../api/client'

export default function Login() {
  const [form, setForm] = useState({ username: '', password: '' })
  const [showPwd, setShowPwd] = useState(false)
  const [error, setError] = useState('')
  const { login } = useAuth()
  const navigate = useNavigate()

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }))
    if (error) setError('')
  }

  const loginMutation = useMutation({
    mutationFn: async (credentials: typeof form) => {
      const res = await client.post('/auth/login/', credentials)
      return res.data.data
    },
    onSuccess: (data) => {
      login(data.token, data.user || null)
      navigate('/', { replace: true })
    },
    onError: (err: any) => {
      setError(
        err.response?.data?.message ||
          'Unable to connect to server. Make sure the backend is running.'
      )
    }
  })

  const loading = loginMutation.isPending

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedUsername = form.username.trim()
    const trimmedPassword = form.password.trim()
    if (!trimmedUsername || !trimmedPassword) {
      setError('Username and password are required.')
      return
    }
    setError('')
    loginMutation.mutate({ username: trimmedUsername, password: trimmedPassword })
  }

  return (
    <div className="login-root">
      {/* ── Left: Branding ─────────────────────────── */}
      <div className="login-brand-panel">
        <div className="login-brand-logo">
          <div className="login-brand-icon">
            <Zap size={22} color="#fff" strokeWidth={2.5} />
          </div>
          <div>
            <div className="login-brand-name">BillingApp</div>
            <div className="login-brand-tag">Professional Edition</div>
          </div>
        </div>

        <div className="login-brand-copy">
          <div className="login-brand-headline">
            Smart billing
            <br />
            for your business.
          </div>
          <div className="login-brand-desc">
            Manage invoices, customers, payments,
            <br />
            and GST reports — all from one place.
          </div>
        </div>

        <div className="login-brand-footer">
          © {new Date().getFullYear()} BillingApp. All rights reserved.
        </div>
      </div>

      {/* ── Right: Form ────────────────────────────── */}
      <div className="login-form-side">
        <div className="login-form-box">
          <h2>Welcome back</h2>
          <div className="login-sub">Sign in to continue to BillingApp</div>

          {error && (
            <div className="login-err">
              <AlertCircle size={15} />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="fgrp">
              <label className="flabel">Username</label>
              <input
                className="finput"
                name="username"
                value={form.username}
                onChange={onChange}
                placeholder="Enter your username"
                autoComplete="username"
                maxLength={100}
                autoFocus
              />
            </div>

            <div className="fgrp">
              <label className="flabel">Password</label>
              <div className="pw-wrap">
                <input
                  className="finput"
                  type="password"
                  name="password"
                  value={form.password}
                  onChange={onChange}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  maxLength={128}
                  style={{ paddingRight: 40, WebkitTextSecurity: showPwd ? 'none' : 'disc' } as React.CSSProperties}
                />
                <button
                  type="button"
                  className="pw-eye"
                  onClick={() => setShowPwd((v) => !v)}
                  tabIndex={-1}
                >
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{
                width: '100%',
                justifyContent: 'center',
                padding: '11px',
                fontSize: 14,
                marginTop: 8
              }}
            >
              {loading ? (
                <>
                  <span
                    className="spinner spinner-sm"
                    style={{ borderTopColor: '#fff', borderColor: 'rgba(255,255,255,.3)' }}
                  />
                  Signing in…
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
