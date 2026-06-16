// src/renderer/src/pages/TaxInvoicePrint.tsx
//
// TAX INVOICE — A4 portrait, full layout with GST columns, bank details, QR, signature.

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

const qrCodeUrl = getAssetUrl('qr_code')
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

const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen']
const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety']

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

function formatCompanyAddress(address: string | null, city: string | null, pincode: string | null): string[] {
  const parts = (address ?? '').split(',').map((p) => p.trim()).filter(Boolean)
  const lines: string[] = []
  if (parts.length <= 2) {
    if (parts.length > 0) lines.push(parts.join(', ') + ',')
  } else if (parts.length === 3) {
    lines.push(parts[0] + ', ' + parts[1] + ',')
    lines.push(parts[2] + ',')
  } else {
    lines.push(parts[0] + ', ' + parts[1] + ',')
    lines.push(parts[2] + ',')
    lines.push(parts.slice(3).join(', ') + ',')
  }
  const cityPin = [city, pincode].filter(Boolean).join('-')
  if (cityPin) {
    if (lines.length > 0) {
      lines[lines.length - 1] = lines[lines.length - 1] + ' ' + cityPin
    } else {
      lines.push(cityPin)
    }
  }
  return lines
}

const toBase64 = (url: string): Promise<string> => {
  if (url.startsWith('data:')) return Promise.resolve(url)
  return fetch(url)
    .then((r) => r.blob())
    .then((blob) => new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    }))
}

// ─────────────────────────────────────────────────────────────────────────────
// Print CSS — A4 portrait
// ─────────────────────────────────────────────────────────────────────────────

const TAX_PRINT_CSS = `
@page { size: A4 portrait; margin: 8mm; }
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 100%; background: #fff; }
body {
  font-family: 'Times New Roman', Times, serif;
  font-size: 10.5pt;
  color: #000;
  line-height: 1.35;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.invoice-wrap {
  width: calc(100% - 2px);
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
.bill-type { font-family: Arial, Helvetica, sans-serif; font-size: 12pt; font-weight: bold; letter-spacing: 2px; text-transform: uppercase; }
.company-name { font-family: Arial, Helvetica, sans-serif; font-size: 26pt; font-weight: bold; letter-spacing: 1px; line-height: 1.15; margin: 1px 0; }
.company-addr { font-size: 11pt; line-height: 1.5; }
.gstin-strip {
  font-family: Arial, Helvetica, sans-serif;
  text-align: center; font-size: 10pt; font-weight: bold;
  padding: 3px 6px;
  border-bottom: 1px solid #000; letter-spacing: 1px;
}
.info-row { display: flex; border-bottom: 1px solid #000; }
.info-col { flex: 1; padding: 4px 7px; font-size: 10pt; line-height: 1.5; }
.info-col + .info-col { border-left: 1px solid #000; }
.block-title { font-family: Arial, Helvetica, sans-serif; font-weight: bold; font-size: 11pt; text-decoration: underline; margin-bottom: 2px; display: block; }
.meta-table { width: 100%; border-collapse: collapse; }
.meta-table td { padding: 0 2px; font-size: 10pt; vertical-align: top; }
.meta-table td:first-child { font-weight: bold; white-space: nowrap; padding-right: 4px; min-width: 90px; }
.items-table { width: 100%; border-collapse: collapse; flex: 1; }
.items-table th, .items-table td { border: 1px solid #000; padding: 2px 3px; vertical-align: middle; }
.items-table th:first-child, .items-table td:first-child { border-left: none; }
.items-table th:last-child, .items-table td:last-child { border-right: none; }
.items-table thead tr:first-child th { border-top: none; }
.items-table thead th { font-family: Arial, Helvetica, sans-serif; font-weight: bold; text-align: center; font-size: 7pt; }
.items-table tbody td { font-family: Arial, Helvetica, sans-serif; font-size: 8pt; height: 24px; border-top: none; border-bottom: none; }
.items-table tbody tr.empty-row td { height: 24px; }
.items-table tbody tr.filler-row td { height: auto; }
.num { text-align: right; }
.cen { text-align: center; }
.totals-row { display: flex; border-top: 1.5px solid #000; border-bottom: 1px solid #000; min-height: 62px; }
.gst-note-col { flex: 1; padding: 5px 7px; font-size: 9.5pt; border-right: 1px solid #000; display: flex; align-items: flex-end; }
.totals-col { width: 200px; }
.totals-col table { width: 100%; border-collapse: collapse; }
.totals-col table td { padding: 2px 6px; font-size: 10pt; border-bottom: 1px solid #d0d0d0; }
.totals-col table tr:last-child td { border-bottom: none; }
.t-label { font-weight: bold; }
.t-value { text-align: right; font-family: Arial, Helvetica, sans-serif; }
.grand-row td { font-weight: bold; font-size: 11pt; border-top: 1.5px solid #000; border-bottom: none; }
.amount-words { padding: 4px 7px; font-size: 9.5pt; font-weight: bold; border-bottom: 1px solid #000; }
.bottom-strip { display: flex; flex: 1; min-height: 80px; }
.bottom-col { padding: 5px 7px; font-size: 9.5pt; line-height: 1.6; flex: 1; }
.bottom-col + .bottom-col { border-left: 1px solid #000; }
.col-title { font-family: Arial, Helvetica, sans-serif; font-weight: bold; font-size: 10pt; text-decoration: underline; margin-bottom: 3px; display: block; }
.b-label { font-weight: bold; display: inline-block; min-width: 82px; }
.sig-col {
  display: flex; flex-direction: column; justify-content: center;
  align-items: center; text-align: center;
  padding: 5px 10px; min-width: 160px; flex-shrink: 0;
}
.for-label { font-size: 7.5pt; font-weight: bold; align-self: flex-start; }
.sig-space { width: 180px; height: 70px; margin: 4px auto; display: flex; align-items: center; justify-content: center; }
.auth-label { font-size: 7.5pt; font-weight: bold; text-align: center; width: 100%; }
`

// ─────────────────────────────────────────────────────────────────────────────
// TaxInvoiceDocument
// ─────────────────────────────────────────────────────────────────────────────

function TaxInvoiceDocument({
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
  const igstTotal = parseFloat(invoice.igst_amount ?? '0')
  const isInterstate = igstTotal > 0
  const gstPct = invoice.items?.[0] ? parseFloat(invoice.items[0].gst_percentage) : 0
  const halfPct = gstPct / 2

  const subtotal = parseFloat(invoice.subtotal ?? '0')
  const cgst = parseFloat(invoice.cgst_amount ?? '0')
  const sgst = parseFloat(invoice.sgst_amount ?? '0')
  const igst = parseFloat(invoice.igst_amount ?? '0')
  const discount = parseFloat(invoice.discount_amount ?? '0')
  const roundOff = parseFloat(invoice.round_off ?? '0')
  const grandTotal = parseFloat(invoice.grand_total ?? '0')

  const emptyRows = Math.max(0, 10 - (invoice.items?.length ?? 0))

  const gstNote = isInterstate
    ? `GST ${fmt(subtotal)} × ${gstPct}% = ${fmt(igst)} IGST  |  THANKS CUSTOMER`
    : `GST ${fmt(subtotal)} × ${halfPct}+${halfPct}% = ${fmt(cgst)} CGST + ${fmt(sgst)} SGST  |  THANKS CUSTOMER`

  return (
    <div className="invoice-wrap">
      {/* 1. TITLE BAR */}
      <div className="title-bar">
        <div className="bill-type">TAX INVOICE</div>
        <div className="company-name">{(company.company_name ?? '').toUpperCase()}</div>
        <div className="company-addr">
          {formatCompanyAddress(company.address, company.city, company.pincode).map((line, i) => (
            <div key={i}>{line}</div>
          ))}
          <div style={{ marginTop: 2 }}>
            Phone&nbsp;:&nbsp;{company.phone || '—'}
            &nbsp;&nbsp;&nbsp;&nbsp;E-Mail&nbsp;:&nbsp;{company.email || '—'}
          </div>
        </div>
      </div>

      {/* 2. GSTIN STRIP */}
      <div className="gstin-strip">GSTIN&nbsp;:&nbsp;{company.gstin || 'N/A'}</div>

      {/* 3. CUSTOMER ↔ INVOICE META */}
      <div className="info-row">
        <div className="info-col">
          <span className="block-title">M/s {(invoice.customer_name ?? '').toUpperCase()}</span>
          {invoice.customer_address}
          {invoice.customer_city ? `, ${invoice.customer_city}` : ''}
          {invoice.customer_state ? `\u00a0\u00a0State\u00a0:\u00a0${invoice.customer_state}` : ''}
          <br />
          PH.NO.&nbsp;:&nbsp;{invoice.customer_mobile || '—'}
          {invoice.customer_email && (
            <><br />E-Mail&nbsp;:&nbsp;{invoice.customer_email}</>
          )}
          {invoice.customer_gstin && (
            <><br />GSTIN&nbsp;:&nbsp;{invoice.customer_gstin}</>
          )}
        </div>

        <div className="info-col">
          <table className="meta-table">
            <tbody>
              {(
                [
                  ['Invoice No.', <strong key="no">{invoice.invoice_number}</strong>],
                  ['Date', <strong key="date">{fmtDate(invoice.invoice_date)}</strong>],
                  ['Order No.', ''],
                  ['Transport', ''],
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

      {/* 4. LINE-ITEMS TABLE */}
      <table className="items-table">
        <thead>
          <tr>
            <th style={{ width: 28 }}>SN.</th>
            <th>PRODUCT NAME</th>
            <th style={{ width: 70 }}>HSN CODE</th>
            <th style={{ width: 42 }}>QTY</th>
            <th style={{ width: 60 }}>RATE</th>
            {isInterstate ? (
              <th style={{ width: 48 }}>IGST&nbsp;%</th>
            ) : (
              <>
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
              <td className="cen">{fmt(item.quantity, 0)}</td>
              <td className="num">{fmt(item.unit_price)}</td>
              {isInterstate ? (
                <td className="cen">{fmt(item.gst_percentage)}</td>
              ) : (
                <>
                  <td className="cen">{fmt(halfPct)}</td>
                  <td className="cen">{fmt(halfPct)}</td>
                </>
              )}
              <td className="num">{fmt(item.taxable_amount)}</td>
            </tr>
          ))}
          {Array.from({ length: emptyRows }).map((_, i) => {
            const isLast = i === emptyRows - 1
            return (
              <tr className={isLast ? 'empty-row filler-row' : 'empty-row'} key={`e${i}`}>
                <td /><td /><td /><td /><td />
                {isInterstate ? <td /> : <><td /><td /></>}
                <td />
              </tr>
            )
          })}
          {emptyRows === 0 && (
            <tr className="empty-row filler-row">
              <td /><td /><td /><td /><td />
              {isInterstate ? <td /> : <><td /><td /></>}
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
                <td className="t-value">{fmt(subtotal)}</td>
              </tr>
              {isInterstate ? (
                <tr>
                  <td className="t-label">IGST {gstPct}%</td>
                  <td className="t-value">{fmt(igst)}</td>
                </tr>
              ) : (
                <>
                  <tr>
                    <td className="t-label">SGST {halfPct}%</td>
                    <td className="t-value">{fmt(sgst)}</td>
                  </tr>
                  <tr>
                    <td className="t-label">CGST {halfPct}%</td>
                    <td className="t-value">{fmt(cgst)}</td>
                  </tr>
                </>
              )}
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

      {/* 6. AMOUNT IN WORDS */}
      <div className="amount-words">{amountInWords(grandTotal)}</div>

      {/* 7. BOTTOM STRIP */}
      <div className="bottom-strip">
        <div className="bottom-col" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <span className="col-title">Bank Details</span>
            <span className="b-label">Bank Name</span>:&nbsp;{company.bank_name || '—'}
            <br />
            <span className="b-label">A/C No.</span>:&nbsp;{company.account_number || '—'}
            <br />
            <span className="b-label">IFSC Code</span>:&nbsp;{company.ifsc_code || '—'}
            <br />
            <span className="b-label">Branch</span>:&nbsp;{company.city || '—'}
          </div>
          {qrCodeBase64 && (
            <div style={{ width: 115, height: 115, border: '1.2px solid #000', padding: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <img src={qrCodeBase64} style={{ width: '100%', height: '100%', objectFit: 'contain' }} alt="QR Code" />
            </div>
          )}
        </div>

        <div className="bottom-col">
          <span className="col-title">Terms &amp; Conditions</span>
          <ol style={{ paddingLeft: 12, margin: 0, fontSize: '9pt', lineHeight: 1.7 }}>
            <li>Goods once sold will not be taken back or exchanged.</li>
            <li>Payment must be made within the due date mentioned on the invoice.</li>
            <li>Interest @ 1.5% per month will be charged on all outstanding amounts remaining unpaid after the due date.</li>
            <li>All disputes arising out of this invoice shall be subject to Ahmedabad jurisdiction only.</li>
          </ol>
        </div>

        <div className="bottom-col sig-col">
          <span className="for-label">For {(company.company_name ?? '').toUpperCase()}</span>
          <div className="sig-space">
            {sigBase64 && (
              <img src={sigBase64} style={{ maxHeight: 58, maxWidth: 150, objectFit: 'contain' }} alt="Signature" />
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

interface TaxInvoicePrintProps {
  invoiceId?: number | string
  onClose?: () => void
  autoDownload?: boolean
}

export default function TaxInvoicePrint({
  invoiceId: propInvoiceId,
  onClose,
  autoDownload = false
}: TaxInvoicePrintProps = {}) {
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
  const [assetsLoading, setAssetsLoading] = useState(true)

  useEffect(() => {
    const convertAssets = async () => {
      setAssetsLoading(true)
      if (qrCodeUrl) {
        try { setQrCodeBase64(await toBase64(qrCodeUrl)) } catch (e) { console.error('QR load failed', e) }
      }
      if (signatureUrl) {
        try { setSigBase64(await toBase64(signatureUrl)) } catch (e) { console.error('Sig load failed', e) }
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
        if (!axios.isCancel(e)) setError(e?.response?.data?.message ?? 'Failed to load invoice.')
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
<style>${TAX_PRINT_CSS}</style>
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
    <div className="page" style={autoDownload ? { display: 'none' } : { maxWidth: 860, margin: '0 auto' }}>
      {/* Toolbar */}
      <div className="page-hdr">
        <div>
          <button className="btn btn-ghost btn-sm" onClick={() => onClose ? onClose() : navigate(-1)} style={{ marginBottom: 8 }}>
            <ArrowLeft size={15} /> Back
          </button>
          <div className="page-title">
            Tax Invoice&nbsp;<span style={{ color: 'var(--primary)' }}>#{invoice.invoice_number}</span>
          </div>
          <div className="page-sub" style={{ marginTop: 4 }}>
            {fmtDate(invoice.invoice_date)}&nbsp;·&nbsp;{invoice.customer_name}&nbsp;·&nbsp;
            <span style={{ color: invoice.payment_status === 'PAID' ? 'var(--success)' : invoice.payment_status === 'PARTIAL' ? 'var(--warning)' : 'var(--danger)' }}>
              {invoice.payment_status}
            </span>
          </div>
        </div>
        <div className="page-hdr-actions">
          <button className="btn btn-outline btn-sm" onClick={() => openPrintWindow(buildPrintHTML())}>
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

      {error && <div className="login-err" style={{ marginBottom: 16 }}>{error}</div>}

      <style>{TAX_PRINT_CSS.replace(/@page[^}]+}/g, '')}</style>

      <div style={{ background: '#fff', boxShadow: 'var(--sh-lg)', borderRadius: 4, padding: '8mm', marginBottom: 32, overflowX: 'auto' }}>
        <div ref={printRef}>
          <TaxInvoiceDocument
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