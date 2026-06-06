import React, { createContext, useContext, useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
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
  login: (tokenVal: string, userData: User) => void
  logout: () => void
  isAuthenticated: boolean
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

  // Keep state and localStorage in sync with successfully validated query data
  useEffect(() => {
    if (meData) {
      setUser(meData)
      localStorage.setItem('user', JSON.stringify(meData))
    }
  }, [meData])

  // Automatically sign out if backend session fails validation
  useEffect(() => {
    if (meError) {
      console.error('Session validation error, logging out:', meError)
      logout()
    }
  }, [meError])

  const login = (tokenVal: string, userData: User) => {
    setToken(tokenVal)
    setUser(userData)
    localStorage.setItem('token', tokenVal)
    localStorage.setItem('user', JSON.stringify(userData))
  }

  const logout = () => {
    setToken(null)
    setUser(null)
    localStorage.removeItem('token')
    localStorage.removeItem('user')
  }

  return (
    <AuthContext.Provider value={{ token, user, login, logout, isAuthenticated: !!token }}>
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
