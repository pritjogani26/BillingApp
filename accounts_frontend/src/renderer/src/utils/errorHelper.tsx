import React from 'react'

export interface ParsedErrors {
  formError: string | React.ReactNode
  fieldErrors: Record<string, string[]>
}

export function parseApiError(err: any, fallbackMessage: string): ParsedErrors {
  if (!err?.response?.data) {
    return {
      formError: err?.message || fallbackMessage,
      fieldErrors: {}
    }
  }

  const resData = err.response.data
  const mainMessage = resData.message || fallbackMessage
  const fieldErrors: Record<string, string[]> = {}

  if (resData.data && typeof resData.data === 'object' && !Array.isArray(resData.data)) {
    Object.entries(resData.data).forEach(([key, val]) => {
      if (Array.isArray(val)) {
        fieldErrors[key] = val.map((v) => String(v))
      } else if (typeof val === 'string') {
        fieldErrors[key] = [val]
      }
    })
  }

  // Generate formError formatting validation list if available
  let formError: string | React.ReactNode = mainMessage
  const keys = Object.keys(fieldErrors)
  if (keys.length > 0) {
    formError = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start', textAlign: 'left' }}>
        <div style={{ fontWeight: 600 }}>{mainMessage}</div>
        <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '12.5px', listStyleType: 'disc' }}>
          {keys.map((field) => {
            const fieldLabel = field.charAt(0).toUpperCase() + field.slice(1).replace('_', ' ')
            return fieldErrors[field].map((msg, idx) => (
              <li key={`${field}-${idx}`}>
                <strong>{fieldLabel}:</strong> {msg}
              </li>
            ))
          })}
        </ul>
      </div>
    )
  }

  return {
    formError,
    fieldErrors
  }
}
