// accounts_frontend\src\renderer\src\context\AuthContext.tsx
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import client, { UNAUTHORIZED_EVENT } from '../api/client'

export interface User {
  user_id: number
  username: string
  full_name: string
  role: string
  company_id?: number
  company_name?: string
  gstin?: string | null
  created_at?: string
  updated_at?: string | null
}

export interface AuthContextType {
  token: string | null
  user: User | null
  login: (tokenVal: string, userData?: User | null) => void
  logout: () => void
  isAuthenticated: boolean
  isValidated: boolean
}

const AuthContext = createContext<AuthContextType | null>(null)

const CURRENT_USER_QUERY_KEY = ['currentUser'] as const

function readStoredUser(): User | null {
  const stored = localStorage.getItem('user')
  if (!stored) return null
  try {
    return JSON.parse(stored) as User
  } catch {
    // Corrupted localStorage value — don't let it crash the app.
    localStorage.removeItem('user')
    return null
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()

  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token') || null)
  const [user, setUser] = useState<User | null>(readStoredUser)
  const [isValidated, setIsValidated] = useState<boolean>(() => !localStorage.getItem('token'))

  // Validate/refresh session details on token load or change.
  const { data: meData, error: meError } = useQuery({
    queryKey: [...CURRENT_USER_QUERY_KEY, token],
    queryFn: async () => {
      const res = await client.get('/auth/me/')
      return res.data.data as User
    },
    enabled: !!token,
    staleTime: 1000 * 60 * 5, // Cache user profile details for 5 minutes
    retry: false // Don't retry auth checks — a 401 should fail fast and log out
  })

  const logout = useCallback(() => {
    // Force-blur whatever currently has focus (e.g. the logout button)
    // before the tree unmounts. This prevents Electron/Chromium from
    // getting stuck with a "ghost" focus reference to a detached node,
    // which otherwise blocks keyboard input on the page until a
    // window blur/focus cycle (e.g. switching tabs) forces it to reset.
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }

    setToken(null)
    setUser(null)
    setIsValidated(true)
    localStorage.removeItem('token')
    localStorage.removeItem('user')

    // Drop any cached/error state for the user-profile query so a stale
    // 401 from a previous session can't linger and re-trigger logic
    // (or get briefly shown) after the user lands back on /login.
    queryClient.removeQueries({ queryKey: CURRENT_USER_QUERY_KEY })
  }, [queryClient])

  const login = useCallback((tokenVal: string, userData?: User | null) => {
    localStorage.setItem('token', tokenVal)
    setToken(tokenVal)
    if (userData) {
      localStorage.setItem('user', JSON.stringify(userData))
      setUser(userData)
    }
    setIsValidated(true)
  }, [])

  // Keep state and localStorage in sync with successfully validated query data.
  useEffect(() => {
    if (meData) {
      setUser(meData)
      localStorage.setItem('user', JSON.stringify(meData))
      setIsValidated(true)
    }
  }, [meData])

  // Automatically sign out if backend session fails validation.
  useEffect(() => {
    if (!meError) return

    console.error('Session validation error:', meError)

    if (axios.isAxiosError(meError)) {
      const status = meError.response?.status
      if (status === 401 || status === 403) {
        logout()
        return
      }
    }

    // Network error or unrelated server error — don't log the user out,
    // just stop blocking the UI on validation.
    setIsValidated(true)
  }, [meError, logout])

  // Listen for the global "unauthorized" signal dispatched by the axios
  // client whenever any request gets a 401. This is the single place
  // that reacts to session expiry and triggers logout — navigation then
  // happens naturally through React Router via route guards reacting to
  // `isAuthenticated` becoming false, rather than a raw location write.
  useEffect(() => {
    const handleUnauthorized = () => logout()
    window.addEventListener(UNAUTHORIZED_EVENT, handleUnauthorized)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, handleUnauthorized)
  }, [logout])

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        login,
        logout,
        isAuthenticated: !!token && isValidated,
        isValidated
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}