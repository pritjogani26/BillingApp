// src/renderer/src/pages/InvoicePrint.tsx
//
// Renders the invoice exactly like invoice_pdf.html (monochrome, A4 layout)
// and generates a PDF by printing the hidden #invoice-print-area div via
// Electron's webContents.printToPDF IPC call — zero external dependencies.

import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Download, Printer } from 'lucide-react'
import client from '../api/client'
import qrCodeUrl from '../assets/qr_code.jpeg'
import signatureUrl from '../assets/signature.jpg'

// ─────────────────────────────────────────────────────────────────────────────
// Types  (aligned with InvoiceSerializer + InvoiceItemSerializer)
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
  return isNaN(n) ? '0.00' : n.toFixed(dp)
}

const fmtDate = (d: string | null | undefined) => {
  if (!d) return '—'
  const parts = d.split('-')
  if (parts.length !== 3) return d
  return `${parts[2]}/${parts[1]}/${parts[0]}`
}

// Indian number-to-words
const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven',
  'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen',
  'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty',
  'Sixty', 'Seventy', 'Eighty', 'Ninety']

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

// ─────────────────────────────────────────────────────────────────────────────
// CSS injected into the print window — mirrors invoice_pdf.html exactly
// ─────────────────────────────────────────────────────────────────────────────

const PRINT_CSS = `
@page { size: A4 portrait; margin: 8mm; }
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 100%; background: #fff; }
body {
  font-family: 'Courier New', Courier, monospace;
  font-size: 8.5pt;
  color: #000;
  line-height: 1.35;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.invoice-wrap {
  width: 100%;
  border: 1.5px solid #000;
  min-height: 270mm;
  display: flex;
  flex-direction: column;
}
.title-bar {
  text-align: center;
  padding: 5px 6px 3px;
  border-bottom: 1.5px solid #000;
}
.bill-type { font-size: 8pt; font-weight: bold; letter-spacing: 2px; text-transform: uppercase; }
.company-name { font-size: 17pt; font-weight: bold; letter-spacing: 1px; line-height: 1.15; margin: 1px 0; }
.company-addr { font-size: 7.5pt; line-height: 1.4; }
.gstin-strip {
  text-align: center; font-size: 8pt; font-weight: bold;
  padding: 3px 6px; background: #e8e8e8;
  border-bottom: 1px solid #000; letter-spacing: 1px;
}
.info-row { display: flex; border-bottom: 1px solid #000; }
.info-col { flex: 1; padding: 4px 7px; font-size: 8pt; line-height: 1.5; }
.info-col + .info-col { border-left: 1px solid #000; }
.block-title { font-weight: bold; font-size: 8.5pt; text-decoration: underline; margin-bottom: 2px; display: block; }
.meta-table { width: 100%; border-collapse: collapse; }
.meta-table td { padding: 0 2px; font-size: 8pt; vertical-align: top; }
.meta-table td:first-child { font-weight: bold; white-space: nowrap; padding-right: 4px; min-width: 90px; }
.items-table { width: 100%; border-collapse: collapse; flex: 1; }
.items-table th, .items-table td { border: 1px solid #000; padding: 3px 5px; vertical-align: middle; }
.items-table th:first-child, .items-table td:first-child { border-left: none; }
.items-table th:last-child, .items-table td:last-child { border-right: none; }
.items-table thead tr:first-child th { border-top: none; }
.items-table thead th { background: #d0d0d0; font-weight: bold; text-align: center; font-size: 8pt; }
.items-table tbody td { font-size: 8pt; height: 28px; }
.items-table tbody tr.empty-row td { height: 28px; }
.items-table tbody tr.filler-row td { height: auto; }
.num { text-align: right; }
.cen { text-align: center; }
.totals-row { display: flex; border-top: 1.5px solid #000; border-bottom: 1px solid #000; min-height: 62px; }
.gst-note-col { flex: 1; padding: 5px 7px; font-size: 7.5pt; border-right: 1px solid #000; display: flex; align-items: flex-end; }
.totals-col { width: 200px; }
.totals-col table { width: 100%; border-collapse: collapse; }
.totals-col table td { padding: 2px 6px; font-size: 8pt; border-bottom: 1px solid #d0d0d0; }
.totals-col table tr:last-child td { border-bottom: none; }
.t-label { font-weight: bold; }
.t-value { text-align: right; font-family: 'Courier New', monospace; }
.grand-row td { background: #d0d0d0; font-weight: bold; font-size: 9pt; border-top: 1.5px solid #000; border-bottom: none; }
.amount-words { padding: 4px 7px; font-size: 7.5pt; font-weight: bold; border-bottom: 1px solid #000; }
.bottom-strip { display: flex; flex: 1; min-height: 80px; }
.bottom-col { padding: 5px 7px; font-size: 7.5pt; line-height: 1.6; flex: 1; }
.bottom-col + .bottom-col { border-left: 1px solid #000; }
.col-title { font-weight: bold; font-size: 8pt; text-decoration: underline; margin-bottom: 3px; display: block; }
.b-label { font-weight: bold; display: inline-block; min-width: 82px; }
.sig-col {
  display: flex; flex-direction: column; justify-content: space-between;
  align-items: flex-end; text-align: center;
  padding: 5px 10px; min-width: 160px; flex-shrink: 0;
}
.for-label { font-size: 7.5pt; font-weight: bold; align-self: flex-end; }
.sig-space { width: 120px; height: 40px; border-bottom: 1px solid #000; margin: 6px auto 4px; }
.auth-label { font-size: 7.5pt; font-weight: bold; text-align: center; width: 100%; }
`

const toBase64 = (url: string): Promise<string> => {
  return fetch(url)
    .then((response) => response.blob())
    .then((blob) => new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    }))
}

// ─────────────────────────────────────────────────────────────────────────────
// InvoiceDocument — mirrors invoice_pdf.html structure with CSS classes
// ─────────────────────────────────────────────────────────────────────────────

function InvoiceDocument({
  invoice,
  company,
  qrCodeBase64,
  sigBase64
}: {
  invoice: Invoice
  company: Company
  qrCodeBase64: string
  sigBase64: string
}) {
  const isTax = invoice.invoice_type === 'TAX'
  const igstTotal = parseFloat(invoice.igst_amount ?? '0')
  const isInterstate = isTax && igstTotal > 0
  const gstPct = invoice.items?.[0] ? parseFloat(invoice.items[0].gst_percentage) : 0
  const halfPct = gstPct / 2

  const subtotal = parseFloat(invoice.subtotal ?? '0')
  const cgst = parseFloat(invoice.cgst_amount ?? '0')
  const sgst = parseFloat(invoice.sgst_amount ?? '0')
  const igst = parseFloat(invoice.igst_amount ?? '0')
  const discount = parseFloat(invoice.discount_amount ?? '0')
  const roundOff = parseFloat(invoice.round_off ?? '0')
  const grandTotal = parseFloat(invoice.grand_total ?? '0')

  const emptyRows = Math.max(0, 12 - (invoice.items?.length ?? 0))
  const invoiceTypeLabel = isTax ? 'TAX INVOICE' : 'RETAIL INVOICE'

  let gstNote = ''
  if (isTax && isInterstate) {
    gstNote = `GST ${subtotal.toFixed(2)} × ${gstPct}% = ${igst.toFixed(2)} IGST  |  THANKS CUSTOMER`
  } else if (isTax) {
    gstNote = `GST ${subtotal.toFixed(2)} × ${halfPct}+${halfPct}% = ${cgst.toFixed(2)} CGST + ${sgst.toFixed(2)} SGST  |  THANKS CUSTOMER`
  } else {
    gstNote = 'NON-GST INVOICE  |  THANKS CUSTOMER'
  }

  return (
    <div className="invoice-wrap">

      {/* 1. TITLE BAR */}
      <div className="title-bar">
        <div className="bill-type">{invoiceTypeLabel}</div>
        <div className="company-name">{(company.company_name ?? '').toUpperCase()}</div>
        <div className="company-addr">
          {[company.address, company.city].filter(Boolean).join(', ')}
          {company.pincode ? ` – ${company.pincode}` : ''}
          <br />
          Phone&nbsp;:&nbsp;{company.phone || '—'}
          &nbsp;&nbsp;|&nbsp;&nbsp;
          E-Mail&nbsp;:&nbsp;{company.email || '—'}
        </div>
      </div>

      {/* 2. GSTIN STRIP */}
      <div className="gstin-strip">
        GSTIN&nbsp;:&nbsp;{company.gstin || 'N/A'}
      </div>

      {/* 3. CUSTOMER ↔ INVOICE META */}
      <div className="info-row">
        <div className="info-col">
          <span className="block-title">M/s {(invoice.customer_name ?? '').toUpperCase()}</span>
          {invoice.customer_address}
          {invoice.customer_city ? `, ${invoice.customer_city}` : ''}
          {invoice.customer_state ? `\u00a0\u00a0State\u00a0:\u00a0${invoice.customer_state}` : ''}
          <br />
          PH.NO.&nbsp;:&nbsp;{invoice.customer_mobile || '—'}
          <br />
          {invoice.customer_gstin && <>GSTIN&nbsp;:&nbsp;{invoice.customer_gstin}</>}
        </div>

        <div className="info-col">
          <table className="meta-table">
            <tbody>
              {([
                ['Invoice No.', <strong key="no">{invoice.invoice_number}</strong>],
                ['Date', fmtDate(invoice.invoice_date)],
                ['Order No.', ''],
                ['L.R. No.', ''],
                ['Cases', '0'],
                ['Transport', ''],
                ['Due Date', fmtDate(invoice.due_date)],
              ] as [string, React.ReactNode][]).map(([label, val]) => (
                <tr key={label}>
                  <td>{label}</td>
                  <td>:&nbsp;{val}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. LINE-ITEMS TABLE */}
      <table className="items-table">
        <thead>
          <tr>
            <th style={{ width: 28 }}>SN.</th>
            <th>PRODUCT NAME</th>
            <th style={{ width: 70 }}>HSN CODE</th>
            <th style={{ width: 42 }}>QTY</th>
            <th style={{ width: 60 }}>RATE</th>
            {isTax && (
              isInterstate
                ? <th style={{ width: 48 }}>IGST&nbsp;%</th>
                : <>
                  <th style={{ width: 44 }}>SGST&nbsp;%</th>
                  <th style={{ width: 44 }}>CGST&nbsp;%</th>
                </>
            )}
            <th style={{ width: 70 }}>AMOUNT</th>
          </tr>
        </thead>
        <tbody>
          {invoice.items?.map((item, idx) => (
            <tr key={item.item_id}>
              <td className="cen">{idx + 1}</td>
              <td>{item.product_name}</td>
              <td className="cen">{item.hsn_code || ''}</td>
              <td className="cen">{fmt(item.quantity, 2)}</td>
              <td className="num">{fmt(item.unit_price)}</td>
              {isTax && (
                isInterstate
                  ? <td className="cen">{fmt(item.gst_percentage, 2)}</td>
                  : <>
                    <td className="cen">{halfPct.toFixed(2)}</td>
                    <td className="cen">{halfPct.toFixed(2)}</td>
                  </>
              )}
              <td className="num">{fmt(item.total_amount)}</td>
            </tr>
          ))}
          {Array.from({ length: emptyRows }).map((_, i) => {
            const isLast = i === emptyRows - 1
            return (
              <tr className={isLast ? "empty-row filler-row" : "empty-row"} key={`e${i}`}>
                <td /><td /><td /><td /><td />
                {isTax && (isInterstate ? <td /> : <><td /><td /></>)}
                <td />
              </tr>
            )
          })}
          {emptyRows === 0 && (
            <tr className="empty-row filler-row">
              <td /><td /><td /><td /><td />
              {isTax && (isInterstate ? <td /> : <><td /><td /></>)}
              <td />
            </tr>
          )}
        </tbody>
      </table>

      {/* 5. GST NOTE + TOTALS */}
      <div className="totals-row">
        <div className="gst-note-col">{gstNote}</div>
        <div className="totals-col">
          <table>
            <tbody>
              <tr>
                <td className="t-label">SUB TOTAL</td>
                <td className="t-value">{subtotal.toFixed(2)}</td>
              </tr>
              {isTax && (
                isInterstate
                  ? <tr>
                    <td className="t-label">IGST {gstPct}%</td>
                    <td className="t-value">{igst.toFixed(2)}</td>
                  </tr>
                  : <>
                    <tr>
                      <td className="t-label">SGST {halfPct}%</td>
                      <td className="t-value">{sgst.toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td className="t-label">CGST {halfPct}%</td>
                      <td className="t-value">{cgst.toFixed(2)}</td>
                    </tr>
                  </>
              )}
              {discount > 0 && (
                <tr>
                  <td className="t-label">Discount</td>
                  <td className="t-value">- {discount.toFixed(2)}</td>
                </tr>
              )}
              <tr>
                <td className="t-label">Round Off</td>
                <td className="t-value">{roundOff.toFixed(2)}</td>
              </tr>
              <tr className="grand-row">
                <td className="t-label">GRAND TOTAL</td>
                <td className="t-value">{grandTotal.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 6. AMOUNT IN WORDS */}
      <div className="amount-words">{amountInWords(grandTotal)}</div>

      {/* 7. BOTTOM STRIP */}
      <div className="bottom-strip">

        <div className="bottom-col" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <span className="col-title">Bank Details</span>
            <span className="b-label">Bank Name</span>:&nbsp;{company.bank_name || '—'}<br />
            <span className="b-label">A/C No.</span>:&nbsp;{company.account_number || '—'}<br />
            <span className="b-label">IFSC Code</span>:&nbsp;{company.ifsc_code || '—'}<br />
            <span className="b-label">Branch</span>:&nbsp;{company.city || '—'}<br />
          </div>
          {qrCodeBase64 && (
            <div style={{ width: 115, height: 115, border: '1.2px solid #000', padding: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <img src={qrCodeBase64} style={{ width: '100%', height: '100%', objectFit: 'contain' }} alt="QR Code" />
            </div>
          )}
        </div>

        <div className="bottom-col">
          <span className="col-title">Terms &amp; Conditions</span>
          <ol style={{ paddingLeft: 12, margin: 0, fontSize: '7pt', lineHeight: 1.7 }}>
            <li>Goods once sold will not be taken back or exchanged.</li>
            <li>Interest @ 1.5% per month will be charged on overdue payments.</li>
            <li>Subject to Ahmedabad jurisdiction only.</li>
          </ol>
        </div>

        <div className="bottom-col sig-col">
          <span className="for-label">For {(company.company_name ?? '').toUpperCase()}</span>
          <div className="sig-space" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid #000' }}>
            {sigBase64 && (
              <img src={sigBase64} style={{ maxHeight: 38, maxWidth: 120, objectFit: 'contain' }} alt="Signature" />
            )}
          </div>
          <span className="auth-label">Authorised Signatory</span>
        </div>

      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

interface InvoicePrintProps {
  invoiceId?: number | string
  onClose?: () => void
  autoDownload?: boolean
}

export default function InvoicePrint({
  invoiceId: propInvoiceId,
  onClose,
  autoDownload = false
}: InvoicePrintProps = {}) {
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
  const [qrCodeBase64, setQrCodeBase64] = useState('')
  const [sigBase64, setSigBase64] = useState('')

  useEffect(() => {
    // Convert asset URLs to base64 data URLs for off-screen rendering stability
    const convertAssets = async () => {
      try {
        const qrBase = await toBase64(qrCodeUrl)
        setQrCodeBase64(qrBase)
      } catch (e) {
        console.error('Failed to load QR code asset:', e)
      }
      try {
        const sigBase = await toBase64(signatureUrl)
        setSigBase64(sigBase)
      } catch (e) {
        console.error('Failed to load signature asset:', e)
      }
    }
    convertAssets()
  }, [])

  useEffect(() => {
    const load = async () => {
      if (!resolvedInvoiceId) return
      downloadStartedRef.current = false
      setLoading(true)
      try {
        const [invRes, coRes] = await Promise.all([
          client.get(`/invoices/${resolvedInvoiceId}/`),
          client.get('/company/profile/'),
        ])
        setInvoice(invRes.data.data)
        setCompany(coRes.data.data)
      } catch (e: any) {
        setError(e?.response?.data?.message ?? 'Failed to load invoice.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [resolvedInvoiceId])

  // Build a self-contained HTML string from the rendered React tree
  const buildPrintHTML = () => {
    const node = printRef.current
    if (!node) return ''
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>${invoice?.invoice_number ?? 'invoice'}</title>
<style>${PRINT_CSS}</style>
</head>
<body>${node.innerHTML}</body>
</html>`
  }

  // Download PDF via Electron IPC → main process printToPDF
  const handleDownloadPDF = async () => {
    if (!invoice || !company || downloading) return
    setDownloading(true)
    setError('')
    try {
      const html = buildPrintHTML()

      if (window.electronAPI?.saveInvoicePDF) {
        // Electron: main process opens headless window, prints to PDF, saves file
        const result = await window.electronAPI.saveInvoicePDF(html, `${invoice.invoice_number}.pdf`)
        if (result && !result.success && result.reason !== 'cancelled') {
          setError(`PDF save failed: ${result.reason}`)
          if (autoDownload) {
            alert(`PDF save failed: ${result.reason}`)
          }
        }
      } else {
        // Dev browser fallback — open print dialog
        openPrintWindow(html)
      }
    } catch (e: any) {
      const errMsg = 'PDF generation failed: ' + (e?.message ?? '')
      setError(errMsg)
      if (autoDownload) {
        alert(errMsg)
      }
    } finally {
      setDownloading(false)
    }
  }

  // Auto-download logic if autoDownload is set to true
  useEffect(() => {
    if (autoDownload && !loading && invoice && company && qrCodeBase64 && sigBase64) {
      if (downloadStartedRef.current) return
      downloadStartedRef.current = true

      const runAutoDownload = async () => {
        try {
          await handleDownloadPDF()
        } catch (e) {
          console.error('Auto download failed:', e)
        } finally {
          onClose?.()
        }
      }
      runAutoDownload()
    }
  }, [autoDownload, loading, invoice, company, qrCodeBase64, sigBase64])

  const openPrintWindow = (html: string) => {
    const w = window.open('', '_blank')
    if (!w) return
    w.document.open()
    w.document.write(html)
    w.document.close()
    w.focus()
    setTimeout(() => {
      w.print()
    }, 500)
  }

  // ── Render ──────────────────────────────────────────────────────────────
  if (loading) {
    if (autoDownload) return null
    return (
      <div className="page">
        <div className="loading"><div className="spinner" /></div>
      </div>
    )
  }

  if (error && !invoice) {
    if (autoDownload) {
      return null
    }
    return (
      <div className="page">
        <div className="page-hdr">
          <button className="btn btn-ghost btn-sm" onClick={() => (onClose ? onClose() : navigate(-1))}>
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
            onClick={() => (onClose ? onClose() : navigate(-1))}
            style={{ marginBottom: 8 }}
          >
            <ArrowLeft size={15} /> Back
          </button>
          <div className="page-title">
            {invoice.invoice_type === 'TAX' ? 'Tax Invoice' : 'Retail Invoice'}
            &nbsp;
            <span style={{ color: 'var(--primary)' }}>#{invoice.invoice_number}</span>
          </div>
          <div className="page-sub" style={{ marginTop: 4 }}>
            {fmtDate(invoice.invoice_date)}
            &nbsp;·&nbsp;
            {invoice.customer_name}
            &nbsp;·&nbsp;
            <span style={{
              color: invoice.payment_status === 'PAID'
                ? 'var(--success)'
                : invoice.payment_status === 'PARTIAL'
                  ? 'var(--warning)'
                  : 'var(--danger)'
            }}>
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
          <button
            className="btn btn-primary"
            onClick={handleDownloadPDF}
            disabled={downloading}
          >
            {downloading
              ? <><div className="spinner spinner-sm" style={{ borderTopColor: '#fff' }} /> Generating…</>
              : <><Download size={14} /> Download PDF</>
            }
          </button>
        </div>
      </div>

      {error && (
        <div className="login-err" style={{ marginBottom: 16 }}>{error}</div>
      )}

      {/* Invoice preview — rendered with PRINT_CSS classes applied */}
      <style>{PRINT_CSS.replace(/@page[^}]+}/g, '')}</style>

      <div style={{
        background: '#fff',
        boxShadow: 'var(--sh-lg)',
        borderRadius: 4,
        padding: '8mm',
        marginBottom: 32,
        overflowX: 'auto',
      }}>
        {/* printRef captures the HTML that goes into the PDF */}
        <div ref={printRef}>
          <InvoiceDocument
            invoice={invoice}
            company={company}
            qrCodeBase64={qrCodeBase64}
            sigBase64={sigBase64}
          />
        </div>
      </div>

    </div>
  )
}