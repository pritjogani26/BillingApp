// accounts_frontend\src\renderer\src\api\client.ts
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
})

// Attach JWT to every request
client.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem('token')
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

let isRedirecting = false

// Auto-logout on 401 & inject success status
client.interceptors.response.use(
  (res) => {
    isRedirecting = false
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
      if (!isRedirecting) {
        isRedirecting = true
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        window.location.hash = '/login'
      }
    }
    return Promise.reject(err)
  }
)

export default client