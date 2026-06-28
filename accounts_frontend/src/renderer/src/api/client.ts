// accounts_frontend\src\renderer\src\api\client.ts
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000
})

// Attach JWT to every request
client.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem('token')
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Module-level guard to prevent firing multiple unauthorized events
// for a burst of concurrent 401s (e.g. several in-flight requests
// failing at once right after a token expires).
let isHandlingUnauthorized = false

// Custom event used to notify the app that the session is no longer valid.
// AuthContext listens for this and performs the actual logout + navigation
// through React Router, instead of this module touching window.location
// directly (which fights React Router's own state and can freeze inputs
// on the page being navigated to).
export const UNAUTHORIZED_EVENT = 'auth:unauthorized'

client.interceptors.response.use(
  (res) => {
    isHandlingUnauthorized = false
    if (
      res.data &&
      typeof res.data === 'object' &&
      !(res.data instanceof Blob) &&
      !(res.data instanceof ArrayBuffer)
    ) {
      if (!('success' in res.data)) {
        res.data.success = true
      }
    }
    return res
  },
  (err: AxiosError<any>) => {
    if (err.response?.data && typeof err.response.data === 'object') {
      if (!('success' in err.response.data)) {
        err.response.data.success = false
      }
    }

    if (err.response?.status === 401) {
      if (!isHandlingUnauthorized) {
        isHandlingUnauthorized = true
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT))

        // Allow another unauthorized event to be dispatched once the
        // current navigation/log-out cycle has had a chance to settle.
        // This avoids a permanently "stuck" guard if, for some reason,
        // no successful request ever follows (e.g. user stays on /login
        // and never makes another request).
        setTimeout(() => {
          isHandlingUnauthorized = false
        }, 1000)
      }
    }

    return Promise.reject(err)
  }
)

export default client