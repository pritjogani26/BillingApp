// src/renderer/src/pages/Reports.tsx

import { useState } from 'react'
import { AlertCircle, BarChart2, RefreshCw } from 'lucide-react'
import client from '../api/client'

/* ── Types ── */
interface GSTSummary {
  invoice_count: number
  taxable_amount: number | string
  total_cgst: number | string
  total_sgst: number | string
  total_igst: number | string
  grand_total: number | string
}

interface GSTR1Row {
  invoice_number: string
  invoice_date: string
  company_name: string
  customer_gstin: string
  customer_state: string
  taxable_value: number | string
  cgst_amount: number | string
  sgst_amount: number | string
  igst_amount: number | string
  grand_total: number | string
}

interface HSNRow {
  hsn_code: string
  product_name: string
  total_qty: number | string
  taxable_value: number | string
  cgst: number | string
  sgst: number | string
  igst: number | string
  total: number | string
}

interface MonthlySalesRow {
  month_label: string
  yr: number
  mo: number
  total_sales: number | string
  total_tax: number | string
  invoice_count: number
}

/* ── Helpers ── */
const inr = (n: number | string | null | undefined) =>
  n == null
    ? '₹0.00'
    : '₹' +
      Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmt = (d: string) =>
  new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
]

const currentYear = new Date().getFullYear()
const currentMonth = new Date().getMonth() + 1
const YEARS = [currentYear, currentYear - 1, currentYear - 2]

type ReportTab = 'gst-summary' | 'gstr1' | 'hsn' | 'monthly'

/* ── Bar chart component ── */
function MiniBar({ rows }: { rows: MonthlySalesRow[] }) {
  if (!rows.length) return null
  const max = Math.max(...rows.map((r) => Number(r.total_sales)))
  return (
    <div style={{ padding: '20px 20px 12px', borderBottom: '1px solid var(--border)' }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: 'var(--t3)',
          letterSpacing: '.5px',
          textTransform: 'uppercase',
          marginBottom: 12
        }}
      >
        Monthly Sales Trend
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 80 }}>
        {rows.map((r) => {
          const h = max > 0 ? Math.max(4, (Number(r.total_sales) / max) * 72) : 4
          return (
            <div
              key={`${r.yr}-${r.mo}`}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4
              }}
            >
              <div
                title={`${r.month_label}: ${inr(r.total_sales)}`}
                style={{
                  width: '100%',
                  height: h,
                  background: 'var(--primary)',
                  borderRadius: '3px 3px 0 0',
                  opacity: 0.8,
                  transition: 'height 0.3s ease',
                  cursor: 'default'
                }}
              />
              <div
                style={{
                  fontSize: 9,
                  color: 'var(--t3)',
                  whiteSpace: 'nowrap',
                  transform: 'rotate(-30deg)',
                  transformOrigin: 'center',
                  marginTop: 4
                }}
              >
                {r.month_label.slice(0, 3)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── Component ── */
export default function Reports() {
  const [tab, setTab] = useState<ReportTab>('monthly')
  const [month, setMonth] = useState(currentMonth)
  const [year, setYear] = useState(currentYear)

  const [gstSummary, setGstSummary] = useState<GSTSummary | null>(null)
  const [gstr1Rows, setGstr1Rows] = useState<GSTR1Row[]>([])
  const [hsnRows, setHsnRows] = useState<HSNRow[]>([])
  const [monthlyRows, setMonthlyRows] = useState<MonthlySalesRow[]>([])

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)

  const fetchReport = async () => {
    setLoading(true)
    setError('')
    const params = `month=${month}&year=${year}`
    try {
      if (tab === 'gst-summary') {
        const r = await client.get(`/reports/gst-summary/?${params}`)
        if (r.data.success) setGstSummary(r.data.data)
      } else if (tab === 'gstr1') {
        const r = await client.get(`/reports/gstr1/?${params}`)
        if (r.data.success) setGstr1Rows(r.data.data.gstr1 || [])
      } else if (tab === 'hsn') {
        const r = await client.get(`/reports/hsn-summary/?${params}`)
        if (r.data.success) setHsnRows(r.data.data.hsn_summary || [])
      } else if (tab === 'monthly') {
        const r = await client.get('/reports/monthly-sales/')
        if (r.data.success) setMonthlyRows(r.data.data.monthly_sales || [])
      }
      setLoaded(true)
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load report.')
    } finally {
      setLoading(false)
    }
  }

  const TAB_LABELS: Record<ReportTab, string> = {
    monthly: 'Monthly Sales',
    'gst-summary': 'GST Summary',
    gstr1: 'GSTR-1 Report',
    hsn: 'HSN Summary'
  }

  const needsMonthYear = tab !== 'monthly'

  return (
    <>
      <div className="page-hdr">
        <div>
          <div className="page-title">GST Reports</div>
          <div className="page-sub">
            Generate GSTR-1, HSN summary, and monthly sales trend reports.
          </div>
        </div>
      </div>

      {/* Report type tabs */}
      <div
        style={{
          display: 'flex',
          gap: 4,
          marginBottom: 20,
          borderBottom: '2px solid var(--border)',
          paddingBottom: 0
        }}
      >
        {(Object.keys(TAB_LABELS) as ReportTab[]).map((t) => (
          <button
            key={t}
            onClick={() => {
              setTab(t)
              setLoaded(false)
              setError('')
            }}
            className="btn btn-ghost"
            style={{
              borderRadius: '6px 6px 0 0',
              fontWeight: 600,
              fontSize: 13,
              color: tab === t ? 'var(--primary)' : 'var(--t2)',
              borderBottom: tab === t ? '2px solid var(--primary)' : '2px solid transparent',
              marginBottom: -2,
              padding: '8px 16px'
            }}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Controls */}
      <div className="card" style={{ marginBottom: 16, animation: 'fadeUp 0.25s ease' }}>
        <div
          style={{
            padding: '14px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap'
          }}
        >
          {needsMonthYear && (
            <>
              <div className="fgrp" style={{ marginBottom: 0 }}>
                <label className="flabel" style={{ marginBottom: 4 }}>
                  Month
                </label>
                <select
                  className="finput"
                  style={{ width: 140, padding: '7px 10px' }}
                  value={month}
                  onChange={(e) => setMonth(Number(e.target.value))}
                >
                  {MONTHS.map((m, i) => (
                    <option key={i} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div className="fgrp" style={{ marginBottom: 0 }}>
                <label className="flabel" style={{ marginBottom: 4 }}>
                  Year
                </label>
                <select
                  className="finput"
                  style={{ width: 110, padding: '7px 10px' }}
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                >
                  {YEARS.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
          <button
            className="btn btn-primary row gap-1"
            onClick={fetchReport}
            disabled={loading}
            style={{ marginTop: needsMonthYear ? 20 : 0 }}
          >
            {loading ? (
              <>
                <span
                  className="spinner spinner-sm"
                  style={{ borderTopColor: '#fff', borderColor: 'rgba(255,255,255,.3)' }}
                />
                Loading...
              </>
            ) : (
              <>
                <RefreshCw size={14} /> Generate Report
              </>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="login-err" style={{ marginBottom: 16 }}>
          <AlertCircle size={15} />
          {error}
        </div>
      )}

      {!loaded && !loading && (
        <div className="card">
          <div className="empty" style={{ padding: '60px 20px' }}>
            <BarChart2 size={40} className="empty-icon" />
            <div className="empty-text">No Report Generated</div>
            <div className="empty-sub">
              Select a period and click "Generate Report" to view data.
            </div>
          </div>
        </div>
      )}

      {/* ── Monthly Sales ── */}
      {tab === 'monthly' && loaded && (
        <div className="card" style={{ animation: 'fadeUp 0.3s ease' }}>
          <div className="card-hdr">
            <span className="card-title">Monthly Sales — Last 12 Months</span>
          </div>
          <MiniBar rows={monthlyRows} />
          <div className="tbl-wrap">
            {monthlyRows.length === 0 ? (
              <div className="empty">
                <div className="empty-text">No sales data found.</div>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Month</th>
                    <th style={{ textAlign: 'right' }}>Invoices</th>
                    <th style={{ textAlign: 'right' }}>Total Sales</th>
                    <th style={{ textAlign: 'right' }}>Total Tax</th>
                    <th style={{ textAlign: 'right' }}>Net (excl. tax)</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyRows.map((r) => (
                    <tr key={`${r.yr}-${r.mo}`}>
                      <td style={{ fontWeight: 600 }}>{r.month_label}</td>
                      <td style={{ textAlign: 'right' }}>
                        <span className="badge badge-blue">{r.invoice_count}</span>
                      </td>
                      <td
                        style={{
                          textAlign: 'right',
                          fontWeight: 600,
                          fontVariantNumeric: 'tabular-nums'
                        }}
                      >
                        {inr(r.total_sales)}
                      </td>
                      <td
                        style={{
                          textAlign: 'right',
                          color: 'var(--t2)',
                          fontVariantNumeric: 'tabular-nums'
                        }}
                      >
                        {inr(r.total_tax)}
                      </td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {inr(Number(r.total_sales) - Number(r.total_tax))}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#F8FAFC', fontWeight: 700 }}>
                    <td style={{ padding: '10px 16px' }}>Total</td>
                    <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                      {monthlyRows.reduce((s, r) => s + r.invoice_count, 0)}
                    </td>
                    <td
                      style={{
                        padding: '10px 16px',
                        textAlign: 'right',
                        fontVariantNumeric: 'tabular-nums'
                      }}
                    >
                      {inr(monthlyRows.reduce((s, r) => s + Number(r.total_sales), 0))}
                    </td>
                    <td
                      style={{
                        padding: '10px 16px',
                        textAlign: 'right',
                        fontVariantNumeric: 'tabular-nums'
                      }}
                    >
                      {inr(monthlyRows.reduce((s, r) => s + Number(r.total_tax), 0))}
                    </td>
                    <td
                      style={{
                        padding: '10px 16px',
                        textAlign: 'right',
                        fontVariantNumeric: 'tabular-nums'
                      }}
                    >
                      {inr(
                        monthlyRows.reduce(
                          (s, r) => s + Number(r.total_sales) - Number(r.total_tax),
                          0
                        )
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── GST Summary ── */}
      {tab === 'gst-summary' && loaded && gstSummary && (
        <div className="card" style={{ animation: 'fadeUp 0.3s ease' }}>
          <div className="card-hdr">
            <span className="card-title">
              GST Summary — {MONTHS[month - 1]} {year}
            </span>
          </div>
          <div
            style={{ padding: 24, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}
          >
            {[
              { label: 'GST Invoices', value: String(gstSummary.invoice_count), sub: 'count' },
              { label: 'Taxable Amount', value: inr(gstSummary.taxable_amount), sub: 'excl. GST' },
              { label: 'Total CGST', value: inr(gstSummary.total_cgst), sub: 'collected' },
              { label: 'Total SGST', value: inr(gstSummary.total_sgst), sub: 'collected' },
              { label: 'Total IGST', value: inr(gstSummary.total_igst), sub: 'inter-state' },
              { label: 'Grand Total', value: inr(gstSummary.grand_total), sub: 'incl. GST' }
            ].map((s, i) => (
              <div
                key={i}
                style={{
                  background: '#F8FAFC',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  padding: '16px 18px'
                }}
              >
                <div className="stat-label">{s.label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--t1)', marginTop: 6 }}>
                  {s.value}
                </div>
                <div className="stat-sub">{s.sub}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── GSTR-1 ── */}
      {tab === 'gstr1' && loaded && (
        <div className="card" style={{ animation: 'fadeUp 0.3s ease' }}>
          <div className="card-hdr">
            <span className="card-title">
              GSTR-1 — {MONTHS[month - 1]} {year}
            </span>
            <span className="fs12 t3 fw6">{gstr1Rows.length} Invoice(s)</span>
          </div>
          <div className="tbl-wrap">
            {gstr1Rows.length === 0 ? (
              <div className="empty">
                <div className="empty-text">No GST invoices for this period.</div>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Invoice #</th>
                    <th>Date</th>
                    <th>Customer</th>
                    <th>GSTIN</th>
                    <th>State</th>
                    <th style={{ textAlign: 'right' }}>Taxable</th>
                    <th style={{ textAlign: 'right' }}>CGST</th>
                    <th style={{ textAlign: 'right' }}>SGST</th>
                    <th style={{ textAlign: 'right' }}>IGST</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {gstr1Rows.map((r) => (
                    <tr key={r.invoice_number}>
                      <td
                        style={{
                          fontWeight: 600,
                          color: 'var(--primary)',
                          fontFamily: 'monospace',
                          fontSize: 13
                        }}
                      >
                        {r.invoice_number}
                      </td>
                      <td className="fs12 t2">{fmt(r.invoice_date)}</td>
                      <td style={{ fontWeight: 500 }}>{r.company_name}</td>
                      <td className="fs12" style={{ fontFamily: 'monospace' }}>
                        {r.customer_gstin || '—'}
                      </td>
                      <td className="fs12 t2">{r.customer_state || '—'}</td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {inr(r.taxable_value)}
                      </td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {inr(r.cgst_amount)}
                      </td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {inr(r.sgst_amount)}
                      </td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {inr(r.igst_amount)}
                      </td>
                      <td
                        style={{
                          textAlign: 'right',
                          fontWeight: 600,
                          fontVariantNumeric: 'tabular-nums'
                        }}
                      >
                        {inr(r.grand_total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#F8FAFC', fontWeight: 700 }}>
                    <td colSpan={5} style={{ padding: '10px 16px' }}>
                      Total
                    </td>
                    <td
                      style={{
                        padding: '10px 16px',
                        textAlign: 'right',
                        fontVariantNumeric: 'tabular-nums'
                      }}
                    >
                      {inr(gstr1Rows.reduce((s, r) => s + Number(r.taxable_value), 0))}
                    </td>
                    <td
                      style={{
                        padding: '10px 16px',
                        textAlign: 'right',
                        fontVariantNumeric: 'tabular-nums'
                      }}
                    >
                      {inr(gstr1Rows.reduce((s, r) => s + Number(r.cgst_amount), 0))}
                    </td>
                    <td
                      style={{
                        padding: '10px 16px',
                        textAlign: 'right',
                        fontVariantNumeric: 'tabular-nums'
                      }}
                    >
                      {inr(gstr1Rows.reduce((s, r) => s + Number(r.sgst_amount), 0))}
                    </td>
                    <td
                      style={{
                        padding: '10px 16px',
                        textAlign: 'right',
                        fontVariantNumeric: 'tabular-nums'
                      }}
                    >
                      {inr(gstr1Rows.reduce((s, r) => s + Number(r.igst_amount), 0))}
                    </td>
                    <td
                      style={{
                        padding: '10px 16px',
                        textAlign: 'right',
                        fontVariantNumeric: 'tabular-nums'
                      }}
                    >
                      {inr(gstr1Rows.reduce((s, r) => s + Number(r.grand_total), 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── HSN Summary ── */}
      {tab === 'hsn' && loaded && (
        <div className="card" style={{ animation: 'fadeUp 0.3s ease' }}>
          <div className="card-hdr">
            <span className="card-title">
              HSN Summary — {MONTHS[month - 1]} {year}
            </span>
            <span className="fs12 t3 fw6">{hsnRows.length} HSN Code(s)</span>
          </div>
          <div className="tbl-wrap">
            {hsnRows.length === 0 ? (
              <div className="empty">
                <div className="empty-text">No HSN data for this period.</div>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>HSN Code</th>
                    <th>Product / Service</th>
                    <th style={{ textAlign: 'right' }}>Total Qty</th>
                    <th style={{ textAlign: 'right' }}>Taxable Value</th>
                    <th style={{ textAlign: 'right' }}>CGST</th>
                    <th style={{ textAlign: 'right' }}>SGST</th>
                    <th style={{ textAlign: 'right' }}>IGST</th>
                    <th style={{ textAlign: 'right' }}>Grand Total</th>
                  </tr>
                </thead>
                <tbody>
                  {hsnRows.map((r) => (
                    <tr key={r.hsn_code || r.product_name}>
                      <td>
                        {r.hsn_code ? (
                          <span className="badge badge-blue" style={{ fontFamily: 'monospace' }}>
                            {r.hsn_code}
                          </span>
                        ) : (
                          <span className="t3 fs12">—</span>
                        )}
                      </td>
                      <td style={{ fontWeight: 500 }}>{r.product_name}</td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {Number(r.total_qty).toFixed(2)}
                      </td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {inr(r.taxable_value)}
                      </td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {inr(r.cgst)}
                      </td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {inr(r.sgst)}
                      </td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {inr(r.igst)}
                      </td>
                      <td
                        style={{
                          textAlign: 'right',
                          fontWeight: 600,
                          fontVariantNumeric: 'tabular-nums'
                        }}
                      >
                        {inr(r.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#F8FAFC', fontWeight: 700 }}>
                    <td colSpan={3} style={{ padding: '10px 16px' }}>
                      Total
                    </td>
                    <td
                      style={{
                        padding: '10px 16px',
                        textAlign: 'right',
                        fontVariantNumeric: 'tabular-nums'
                      }}
                    >
                      {inr(hsnRows.reduce((s, r) => s + Number(r.taxable_value), 0))}
                    </td>
                    <td
                      style={{
                        padding: '10px 16px',
                        textAlign: 'right',
                        fontVariantNumeric: 'tabular-nums'
                      }}
                    >
                      {inr(hsnRows.reduce((s, r) => s + Number(r.cgst), 0))}
                    </td>
                    <td
                      style={{
                        padding: '10px 16px',
                        textAlign: 'right',
                        fontVariantNumeric: 'tabular-nums'
                      }}
                    >
                      {inr(hsnRows.reduce((s, r) => s + Number(r.sgst), 0))}
                    </td>
                    <td
                      style={{
                        padding: '10px 16px',
                        textAlign: 'right',
                        fontVariantNumeric: 'tabular-nums'
                      }}
                    >
                      {inr(hsnRows.reduce((s, r) => s + Number(r.igst), 0))}
                    </td>
                    <td
                      style={{
                        padding: '10px 16px',
                        textAlign: 'right',
                        fontVariantNumeric: 'tabular-nums'
                      }}
                    >
                      {inr(hsnRows.reduce((s, r) => s + Number(r.total), 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </div>
      )}
    </>
  )
}
