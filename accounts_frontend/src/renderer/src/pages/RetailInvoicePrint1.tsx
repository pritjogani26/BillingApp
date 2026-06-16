// src/renderer/src/pages/RetailInvoicePrint.tsx
//
// RETAIL INVOICE — Two identical half-A4 bills stacked on one A4 portrait page.
// A dashed cut line separates the two copies.
// No GST columns. No bank details. No QR code.
// Static authorised signatory image (signature asset) on right footer.

import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Download, Printer } from 'lucide-react'
import axios from 'axios'
import client from '../api/client'

const assets = import.meta.glob('../assets/*.{png,jpg,jpeg,gif,svg}', {
  eager: true,
  query: '?inline'
})

const getAssetUrl = (prefix: string): string | null => {
  const key = Object.keys(assets).find((k) => {
    const fileName = k.replace('../assets/', '').toLowerCase()
    return fileName.startsWith(prefix.toLowerCase())
  })
  if (key) {
    const mod = assets[key] as any
    return mod?.default || null
  }
  return null
}

const signatureUrl = getAssetUrl('signature')

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface InvoiceItem {
  item_id: number
  product_name: string
  hsn_code: string | null
  quantity: string
  unit_price: string
  gst_percentage: string
  taxable_amount: string
  cgst_amount: string
  sgst_amount: string
  igst_amount: string
  total_amount: string
}

interface Invoice {
  invoice_id: number
  invoice_number: string
  invoice_type: 'TAX' | 'RETAIL'
  invoice_date: string
  due_date: string | null
  financial_year: string
  customer_id: number
  customer_name: string
  customer_mobile: string | null
  customer_address: string | null
  customer_city: string | null
  customer_state: string | null
  customer_gstin: string | null
  customer_email: string | null
  contact_person: string | null
  subtotal: string
  cgst_amount: string
  sgst_amount: string
  igst_amount: string
  discount_amount: string
  round_off: string
  grand_total: string
  due_amount: string
  payment_status: string
  notes: string | null
  items: InvoiceItem[]
}

interface Company {
  company_id: number
  company_name: string
  gstin: string | null
  address: string | null
  city: string | null
  state: string | null
  pincode: string | null
  phone: string | null
  email: string | null
  bank_name: string | null
  account_number: string | null
  ifsc_code: string | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const fmt = (v: string | number | null | undefined, dp = 2) => {
  const n = parseFloat(String(v ?? 0))
  return isNaN(n) ? (0).toFixed(dp) : n.toFixed(dp)
}

const fmtDate = (d: string | null | undefined) => {
  if (!d) return '—'
  const parts = d.split('-')
  if (parts.length !== 3) return d
  return `${parts[2]}/${parts[1]}/${parts[0]}`
}

const ones = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen'
]
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function toWords(n: number): string {
  if (n === 0) return 'Zero'
  if (n < 20) return ones[n]
  if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '')
  if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + toWords(n % 100) : '')
  if (n < 100000) return toWords(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + toWords(n % 1000) : '')
  if (n < 10000000) return toWords(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + toWords(n % 100000) : '')
  return toWords(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + toWords(n % 10000000) : '')
}

function amountInWords(amount: number): string {
  const rupees = Math.floor(amount)
  const paise = Math.round((amount - rupees) * 100)
  let result = 'Rs. ' + toWords(rupees)
  if (paise) result += ' And ' + toWords(paise) + ' Paise'
  return result + ' Only'
}

const toBase64 = (url: string): Promise<string> => {
  if (url.startsWith('data:')) return Promise.resolve(url)
  return fetch(url)
    .then((r) => r.blob())
    .then(
      (blob) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onloadend = () => resolve(reader.result as string)
          reader.onerror = reject
          reader.readAsDataURL(blob)
        })
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// Print CSS
// Each bill occupies exactly half of A4 (148.5mm tall) minus margins.
// Two copies stack vertically; a dashed cut line divides them.
// ─────────────────────────────────────────────────────────────────────────────

const RETAIL_PRINT_CSS = `
@page { size: A4 portrait; margin: 6mm; }
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 100%; background: #fff; }
body {
  font-family: 'Times New Roman', Times, serif;
  font-size: 9pt;
  color: #000;
  line-height: 1.3;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

/* Wrapper for both halves */
.page-wrap {
  width: 100%;
  display: flex;
  flex-direction: column;
}

/* Cut line between the two copies */
.cut-line {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 0;
  color: #555;
  font-size: 7pt;
  font-family: Arial, Helvetica, sans-serif;
}
.cut-line::before,
.cut-line::after {
  content: '';
  flex: 1;
  border-top: 1px dashed #555;
}

/* Each bill half */
.bill-half {
  width: 100%;
  border: 1.2px solid #000;
  display: flex;
  flex-direction: column;
}

/* ── Header ── */
.r-header {
  text-align: center;
  padding: 4px 6px 2px;
  border-bottom: 1.2px solid #000;
}
.r-company-name {
  font-family: Arial, Helvetica, sans-serif;
  font-size: 20pt;
  font-weight: bold;
  letter-spacing: 1px;
  line-height: 1.1;
}
.r-company-contact {
  font-size: 8.5pt;
  line-height: 1.5;
  margin-top: 1px;
}
.r-bill-type {
  font-family: Arial, Helvetica, sans-serif;
  font-size: 9pt;
  font-weight: bold;
  letter-spacing: 2px;
  text-transform: uppercase;
  border-bottom: 1px solid #000;
  padding: 2px 6px;
}

/* ── Customer / meta row ── */
.r-info-row {
  display: flex;
  border-bottom: 1px solid #000;
}
.r-info-col {
  flex: 1;
  padding: 3px 6px;
  font-size: 8.5pt;
  line-height: 1.5;
}
.r-info-col + .r-info-col {
  border-left: 1px solid #000;
  flex: 0 0 auto;
  min-width: 160px;
}
.r-cust-name {
  font-family: Arial, Helvetica, sans-serif;
  font-weight: bold;
  font-size: 9.5pt;
  text-decoration: underline;
  display: block;
  margin-bottom: 1px;
}
.r-meta-table { width: 100%; border-collapse: collapse; }
.r-meta-table td { padding: 0 2px; font-size: 8.5pt; vertical-align: top; }
.r-meta-table td:first-child { font-weight: bold; white-space: nowrap; padding-right: 4px; min-width: 76px; }

/* ── Items table ── */
.r-items-table { width: 100%; border-collapse: collapse; }
.r-items-table th,
.r-items-table td {
  border: 1px solid #000;
  padding: 2px 3px;
  vertical-align: middle;
}
.r-items-table th:first-child,
.r-items-table td:first-child { border-left: none; }
.r-items-table th:last-child,
.r-items-table td:last-child { border-right: none; }
.r-items-table thead tr:first-child th { border-top: none; }
.r-items-table thead th {
  font-family: Arial, Helvetica, sans-serif;
  font-weight: bold;
  text-align: center;
  font-size: 7pt;
}
.r-items-table tbody td {
  font-family: Arial, Helvetica, sans-serif;
  font-size: 7.5pt;
  height: 18px;
  border-top: none;
  border-bottom: none;
}
.r-items-table tbody tr.empty-row td { height: 18px; }
.r-items-table tbody tr.filler-row td { height: auto; }
.num { text-align: right; }
.cen { text-align: center; }

/* ── Totals row ── */
.r-totals-row {
  display: flex;
  border-top: 1.2px solid #000;
  border-bottom: 1px solid #000;
}
.r-words-col {
  flex: 1;
  padding: 3px 6px;
  font-size: 8pt;
  font-weight: bold;
  display: flex;
  align-items: center;
}
.r-totals-col { width: 180px; flex-shrink: 0; }
.r-totals-col table { width: 100%; border-collapse: collapse; }
.r-totals-col table td { padding: 1px 5px; font-size: 8.5pt; border-bottom: 1px solid #d0d0d0; }
.r-totals-col table tr:last-child td { border-bottom: none; }
.t-label { font-weight: bold; }
.t-value { text-align: right; font-family: Arial, Helvetica, sans-serif; }
.grand-row td { font-weight: bold; font-size: 10pt; border-top: 1.2px solid #000; border-bottom: none !important; }

/* ── Footer ── */
.r-footer {
  display: flex;
  min-height: 46px;
}
.r-footer-col {
  flex: 1;
  padding: 4px 6px;
  font-size: 8pt;
  line-height: 1.6;
}
.r-footer-col + .r-footer-col { border-left: 1px solid #000; }
.r-col-title {
  font-family: Arial, Helvetica, sans-serif;
  font-weight: bold;
  font-size: 8.5pt;
  text-decoration: underline;
  display: block;
  margin-bottom: 2px;
}
.r-sig-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 4px 8px;
  min-width: 130px;
  flex-shrink: 0;
}
.r-for-label { font-size: 7pt; font-weight: bold; align-self: flex-start; }
.r-sig-space {
  width: 120px;
  height: 40px;
  margin: 3px auto;
  display: flex;
  align-items: center;
  justify-content: center;
}
.r-auth-label { font-size: 7pt; font-weight: bold; }
`

// ─────────────────────────────────────────────────────────────────────────────
// Single bill half component
// ─────────────────────────────────────────────────────────────────────────────

function RetailBillHalf({
  invoice,
  company,
  sigBase64
}: {
  invoice: Invoice
  company: Company
  sigBase64: string
}) {
  const subtotal = parseFloat(invoice.subtotal ?? '0')
  const discount = parseFloat(invoice.discount_amount ?? '0')
  const roundOff = parseFloat(invoice.round_off ?? '0')
  const grandTotal = parseFloat(invoice.grand_total ?? '0')

  // Keep at least 8 rows visible; fill empties below items
  const MIN_ROWS = 8
  const emptyRows = Math.max(0, MIN_ROWS - (invoice.items?.length ?? 0))

  return (
    <div className="bill-half">
      {/* 1. HEADER */}
      <div className="r-header">
        <div className="r-company-name">{(company.company_name ?? '').toUpperCase()}</div>
        <div className="r-company-contact">
          {[company.phone ? `Phone : ${company.phone}` : null, company.email ? `E-Mail : ${company.email}` : null]
            .filter(Boolean)
            .join('    ')}
        </div>
      </div>

      {/* 2. BILL TYPE STRIP */}
      <div className="r-bill-type" style={{ textAlign: 'center' }}>RETAIL INVOICE</div>

      {/* 3. CUSTOMER ↔ INVOICE META */}
      <div className="r-info-row">
        <div className="r-info-col">
          <span className="r-cust-name">M/s {(invoice.customer_name ?? '').toUpperCase()}</span>
          {invoice.customer_mobile && <>Ph : {invoice.customer_mobile}<br /></>}
          {invoice.customer_email && <>Email : {invoice.customer_email}<br /></>}
        </div>
        <div className="r-info-col">
          <table className="r-meta-table">
            <tbody>
              {(
                [
                  ['Invoice No.', <strong key="no">{invoice.invoice_number}</strong>],
                  ['Date', <strong key="dt">{fmtDate(invoice.invoice_date)}</strong>],
                  ['Due Date', fmtDate(invoice.due_date)]
                ] as [string, React.ReactNode][]
              ).map(([label, val]) => (
                <tr key={label}>
                  <td>{label}</td>
                  <td>:&nbsp;{val}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. ITEMS TABLE */}
      <table className="r-items-table">
        <thead>
          <tr>
            <th style={{ width: 24 }}>S.NO.</th>
            <th>PARTICULARS</th>
            <th style={{ width: 36 }}>QTY</th>
            <th style={{ width: 58 }}>PRICE</th>
            <th style={{ width: 64 }}>AMOUNT</th>
          </tr>
        </thead>
        <tbody>
          {invoice.items?.map((item, idx) => (
            <tr key={item.item_id}>
              <td className="cen">{idx + 1}</td>
              <td>{item.product_name}</td>
              <td className="cen">{fmt(item.quantity, 0)}</td>
              <td className="num">{fmt(item.unit_price)}</td>
              <td className="num">{fmt(item.taxable_amount)}</td>
            </tr>
          ))}
          {Array.from({ length: emptyRows }).map((_, i) => {
            const isLast = i === emptyRows - 1
            return (
              <tr className={isLast ? 'empty-row filler-row' : 'empty-row'} key={`e${i}`}>
                <td /><td /><td /><td /><td />
              </tr>
            )
          })}
          {emptyRows === 0 && (
            <tr className="empty-row filler-row">
              <td /><td /><td /><td /><td />
            </tr>
          )}
        </tbody>
      </table>

      {/* 5. TOTALS */}
      <div className="r-totals-row">
        <div className="r-words-col">{amountInWords(grandTotal)}</div>
        <div className="r-totals-col">
          <table>
            <tbody>
              <tr>
                <td className="t-label">SUB TOTAL</td>
                <td className="t-value">{fmt(subtotal)}</td>
              </tr>
              {discount > 0 && (
                <tr>
                  <td className="t-label">Discount</td>
                  <td className="t-value">- {fmt(discount)}</td>
                </tr>
              )}
              <tr>
                <td className="t-label">Round Off</td>
                <td className="t-value">{fmt(roundOff)}</td>
              </tr>
              <tr className="grand-row">
                <td className="t-label">GRAND TOTAL</td>
                <td className="t-value">{fmt(grandTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 6. FOOTER */}
      <div className="r-footer">
        <div className="r-footer-col">
          <span className="r-col-title">Terms &amp; Conditions</span>
          <ol style={{ paddingLeft: 10, margin: 0, fontSize: '7.5pt', lineHeight: 1.6 }}>
            <li>Goods once sold will not be taken back or exchanged.</li>
            <li>Payment must be made within the due date mentioned on the invoice.</li>
            <li>Interest @ 1.5% per month will be charged on all outstanding amounts remaining unpaid after the due date.</li>
            <li>All disputes arising out of this invoice shall be subject to Ahmedabad jurisdiction only.</li>
          </ol>
        </div>

        <div className="r-footer-col r-sig-col">
          <span className="r-for-label">For {(company.company_name ?? '').toUpperCase()}</span>
          <div className="r-sig-space">
            {sigBase64 && (
              <img
                src={sigBase64}
                style={{ maxHeight: 36, maxWidth: 110, objectFit: 'contain' }}
                alt="Signature"
              />
            )}
          </div>
          <span className="r-auth-label">Authorised Signatory</span>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Full document: two identical halves + cut line
// ─────────────────────────────────────────────────────────────────────────────

function RetailInvoiceDocument({
  invoice,
  company,
  sigBase64
}: {
  invoice: Invoice
  company: Company
  sigBase64: string
}) {
  return (
    <div className="page-wrap">
      <RetailBillHalf invoice={invoice} company={company} sigBase64={sigBase64} />
      <div className="cut-line">✂</div>
      <RetailBillHalf invoice={invoice} company={company} sigBase64={sigBase64} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

interface RetailInvoicePrintProps {
  invoiceId?: number | string
  onClose?: () => void
  autoDownload?: boolean
}

export default function RetailInvoicePrint({
  invoiceId: propInvoiceId,
  onClose,
  autoDownload = false
}: RetailInvoicePrintProps = {}) {
  const { invoiceId: routeInvoiceId } = useParams<{ invoiceId: string }>()
  const navigate = useNavigate()

  const resolvedInvoiceId = propInvoiceId ?? routeInvoiceId

  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [company, setCompany] = useState<Company | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [downloading, setDownloading] = useState(false)
  const printRef = useRef<HTMLDivElement>(null)
  const downloadStartedRef = useRef(false)
  const [sigBase64, setSigBase64] = useState('')
  const [assetsLoading, setAssetsLoading] = useState(true)

  useEffect(() => {
    const convertAssets = async () => {
      setAssetsLoading(true)
      if (signatureUrl) {
        try {
          setSigBase64(await toBase64(signatureUrl))
        } catch (e) {
          console.error('Signature load failed', e)
        }
      }
      setAssetsLoading(false)
    }
    convertAssets()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      if (!resolvedInvoiceId) return
      downloadStartedRef.current = false
      setLoading(true)
      try {
        const [invRes, coRes] = await Promise.all([
          client.get(`/invoices/${resolvedInvoiceId}/`, { signal: controller.signal }),
          client.get('/company/profile/', { signal: controller.signal })
        ])
        setInvoice(invRes.data.data)
        setCompany(coRes.data.data)
      } catch (e: any) {
        if (!axios.isCancel(e)) {
          setError(e?.response?.data?.message ?? 'Failed to load invoice.')
        }
      } finally {
        setLoading(false)
      }
    }
    load()
    return () => controller.abort()
  }, [resolvedInvoiceId])

  const buildPrintHTML = () => {
    const node = printRef.current
    if (!node) return ''
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>${invoice?.invoice_number ?? 'invoice'}</title>
<style>${RETAIL_PRINT_CSS}</style>
</head>
<body>${node.innerHTML}</body>
</html>`
  }

  const handleDownloadPDF = async () => {
    if (!invoice || !company || downloading) return
    setDownloading(true)
    setError('')
    try {
      const html = buildPrintHTML()
      if (window.electronAPI?.saveInvoicePDF) {
        const result = await window.electronAPI.saveInvoicePDF(html, `${invoice.invoice_number}.pdf`)
        if (result && !result.success && result.reason !== 'cancelled') {
          setError(`PDF save failed: ${result.reason}`)
          if (autoDownload) alert(`PDF save failed: ${result.reason}`)
        }
      } else {
        openPrintWindow(html)
      }
    } catch (e: any) {
      const errMsg = 'PDF generation failed: ' + (e?.message ?? '')
      setError(errMsg)
      if (autoDownload) alert(errMsg)
    } finally {
      setDownloading(false)
    }
  }

  useEffect(() => {
    if (autoDownload && !loading && invoice && company && !assetsLoading) {
      if (downloadStartedRef.current) return
      downloadStartedRef.current = true
      const run = async () => {
        try { await handleDownloadPDF() } catch (e) { console.error('Auto download failed', e) } finally { onClose?.() }
      }
      run()
    }
  }, [autoDownload, loading, invoice, company, assetsLoading])

  const openPrintWindow = (html: string) => {
    const w = window.open('', '_blank')
    if (!w) return
    w.document.open()
    w.document.write(html)
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 500)
  }

  const fmtDateLocal = (d: string | null | undefined) => {
    if (!d) return '—'
    const parts = d.split('-')
    if (parts.length !== 3) return d
    return `${parts[2]}/${parts[1]}/${parts[0]}`
  }

  // ── Render ──

  if (loading) {
    if (autoDownload) return null
    return (
      <div className="page">
        <div className="loading"><div className="spinner" /></div>
      </div>
    )
  }

  if (error && !invoice) {
    if (autoDownload) return null
    return (
      <div className="page">
        <div className="page-hdr">
          <button className="btn btn-ghost btn-sm" onClick={() => onClose ? onClose() : navigate(-1)}>
            <ArrowLeft size={15} /> Back
          </button>
        </div>
        <div className="empty">
          <div className="empty-text">Could not load invoice</div>
          <div className="empty-sub">{error}</div>
        </div>
      </div>
    )
  }

  if (!invoice || !company) return null

  return (
    <div
      className="page"
      style={autoDownload ? { display: 'none' } : { maxWidth: 860, margin: '0 auto' }}
    >
      {/* Toolbar */}
      <div className="page-hdr">
        <div>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => onClose ? onClose() : navigate(-1)}
            style={{ marginBottom: 8 }}
          >
            <ArrowLeft size={15} /> Back
          </button>
          <div className="page-title">
            Retail Invoice&nbsp;
            <span style={{ color: 'var(--primary)' }}>#{invoice.invoice_number}</span>
          </div>
          <div className="page-sub" style={{ marginTop: 4 }}>
            {fmtDateLocal(invoice.invoice_date)}
            &nbsp;·&nbsp;
            {invoice.customer_name}
            &nbsp;·&nbsp;
            <span
              style={{
                color:
                  invoice.payment_status === 'PAID'
                    ? 'var(--success)'
                    : invoice.payment_status === 'PARTIAL'
                      ? 'var(--warning)'
                      : 'var(--danger)'
              }}
            >
              {invoice.payment_status}
            </span>
          </div>
        </div>
        <div className="page-hdr-actions">
          <button
            className="btn btn-outline btn-sm"
            onClick={() => openPrintWindow(buildPrintHTML())}
          >
            <Printer size={14} /> Print
          </button>
          <button className="btn btn-primary" onClick={handleDownloadPDF} disabled={downloading}>
            {downloading ? (
              <><div className="spinner spinner-sm" style={{ borderTopColor: '#fff' }} /> Generating…</>
            ) : (
              <><Download size={14} /> Download PDF</>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="login-err" style={{ marginBottom: 16 }}>{error}</div>
      )}

      {/* Preview — strip @page rule for screen rendering */}
      <style>{RETAIL_PRINT_CSS.replace(/@page[^}]+}/g, '')}</style>

      <div
        style={{
          background: '#fff',
          boxShadow: 'var(--sh-lg)',
          borderRadius: 4,
          padding: '8mm',
          marginBottom: 32,
          overflowX: 'auto'
        }}
      >
        <div ref={printRef}>
          <RetailInvoiceDocument
            invoice={invoice}
            company={company}
            sigBase64={sigBase64}
          />
        </div>
      </div>
    </div>
  )
}