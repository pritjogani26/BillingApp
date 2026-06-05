// src/renderer/src/pages/InvoicePrint.tsx
// Renders a print-ready invoice that matches the OM Circuit System bill layout.
// Supports View (modal), Print (window.print), and Download PDF (Electron print-to-PDF).

import { useEffect, useRef, useState, useCallback } from 'react'
import { X, Printer, Download, Loader, Eye } from 'lucide-react'
import client from '../api/client'

/* ── Types ─────────────────────────────────────────────────── */
interface CompanyProfile {
  company_name: string
  gstin?: string
  address?: string
  city?: string
  state?: string
  pincode?: string
  phone?: string
  email?: string
  bank_name?: string
  account_number?: string
  ifsc_code?: string
  invoice_prefix?: string
}

interface InvoiceItem {
  item_id?: number
  product_name?: string
  hsn_code?: string
  quantity: number | string
  unit_price: number | string
  gst_percentage: number | string
  taxable_amount?: number | string
  cgst_amount?: number | string
  sgst_amount?: number | string
  igst_amount?: number | string
  total_amount?: number | string
}

interface InvoiceData {
  invoice_id: number
  invoice_number: string
  invoice_type: string
  invoice_date: string
  customer_id: number
  customer_name: string
  customer_mobile?: string
  contact_person?: string
  customer_address?: string
  customer_city?: string
  customer_state?: string
  customer_gstin?: string
  customer_email?: string
  subtotal: number | string
  cgst_amount: number | string
  sgst_amount: number | string
  igst_amount: number | string
  discount_amount: number | string
  round_off?: number | string
  grand_total: number | string
  due_amount: number | string
  payment_status: string
  notes?: string
  items?: InvoiceItem[]
}

interface Props {
  invoiceId: number
  onClose: () => void
  autoDownload?: boolean
}

/* ── Number helpers ─────────────────────────────────────────── */
const n = (v: number | string | null | undefined) => Number(v ?? 0)
const fixed2 = (v: number | string | null | undefined) => n(v).toFixed(2)
const comma = (v: number | string | null | undefined) =>
  n(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtDate = (d: string) => {
  if (!d) return ''
  const dt = new Date(d)
  return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`
}

/* ── Amount in words ─────────────────────────────────────────── */
const ones = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen'
]
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function toWords(num: number): string {
  if (num === 0) return 'Zero'
  if (num < 20) return ones[num]
  if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? ' ' + ones[num % 10] : '')
  if (num < 1000)
    return ones[Math.floor(num / 100)] + ' Hundred' + (num % 100 ? ' ' + toWords(num % 100) : '')
  if (num < 100000)
    return toWords(Math.floor(num / 1000)) + ' Thousand' + (num % 1000 ? ' ' + toWords(num % 1000) : '')
  if (num < 10000000)
    return toWords(Math.floor(num / 100000)) + ' Lakh' + (num % 100000 ? ' ' + toWords(num % 100000) : '')
  return toWords(Math.floor(num / 10000000)) + ' Crore' + (num % 10000000 ? ' ' + toWords(num % 10000000) : '')
}

function amountInWords(amount: number): string {
  const rupees = Math.floor(amount)
  const paise = Math.round((amount - rupees) * 100)
  let result = 'Rs. ' + toWords(rupees)
  if (paise > 0) result += ' And ' + toWords(paise) + ' Paise'
  return result + ' Only'
}

/* ── GST note line ───────────────────────────────────────────── */
function buildGstNote(inv: InvoiceData): string {
  const taxable = n(inv.subtotal)
  const cgst = n(inv.cgst_amount)
  const sgst = n(inv.sgst_amount)
  const igst = n(inv.igst_amount)
  const pct = n(inv.items?.[0]?.gst_percentage ?? 0)
  if (igst > 0) {
    return `IGST ${fixed2(igst)} @ ${pct}%  |  THANKS CUSTOMER`
  }
  if (cgst > 0 || sgst > 0) {
    const halfPct = pct / 2
    return `GST ${fixed2(taxable)}*${halfPct}+${halfPct}%=${fixed2(cgst)}SGST+${fixed2(sgst)}CGST,  THANKS CUSTOMER`
  }
  return 'NON-GST INVOICE  |  THANKS CUSTOMER'
}

/* ═══════════════════════════════════════════════════════════════
   InvoicePrint Component
═══════════════════════════════════════════════════════════════ */
export default function InvoicePrint({ invoiceId, onClose, autoDownload }: Props) {
  const [inv, setInv] = useState<InvoiceData | null>(null)
  const [company, setCompany] = useState<CompanyProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const printRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const [invRes, coRes] = await Promise.all([
          client.get(`/invoices/${invoiceId}/`),
          client.get('/company/profile/')
        ])
        if (invRes.data.success) setInv(invRes.data.data)
        else setError('Failed to load invoice.')
        if (coRes.data.success) setCompany(coRes.data.data)
      } catch {
        setError('Network error loading invoice.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [invoiceId])

  /* ── Print handler ───────────────────────────────────────── */
  const handlePrint = () => {
    const content = printRef.current
    if (!content) return

    const printWindow = window.open('', '_blank', 'width=900,height=700')
    if (!printWindow) return

    const styleEl = document.createElement('style')
    styleEl.textContent = getPrintCSS()

    if (printWindow.document.head) {
      printWindow.document.head.appendChild(styleEl)
    } else {
      printWindow.document.appendChild(styleEl)
    }
    printWindow.document.body.innerHTML = content.outerHTML
    printWindow.document.title = `Invoice-${inv?.invoice_number || invoiceId}`

    setTimeout(() => {
      printWindow.focus()
      printWindow.print()
      printWindow.close()
    }, 400)
  }

  /* ── View in new window handler ───────────────────────────── */
  const handleView = () => {
    const content = printRef.current
    if (!content) return

    const viewWindow = window.open('', '_blank', 'width=900,height=700')
    if (!viewWindow) return

    viewWindow.document.write(`<!DOCTYPE html><html lang="en"><head>
      <meta charset="UTF-8"/>
      <title>Invoice ${inv?.invoice_number || invoiceId}</title>
      <style>${getPrintCSS()}</style>
    </head><body style="background:#f0f0f0;margin:0;padding:30px;display:flex;justify-content:center;">
      ${content.outerHTML}
    </body></html>`)
    viewWindow.document.close()
    viewWindow.focus()
  }

  /* ── Download PDF via Electron printToPDF IPC ── */
  const [downloading, setDownloading] = useState(false)


  const handleDownload = useCallback(async () => {
    if (!inv || !printRef.current) return
    setDownloading(true)

    try {
      // Build a full self-contained HTML document from the live invoice DOM
      const invoiceHTML = printRef.current.outerHTML
      const htmlDoc = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>${inv.invoice_number}</title>
  <style>${getPrintCSS()}</style>
</head>
<body style="background:#fff;margin:0;padding:20px;">
  ${invoiceHTML}
</body>
</html>`

      const filename = `${inv.invoice_number}.pdf`

      // Use Electron IPC to have the main process run printToPDF + save dialog
      if (window.electronAPI?.saveInvoicePDF) {
        const result = await window.electronAPI.saveInvoicePDF(htmlDoc, filename)
        if (result.success) {
          // Optionally show a brief success toast (simple alert for now)
          console.log('PDF saved to:', result.filePath)
        } else if (result.reason !== 'cancelled') {
          alert(`PDF download failed: ${result.reason}`)
        }
      } else {
        // Fallback for non-Electron / browser dev environment
        const printWindow = window.open('', '_blank', 'width=900,height=1200')
        if (!printWindow) return
        printWindow.document.write(`<!DOCTYPE html><html><head>
          <meta charset="UTF-8"/>
          <title>${inv.invoice_number}</title>
          <style>${getPrintCSS()}</style>
        </head><body style="margin:0;padding:20px">${invoiceHTML}</body></html>`)
        printWindow.document.close()
        setTimeout(() => { printWindow.print(); printWindow.close() }, 600)
      }
    } catch (err) {
      console.error('PDF download error:', err)
      alert('Failed to generate PDF. Please try again.')
    } finally {
      setDownloading(false)
    }
  }, [inv, onClose])

  /* ── Auto-download: trigger ONCE when data is ready ───── */
  const downloadTriggered = useRef(false)
  useEffect(() => {
    if (autoDownload && inv && !loading && !downloadTriggered.current) {
      downloadTriggered.current = true
      handleDownload().then(() => onClose())
    }
  }, [autoDownload, inv, loading, handleDownload, onClose])

  if (loading) {
    return (
      <div className="overlay" onClick={onClose}>
        <div
          className="modal"
          style={{
            width: 500,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 60,
            gap: 12
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <Loader size={22} style={{ animation: 'spin 1s linear infinite' }} />
          <span className="t2">Loading invoice…</span>
        </div>
      </div>
    )
  }

  if (error || !inv) {
    return (
      <div className="overlay" onClick={onClose}>
        <div
          className="modal"
          style={{ width: 400, padding: 32, textAlign: 'center' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ color: 'var(--danger)', marginBottom: 12 }}>{error || 'Invoice not found.'}</div>
          <button className="btn btn-outline" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    )
  }

  const isGST = inv.invoice_type === 'GST'
  const items = inv.items || []
  const grandTotal = n(inv.grand_total)
  const roundOff = n(inv.round_off ?? 0)
  const subtotal = n(inv.subtotal)
  const cgst = n(inv.cgst_amount)
  const sgst = n(inv.sgst_amount)
  const igst = n(inv.igst_amount)

  // Determine GST percentage for the summary line
  const gstPct = n(items[0]?.gst_percentage ?? 0)
  const halfPct = gstPct / 2
  const isInterstate = isGST && igst > 0

  return (
    <div
      className="overlay"
      style={{
        zIndex: 9999,
        ...(autoDownload ? { visibility: 'hidden', pointerEvents: 'none' } : {})
      }}
      onClick={autoDownload ? undefined : onClose}
    >
      <style dangerouslySetInnerHTML={{ __html: getPrintCSS() }} />
      {/* ── Action toolbar (outside print area) ── */}
      <div
        style={{
          position: 'fixed',
          top: 16,
          right: 16,
          display: 'flex',
          gap: 10,
          zIndex: 10000
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 1️⃣ View */}
        <button
          onClick={handleView}
          className="btn btn-outline row gap-2"
          style={{
            background: 'rgba(255,255,255,0.15)',
            backdropFilter: 'blur(6px)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
            color: '#fff',
            border: '1.5px solid rgba(255,255,255,0.4)'
          }}
        >
          <Eye size={15} /> View
        </button>

        {/* 2️⃣ Print */}
        <button
          onClick={handlePrint}
          className="btn btn-primary row gap-2"
          style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.3)' }}
        >
          <Printer size={15} /> Print
        </button>

        {/* 3️⃣ Download PDF */}
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="btn btn-outline row gap-2"
          style={{
            background: '#fff',
            boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
            color: 'var(--t1)',
            opacity: downloading ? 0.7 : 1,
            cursor: downloading ? 'not-allowed' : 'pointer'
          }}
        >
          {downloading ? <Loader size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={15} />}
          {downloading ? 'Generating…' : 'Download PDF'}
        </button>

        {/* ✖ Close */}
        <button
          onClick={onClose}
          style={{
            background: 'rgba(0,0,0,0.6)',
            border: 'none',
            borderRadius: 8,
            padding: '8px 14px',
            cursor: 'pointer',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 13,
            fontWeight: 600
          }}
        >
          <X size={15} /> Close
        </button>
      </div>

      {/* ── Invoice paper wrapper ── */}
      <div
        style={{
          overflowY: 'auto',
          maxHeight: '100vh',
          padding: '60px 20px 40px',
          display: 'flex',
          justifyContent: 'center'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          ref={printRef}
          id="invoice-print-area"
          className="invoice-sheet"
        >
          {/* ① HEADER */}
          <div className="header">
            <div className="invoice-type">{isGST ? 'GST Invoice' : 'Non-GST Invoice'}</div>
            <div className="company-name">{company?.company_name || 'Your Company'}</div>
            <div className="company-address">
              {company?.address && <>{company.address},<br /></>}
              {company?.city && <>{company.city}</>}{company?.state && <>, {company.state}</>}{company?.pincode && <> - {company.pincode}</>}<br />
              {company?.phone && <>Phone : {company.phone}&nbsp;&nbsp;&nbsp;</>}
              {company?.email && <>E-Mail : {company.email}</>}
            </div>
          </div>

          {/* ② GSTIN BAND */}
          {isGST && company?.gstin && (
            <div className="gstin-band">GSTIN : {company.gstin}</div>
          )}

          {/* ③ BUYER DETAILS + ④ INVOICE META */}
          <div className="billing-row">
            {/* Buyer block */}
            <div className="buyer-block">
              <div className="buyer-name">M/s {inv.customer_name}</div>
              {inv.customer_address && <div>{inv.customer_address}</div>}
              <div>
                {inv.customer_city && <>{inv.customer_city}&nbsp;&nbsp;</>}
                {inv.customer_state && <>State : {inv.customer_state}</>}
              </div>
              {inv.customer_mobile && <div style={{ marginTop: 4 }}>PH.NO.: {inv.customer_mobile}</div>}
              {inv.contact_person && <div>DL.No. : {inv.contact_person}</div>}
              {isGST && inv.customer_gstin && (
                <div className="buyer-gstin">GSTIN : {inv.customer_gstin}</div>
              )}
            </div>

            {/* Invoice meta block */}
            <div className="meta-block">
              <table className="meta-table">
                <tbody>
                  <tr>
                    <td className="label">Invoice No.</td>
                    <td className="colon">:</td>
                    <td className="value" style={{ fontWeight: 700 }} colSpan={4}>{inv.invoice_number}</td>
                  </tr>
                  <tr>
                    <td className="label">Date</td>
                    <td className="colon">:</td>
                    <td className="value" style={{ fontWeight: 700 }} colSpan={4}>{fmtDate(inv.invoice_date)}</td>
                  </tr>
                  <tr>
                    <td className="label">Order No.</td>
                    <td className="colon">:</td>
                    <td colSpan={4}></td>
                  </tr>
                  <tr>
                    <td className="label">L.R. No.</td>
                    <td className="colon">:</td>
                    <td colSpan={4}></td>
                  </tr>
                  <tr>
                    <td className="label">Cases</td>
                    <td className="colon">:</td>
                    <td className="value" colSpan={4}>0</td>
                  </tr>
                  <tr>
                    <td className="label">Transport</td>
                    <td className="colon">:</td>
                    <td colSpan={4}></td>
                  </tr>
                  <tr className="due-row">
                    <td className="label">Due Date</td>
                    <td className="colon">:</td>
                    <td className="value" colSpan={4}>{fmtDate(inv.invoice_date)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* ⑤ ITEM TABLE */}
          <table className="items-table">
            <thead>
              <tr>
                <th style={{ width: 28 }}>SN.</th>
                <th className="left">PRODUCT NAME</th>
                <th style={{ width: 72 }}>HSN<br />CODE</th>
                <th style={{ width: 42 }}>QTY</th>
                <th className="right" style={{ width: 72 }}>RATE</th>
                {isGST && !isInterstate && (
                  <>
                    <th style={{ width: 44 }}>SGST<br />%</th>
                    <th style={{ width: 44 }}>CGST<br />%</th>
                  </>
                )}
                {isGST && isInterstate && (
                  <th style={{ width: 44 }}>IGST<br />%</th>
                )}
                <th className="right" style={{ width: 84 }}>AMOUNT</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => {
                const taxable = n(item.taxable_amount ?? n(item.quantity) * n(item.unit_price))
                const gstPctItem = n(item.gst_percentage)
                const halfPctItem = gstPctItem / 2
                const amount = taxable
                return (
                  <tr key={idx}>
                    <td className="sn">{idx + 1}.</td>
                    <td className="product">
                      {item.product_name}
                      {inv.notes && idx === items.length - 1 && (
                        <div className="item-remark">REMARK : {inv.notes}</div>
                      )}
                    </td>
                    <td className="hsn">{item.hsn_code || ''}</td>
                    <td className="qty">{fixed2(item.quantity)}</td>
                    <td className="rate">{fixed2(item.unit_price)}</td>
                    {isGST && !isInterstate && (
                      <>
                        <td className="gst-pct">{halfPctItem.toFixed(2)}</td>
                        <td className="gst-pct">{halfPctItem.toFixed(2)}</td>
                      </>
                    )}
                    {isGST && isInterstate && (
                      <td className="gst-pct">{gstPctItem.toFixed(2)}</td>
                    )}
                    <td className="amount">{comma(amount)}</td>
                  </tr>
                )
              })}

              {/* Empty filler rows to fill invoice space */}
              {Array.from({ length: Math.max(0, 12 - items.length) }).map((_, i) => (
                <tr key={`empty-${i}`} className="empty-row">
                  <td className="sn"></td>
                  <td></td>
                  <td className="hsn"></td>
                  <td className="qty"></td>
                  <td className="rate"></td>
                  {isGST && !isInterstate && (
                    <>
                      <td className="gst-pct"></td>
                      <td className="gst-pct"></td>
                    </>
                  )}
                  {isGST && isInterstate && (
                    <td className="gst-pct"></td>
                  )}
                  <td className="amount"></td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* ⑥⑦⑧⑨⑩ FOOTER */}
          <div className="footer-row">
            {/* Left: GST note, amount in words, terms, receiver sig */}
            <div className="footer-left">
              <div>
                {/* ⑥ Tax note line */}
                <div className="gst-note">
                  {buildGstNote(inv)}
                </div>
                {/* ⑧ Amount in words */}
                <div className="amount-words">
                  {amountInWords(grandTotal)}
                </div>
                {/* ⑨ Terms & Conditions */}
                <div className="terms-block">
                  <div className="terms-title">Terms &amp; Conditions</div>
                  <div className="terms-text">Subject to {company?.city || 'local'} jurisdiction</div>
                </div>

                {/* Bank details if available */}
                {company?.bank_name && (
                  <div style={{ marginTop: 10, fontSize: 10, color: '#333' }}>
                    <div style={{ fontWeight: 700, marginBottom: 2 }}>Bank Details:</div>
                    <div>{company.bank_name}</div>
                    {company.account_number && <div>A/C: {company.account_number}</div>}
                    {company.ifsc_code && <div>IFSC: {company.ifsc_code}</div>}
                  </div>
                )}
              </div>
              {/* ⑩ Receiver signature */}
              <div>
                <span className="receiver-sig">Receiver Signature</span>
              </div>
            </div>

            {/* Right: Totals + authorised signatory */}
            <div className="footer-right">
              {/* ⑦ Total summary */}
              <table className="totals-table">
                <tbody>
                  <tr>
                    <td className="t-label">SUB TOTAL</td>
                    <td className="t-value">{comma(subtotal)}</td>
                  </tr>
                  {isGST && !isInterstate && sgst > 0 && (
                    <tr>
                      <td className="t-label">SGST {halfPct}%</td>
                      <td className="t-value">{comma(sgst)}</td>
                    </tr>
                  )}
                  {isGST && !isInterstate && cgst > 0 && (
                    <tr>
                      <td className="t-label">CGST {halfPct}%</td>
                      <td className="t-value">{comma(cgst)}</td>
                    </tr>
                  )}
                  {isGST && isInterstate && igst > 0 && (
                    <tr>
                      <td className="t-label">IGST {gstPct}%</td>
                      <td className="t-value">{comma(igst)}</td>
                    </tr>
                  )}
                  {n(inv.discount_amount) > 0 && (
                    <tr className="discount">
                      <td className="t-label">Discount</td>
                      <td className="t-value">-{comma(inv.discount_amount)}</td>
                    </tr>
                  )}
                  <tr>
                    <td className="t-label">Roundoff</td>
                    <td className="t-value">{fixed2(roundOff)}</td>
                  </tr>
                  <tr className="grand-row">
                    <td className="t-label">GRAND TOTAL</td>
                    <td className="t-value">{comma(grandTotal)}</td>
                  </tr>
                </tbody>
              </table>

              {/* ⑩ Authorised signatory */}
              <div className="authorised-block">
                <div className="for-co">For {company?.company_name || 'Company'}</div>
                <div className="sig-line">Authorised signatory</div>
              </div>
            </div>
          </div>

          {/* PAID watermark */}
          {inv.payment_status === 'PAID' && (
            <div className="watermark">PAID</div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Print CSS (injected into popup window) ──────────────────── */
function getPrintCSS(): string {
  return `
    @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600;700&family=IBM+Plex+Mono:wght@400;600&display=swap');

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    /* ── A4 sheet ── */
    .invoice-sheet {
      width: 210mm;
      min-height: 297mm;
      background: #fff;
      margin: 0 auto;
      border: 2px solid #000;
      position: relative;
      padding: 0;
      box-shadow: 0 6px 32px rgba(0,0,0,0.35);
      font-family: 'IBM Plex Sans', Arial, sans-serif;
      font-size: 12px;
      color: #000;
    }

    /* ── Header ── */
    .header {
      text-align: center;
      border-bottom: 1.5px solid #000;
      padding: 10px 16px 8px;
      background: #c8c8c8; /* normal grey, prints well in B&W */
    }
    .header .invoice-type {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 2px;
      text-transform: uppercase;
      margin-bottom: 3px;
      color: #000;
    }
    .header .company-name {
      font-size: 28px;
      font-weight: 700;
      letter-spacing: 1px;
      text-transform: uppercase;
      line-height: 1.15;
      margin-bottom: 4px;
      color: #000;
    }
    .header .company-address {
      font-size: 11px;
      line-height: 1.7;
      color: #000;
    }

    /* ── GSTIN band ── */
    .gstin-band {
      text-align: center;
      border-bottom: 1.5px solid #000;
      padding: 4px 16px;
      font-weight: 700;
      font-size: 12px;
      letter-spacing: 0.5px;
      background: #e8e8e8;
      color: #000;
    }

    /* ── Buyer + Invoice meta ── */
    .billing-row {
      display: flex;
      border-bottom: 1.5px solid #000;
      min-height: 110px;
    }
    .buyer-block {
      flex: 1;
      padding: 10px 14px;
      border-right: 1.5px solid #000;
      font-size: 11.5px;
      line-height: 1.65;
      color: #000;
    }
    .buyer-block .buyer-name {
      font-weight: 700;
      font-size: 12.5px;
      margin-bottom: 2px;
      color: #000;
    }
    .buyer-block .buyer-gstin {
      font-weight: 700;
      margin-top: 4px;
      color: #000;
    }
    .meta-block {
      width: 268px;
      padding: 10px 14px;
      font-size: 11.5px;
      color: #000;
    }
    .meta-table { width: 100%; border-collapse: collapse; }
    .meta-table td { padding: 2px 3px; vertical-align: top; color: #000; }
    .meta-table .label { font-weight: 600; white-space: nowrap; }
    .meta-table .colon { padding: 2px 4px; }
    .meta-table .value { white-space: nowrap; }
    .due-row td { font-weight: 700; padding-top: 3px; }

    /* ── Item table ── */
    .items-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
      border-bottom: 1.5px solid #000;
    }
    .items-table thead tr {
      background: #c8c8c8; /* matches header grey — crisp in B&W print */
      border-bottom: 1.5px solid #000;
    }
    .items-table th {
      padding: 5px 6px;
      font-weight: 700;
      text-align: center;
      font-size: 10.5px;
      border-right: 1px solid #000;
      vertical-align: middle;
      white-space: nowrap;
      color: #000;
    }
    .items-table th:last-child { border-right: none; }
    .items-table th.left { text-align: left; }
    .items-table th.right { text-align: right; }

    .items-table td {
      padding: 4px 6px;
      vertical-align: top;
      border-right: 1px solid #000;
      border-bottom: 1px solid #bbb;
      font-size: 11px;
      color: #000;
    }
    .items-table td:last-child { border-right: none; }
    .items-table td.center { text-align: center; }
    .items-table td.right { text-align: right; font-family: 'IBM Plex Mono', monospace; }
    .items-table td.sn { text-align: center; width: 28px; }
    .items-table td.product { min-width: 160px; }
    .items-table td.hsn { text-align: center; width: 72px; }
    .items-table td.qty { text-align: center; width: 42px; }
    .items-table td.rate { text-align: right; width: 72px; font-family: 'IBM Plex Mono', monospace; }
    .items-table td.gst-pct { text-align: center; width: 44px; }
    .items-table td.amount { text-align: right; width: 82px; font-family: 'IBM Plex Mono', monospace; }

    .item-remark { font-size: 10px; color: #333; margin-top: 2px; }
    .empty-row { height: 20px; }

    /* ── Footer ── */
    .footer-row {
      display: flex;
      min-height: 160px;
    }
    .footer-left {
      flex: 1;
      border-right: 1.5px solid #000;
      padding: 8px 12px;
      font-size: 11px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      color: #000;
    }
    .gst-note { font-style: italic; margin-bottom: 6px; color: #000; }
    .amount-words { font-weight: 700; font-size: 11.5px; margin-bottom: 10px; color: #000; }
    .terms-block { margin-top: 6px; }
    .terms-block .terms-title {
      font-weight: 700;
      text-decoration: underline;
      font-size: 11px;
      margin-bottom: 2px;
      color: #000;
    }
    .terms-block .terms-text { font-size: 10px; color: #333; }
    .receiver-sig { margin-top: 36px; font-size: 11px; font-weight: 600; border-top: 1px solid #000; padding-top: 4px; display: inline-block; color: #000; }

    .footer-right {
      width: 268px;
      padding: 8px 12px;
      font-size: 12px;
      color: #000;
    }
    .totals-table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
    .totals-table td { padding: 2.5px 0; color: #000; }
    .totals-table .t-label { font-weight: 600; }
    .totals-table .t-value { text-align: right; font-family: 'IBM Plex Mono', monospace; }
    .totals-table .grand-row td {
      font-weight: 900;
      font-size: 13.5px;
      padding-top: 5px;
      border-top: 2px solid #000;
      color: #000;
    }
    .totals-table .discount { color: #000; }

    .authorised-block {
      margin-top: 10px;
      text-align: right;
      font-size: 11px;
      color: #000;
    }
    .authorised-block .for-co { font-weight: 700; margin-bottom: 38px; color: #000; }
    .authorised-block .sig-line {
      border-top: 1px solid #000;
      padding-top: 4px;
      font-size: 10.5px;
      color: #333;
    }

    /* ── PAID watermark ── */
    .watermark {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-30deg);
      font-size: 80px;
      font-weight: 900;
      color: rgba(0,0,0,0.07);
      pointer-events: none;
      user-select: none;
      letter-spacing: 6px;
      white-space: nowrap;
      z-index: 0;
    }

    /* ── Print styles ── */
    @media print {
      body { background: #fff; padding: 0; margin: 0; }
      .invoice-sheet {
        box-shadow: none;
        width: 100% !important;
        min-height: auto;
        border: 2px solid #000;
        margin: 0 !important;
      }
      @page {
        size: A4;
        margin: 0.4in;
      }
    }
  `;
}
