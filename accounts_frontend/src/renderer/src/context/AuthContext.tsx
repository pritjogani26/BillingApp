// accounts_frontend\src\renderer\src\context\AuthContext.tsx
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import client from '../api/client'

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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token') || null)
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem('user')
    if (!stored) return null
    try {
      return JSON.parse(stored) as User
    } catch {
      return null
    }
  })

  const [isValidated, setIsValidated] = useState<boolean>(() => !localStorage.getItem('token'))

  // Validate/refresh session details on token load or change using useQuery
  const { data: meData, error: meError } = useQuery({
    queryKey: ['currentUser', token],
    queryFn: async () => {
      const res = await client.get('/auth/me/')
      return res.data.data as User
    },
    enabled: !!token,
    staleTime: 1000 * 60 * 5 // Cache user profile details for 5 minutes
  })

  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
    setIsValidated(true)
    localStorage.removeItem('token')
    localStorage.removeItem('user')
  }, [])

  const login = useCallback((tokenVal: string, userData?: User | null) => {
    setToken(tokenVal)
    if (userData) {
      setUser(userData)
      localStorage.setItem('user', JSON.stringify(userData))
    }
    setIsValidated(true)
    localStorage.setItem('token', tokenVal)
  }, [])

  // Keep state and localStorage in sync with successfully validated query data
  useEffect(() => {
    if (meData) {
      setUser(meData)
      localStorage.setItem('user', JSON.stringify(meData))
      setIsValidated(true)
    }
  }, [meData])

  // Automatically sign out if backend session fails validation
  useEffect(() => {
    if (meError) {
      console.error('Session validation error, logging out:', meError)
      if (axios.isAxiosError(meError)) {
        if (meError.response?.status === 401 || meError.response?.status === 403) {
          logout()
        } else {
          setIsValidated(true)
        }
      } else {
        setIsValidated(true)
      }
    }
  }, [meError, logout])

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
