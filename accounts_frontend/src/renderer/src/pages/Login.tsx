// accounts_frontend\src\renderer\src\pages\Login.tsx
import React, { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Zap, Eye, EyeOff, AlertCircle } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { useAuth } from '../context/AuthContext'
import client from '../api/client'
import { parseApiError } from '../utils/errorHelper'

interface LoginForm {
  username: string
  password: string
}

const INITIAL_FORM: LoginForm = { username: '', password: '' }

export default function Login() {
  const [form, setForm] = useState<LoginForm>(INITIAL_FORM)
  const [showPwd, setShowPwd] = useState(false)
  const [error, setError] = useState<React.ReactNode>('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const { login } = useAuth()
  const navigate = useNavigate()
  const usernameRef = useRef<HTMLInputElement>(null)

  // Force focus onto the username field once this page has actually
  // painted. Using rAF (rather than relying on `autoFocus`) avoids
  // losing the focus race against the previous page's unmount during
  // a logout-triggered navigation.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      usernameRef.current?.focus()
    })
    return () => cancelAnimationFrame(raf)
  }, [])

  // Handle window/app focus events as a safety net to restore focus
  // if Chromium loses track of activeElement (typical Electron quirk).
  useEffect(() => {
    const refocus = () => {
      // Defer the check to the next tick to let any click event process
      // and focus its respective input target first.
      setTimeout(() => {
        if (document.activeElement === document.body) {
          usernameRef.current?.focus()
        }
      }, 0)
    }
    window.addEventListener('focus', refocus)
    return () => window.removeEventListener('focus', refocus)
  }, [])

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setForm((f) => ({ ...f, [name]: value }))
    if (error) setError('')
    if (fieldErrors[name]?.length) {
      setFieldErrors((prev) => ({ ...prev, [name]: [] }))
    }
  }

  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginForm) => {
      const res = await client.post('/auth/login/', credentials)
      return res.data.data
    },
    onSuccess: (data) => {
      login(data.token, data.user ?? null)
      navigate('/', { replace: true })
    },
    onError: (err: any) => {
      const { formError, fieldErrors: apiFieldErrors } = parseApiError(
        err,
        'Unable to connect to server. Make sure the backend is running.'
      )
      setError(formError)
      setFieldErrors(apiFieldErrors)
    }
  })

  const loading = loginMutation.isPending

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return

    const trimmedUsername = form.username.trim()
    const trimmedPassword = form.password.trim()

    const errors: Record<string, string[]> = {}
    if (!trimmedUsername) errors.username = ['Username is required.']
    if (!trimmedPassword) errors.password = ['Password is required.']

    if (Object.keys(errors).length > 0) {
      setError('Username and password are required.')
      setFieldErrors(errors)
      return
    }

    setError('')
    setFieldErrors({})
    loginMutation.mutate({ username: trimmedUsername, password: trimmedPassword })
  }

  const toggleShowPassword = () => setShowPwd((v) => !v)

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
            <div className="login-err" style={{ alignItems: 'flex-start' }} role="alert">
              <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ flex: 1 }}>{error}</div>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div className="fgrp">
              <label className="flabel" htmlFor="login-username">
                Username
              </label>
              <input
                id="login-username"
                ref={usernameRef}
                className={`finput ${fieldErrors.username?.length ? 'err' : ''}`}
                name="username"
                value={form.username}
                onChange={onChange}
                placeholder="Enter your username"
                autoComplete="username"
                maxLength={100}
                disabled={loading}
              />
              {fieldErrors.username?.map((errMsg, idx) => (
                <div key={idx} className="ferr">
                  {errMsg}
                </div>
              ))}
            </div>

            <div className="fgrp">
              <label className="flabel" htmlFor="login-password">
                Password
              </label>
              <div className="pw-wrap">
                <input
                  id="login-password"
                  className={`finput ${fieldErrors.password?.length ? 'err' : ''}`}
                  type={showPwd ? 'text' : 'password'}
                  name="password"
                  value={form.password}
                  onChange={onChange}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  maxLength={128}
                  disabled={loading}
                  style={{ paddingRight: 40 }}
                />
                <button
                  type="button"
                  className="pw-eye"
                  onClick={toggleShowPassword}
                  disabled={loading}
                  tabIndex={-1}
                  aria-label={showPwd ? 'Hide password' : 'Show password'}
                  aria-pressed={showPwd}
                >
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {fieldErrors.password?.map((errMsg, idx) => (
                <div key={idx} className="ferr">
                  {errMsg}
                </div>
              ))}
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