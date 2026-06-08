/// <reference types="vite/client" />

interface Window {
  electronAPI?: {
    minimize: () => void
    maximize: () => void
    close: () => void
    saveInvoicePDF?: (
      htmlContent: string,
      filename: string
    ) => Promise<{ success: boolean; filePath?: string; reason?: string }>
  }
  electron?: {
    process: {
      versions: {
        electron: string
        chrome: string
        node: string
      }
    }
  }
}
