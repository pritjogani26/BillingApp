// src/renderer/src/pages/Ledger.tsx

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, AlertCircle, BookOpen, TrendingDown, ChevronRight, Calendar, Download, ArrowLeft } from 'lucide-react'
import client from '../api/client'

interface OutstandingRow {
  customer_id: number
  customer_name: string
  mobile: string
  outstanding: number | string
  pending_invoices: number
}

interface LedgerEntry {
  entry_id: number
  transaction_type: string
  reference_type: string
  reference_id: number
  transaction_date: string
  debit_amount: number | string
  credit_amount: number | string
  running_balance: number | string
  remarks: string
}

interface CustomerInfo {
  customer_id: number
  customer_name: string
  mobile: string
  city?: string
  state?: string
}

const inr = (n: number | string | null | undefined) => {
  if (n == null) return '₹0.00'
  const val = Number(n)
  if (isNaN(val)) return '₹0.00'
  return '₹' + val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const fmt = (d: string) => {
  if (!d) return ''
  const parsed = new Date(d)
  if (isNaN(parsed.getTime())) return d
  return parsed.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

const formatDateToDDMMYYYY = (d: string) => {
  if (!d) return ''
  const parts = d.split('-')
  if (parts.length !== 3) return d
  return `${parts[2]}/${parts[1]}/${parts[0]}`
}

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

const getCurrentFinancialYear = () => {
  const today = new Date()
  const year = today.getFullYear()
  const month = today.getMonth() + 1
  const fyStart = month >= 4 ? year : year - 1
  return `${fyStart}-${String(fyStart + 1).slice(-2)}`
}

const getFinancialYearsList = () => {
  const currentFY = getCurrentFinancialYear()
  const startYear = parseInt(currentFY.split('-')[0])
  return [
    `${startYear}-${String(startYear + 1).slice(-2)}`,
    `${startYear - 1}-${String(startYear).slice(-2)}`,
    `${startYear - 2}-${String(startYear - 1).slice(-2)}`
  ]
}

const getFYDateRange = (fy: string, month: number) => {
  const startYear = parseInt(fy.split('-')[0])
  if (month === 0) {
    const endYear = startYear + 1
    return {
      fromDate: `${startYear}-04-01`,
      toDate: `${endYear}-03-31`
    }
  } else {
    const year = month >= 4 ? startYear : startYear + 1
    const lastDay = new Date(year, month, 0).getDate()
    const monthStr = String(month).padStart(2, '0')
    return {
      fromDate: `${year}-${monthStr}-01`,
      toDate: `${year}-${monthStr}-${String(lastDay).padStart(2, '0')}`
    }
  }
}


const LEDGER_STYLES = `
.customer-item:hover {
  background: var(--primary-light, #EFF6FF) !important;
}
.customer-item-active:hover {
  background: var(--primary) !important;
}
.date-input-overlay::-webkit-calendar-picker-indicator {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  opacity: 0;
  cursor: pointer;
}
`

const buildLedgerPrintHTML = (
  company: any,
  customer: CustomerInfo,
  entries: LedgerEntry[],
  openingBal: number,
  totalBilled: number,
  totalReceived: number,
  closingBal: number,
  fromDate?: string,
  toDate?: string
) => {
  const dateStr = fromDate && toDate 
    ? `${formatDateToDDMMYYYY(fromDate)} to ${formatDateToDDMMYYYY(toDate)}` 
    : 'All Time'
  
  const printDate = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

  const formatCurrency = (val: number | string) => {
    const num = Number(val)
    if (isNaN(num)) return '₹0.00'
    return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  const entriesRows = entries.map(e => `
    <tr>
      <td>${formatDateToDDMMYYYY(e.transaction_date)}</td>
      <td class="cen-col"><span class="badge ${e.transaction_type === 'DEBIT' ? 'badge-debit' : 'badge-credit'}">${e.transaction_type}</span></td>
      <td class="cen-col"><span class="ref-text">${e.reference_type}-${e.reference_id}</span></td>
      <td>${e.remarks || '—'}</td>
      <td class="num-col amount-debit">${Number(e.debit_amount) > 0 ? formatCurrency(e.debit_amount) : '—'}</td>
      <td class="num-col amount-credit">${Number(e.credit_amount) > 0 ? formatCurrency(e.credit_amount) : '—'}</td>
      <td class="num-col fw600">${formatCurrency(e.running_balance)}</td>
    </tr>
  `).join('')

  return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Ledger Statement - ${customer.customer_name}</title>
<style>
  @page { size: A4 portrait; margin: 12mm 15mm; }
  body {
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 9pt;
    line-height: 1.5;
    color: #1e293b;
    background: #fff;
  }
  
  /* Header styling */
  .header-container {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 2px solid #3b82f6;
    padding-bottom: 16px;
    margin-bottom: 20px;
  }
  .company-title {
    font-size: 18pt;
    font-weight: 800;
    color: #0f172a;
    letter-spacing: -0.5px;
    margin-bottom: 4px;
  }
  .company-details {
    font-size: 8.5pt;
    color: #475569;
    line-height: 1.4;
  }
  .statement-title-box {
    text-align: right;
  }
  .statement-label {
    font-size: 14pt;
    font-weight: 800;
    color: #3b82f6;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
  }
  .print-date {
    font-size: 8.5pt;
    color: #64748b;
  }

  /* Customer & Meta Box Grid */
  .details-grid {
    display: grid;
    grid-template-columns: 1.5fr 1fr;
    gap: 20px;
    margin-bottom: 20px;
  }
  .info-card {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 12px 16px;
  }
  .card-label {
    font-size: 7.5pt;
    font-weight: 700;
    text-transform: uppercase;
    color: #64748b;
    letter-spacing: 0.5px;
    margin-bottom: 6px;
  }
  .customer-name {
    font-size: 12pt;
    font-weight: 700;
    color: #0f172a;
    margin-bottom: 4px;
  }
  .customer-meta {
    font-size: 8.5pt;
    color: #475569;
    line-height: 1.4;
  }
  .meta-item {
    display: flex;
    justify-content: space-between;
    font-size: 8.5pt;
    margin-bottom: 4px;
    color: #475569;
  }
  .meta-value {
    font-weight: 600;
    color: #0f172a;
  }

  /* Table styling */
  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 24px;
  }
  th {
    background: #f1f5f9;
    color: #334155;
    font-size: 8pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 8px 10px;
    border-top: 1px solid #cbd5e1;
    border-bottom: 2px solid #cbd5e1;
  }
  td {
    padding: 8px 10px;
    border-bottom: 1px solid #e2e8f0;
    font-size: 8.5pt;
    color: #334155;
    vertical-align: middle;
  }
  tr:nth-child(even) {
    background: #f8fafc;
  }
  .num-col {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .cen-col {
    text-align: center;
  }
  .fw600 {
    font-weight: 600;
  }
  .badge {
    display: inline-block;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 7.5pt;
    font-weight: 700;
  }
  .badge-debit {
    background: #fef2f2;
    color: #991b1b;
    border: 1px solid #fee2e2;
  }
  .badge-credit {
    background: #ecfdf5;
    color: #166534;
    border: 1px solid #dcfce7;
  }
  .badge-opening {
    background: #f1f5f9;
    color: #475569;
    border: 1px solid #e2e8f0;
  }
  .ref-text {
    font-family: Consolas, Monaco, monospace;
    font-size: 8pt;
    color: #2563eb;
    background: #eff6ff;
    padding: 1px 4px;
    border-radius: 3px;
  }
  .amount-debit {
    color: #b91c1c;
  }
  .amount-credit {
    color: #15803d;
  }

  /* Summary Footer Layout */
  .summary-section {
    display: flex;
    justify-content: flex-end;
    margin-top: 16px;
  }
  .summary-box {
    width: 320px;
    background: #f8fafc;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    padding: 12px 16px;
  }
  .summary-row {
    display: flex;
    justify-content: space-between;
    padding: 6px 0;
    font-size: 9pt;
    color: #475569;
    border-bottom: 1px dashed #e2e8f0;
  }
  .summary-row:last-of-type {
    border-bottom: none;
  }
  .summary-total-row {
    display: flex;
    justify-content: space-between;
    padding: 8px 0 2px;
    font-size: 10.5pt;
    font-weight: 800;
    color: #0f172a;
    border-top: 1.5px solid #cbd5e1;
  }
  .total-debit-val {
    color: #b91c1c;
    font-weight: 700;
  }
  .total-credit-val {
    color: #15803d;
    font-weight: 700;
  }
</style>
</head>
<body>
  <div class="header-container">
    <div class="company-details">
      <div class="company-title">${company.company_name}</div>
      <div>${company.address || ''}</div>
      ${company.mobile ? `<div>Mobile: ${company.mobile}</div>` : ''}
      ${company.email ? `<div>Email: ${company.email}</div>` : ''}
      ${company.gstin ? `<div style="font-weight: 600; margin-top: 2px;">GSTIN: ${company.gstin}</div>` : ''}
    </div>
    <div class="statement-title-box">
      <div class="statement-label">Account Statement</div>
      <div class="print-date">Print Date: ${printDate}</div>
    </div>
  </div>
  
  <div class="details-grid">
    <div class="info-card">
      <div class="card-label">Statement For</div>
      <div class="customer-name">${customer.customer_name}</div>
      <div class="customer-meta">
        ${customer.mobile ? `<div>Mobile: ${customer.mobile}</div>` : ''}
        ${(customer.city || customer.state) ? `<div>Location: ${[customer.city, customer.state].filter(Boolean).join(', ')}</div>` : ''}
      </div>
    </div>
    <div class="info-card">
      <div class="card-label">Statement Overview</div>
      <div class="meta-item">
        <span>Period:</span>
        <span class="meta-value">${dateStr}</span>
      </div>
      <div class="meta-item">
        <span>Closing Balance:</span>
        <span class="meta-value" style="color: ${closingBal > 0 ? '#b91c1c' : '#15803d'}; font-weight: 700;">${formatCurrency(closingBal)}</span>
      </div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th class="cen-col">Type</th>
        <th class="cen-col">Reference</th>
        <th>Remarks</th>
        <th class="num-col">Debit</th>
        <th class="num-col">Credit</th>
        <th class="num-col">Balance</th>
      </tr>
    </thead>
    <tbody>
      ${fromDate ? `
        <tr style="background: #fafafa;">
          <td>${formatDateToDDMMYYYY(fromDate)}</td>
          <td class="cen-col"><span class="badge badge-opening">Opening</span></td>
          <td class="cen-col">—</td>
          <td style="color: #64748b; font-style: italic;">Opening Balance</td>
          <td class="num-col">—</td>
          <td class="num-col">—</td>
          <td class="num-col fw600">${formatCurrency(openingBal)}</td>
        </tr>
      ` : ''}
      ${entriesRows}
    </tbody>
  </table>

  <div class="summary-section">
    <div class="summary-box">
      ${fromDate ? `
        <div class="summary-row">
          <span>Opening Balance:</span>
          <span class="num-col fw600">${formatCurrency(openingBal)}</span>
        </div>
      ` : ''}
      <div class="summary-row">
        <span>Total Billed (Debit):</span>
        <span class="num-col total-debit-val">${formatCurrency(totalBilled)}</span>
      </div>
      <div class="summary-row">
        <span>Total Received (Credit):</span>
        <span class="num-col total-credit-val">${formatCurrency(totalReceived)}</span>
      </div>
      <div class="summary-total-row">
        <span>Closing Balance:</span>
        <span class="num-col" style="color: ${closingBal > 0 ? '#b91c1c' : '#15803d'};">${formatCurrency(closingBal)}</span>
      </div>
    </div>
  </div>
</body>
</html>
`
}

type Tab = 'outstanding' | 'ledger'

export default function Ledger() {
  const [tab, setTab] = useState<Tab>('outstanding')
  const [downloading, setDownloading] = useState(false)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedCust, setSelectedCust] = useState<CustomerInfo | null>(null)
  const [filterMode, setFilterMode] = useState<'monthly' | 'custom'>('monthly')
  const [fyFilter, setFyFilter] = useState(getCurrentFinancialYear())
  const [monthFilter, setMonthFilter] = useState<number>(new Date().getMonth() + 1)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [submittedFromDate, setSubmittedFromDate] = useState('')
  const [submittedToDate, setSubmittedToDate] = useState('')
  const [dateError, setDateError] = useState('')

  const changeTab = (t: Tab) => {
    setTab(t)
    setDateError('')
  }

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search)
    }, 300)
    return () => clearTimeout(handler)
  }, [search])

  const { data: outstandingData, isLoading: outLoading, error: outErrorQuery } = useQuery({
    queryKey: ['ledgerOutstanding'],
    queryFn: async () => {
      const res = await client.get('/ledger/outstanding/')
      return (res.data.data.outstanding || []) as OutstandingRow[]
    }
  })

  const { data: customersData, isLoading: custLoading } = useQuery({
    queryKey: ['ledgerCustomers', debouncedSearch],
    queryFn: async () => {
      const res = await client.get(`/customers/?search=${encodeURIComponent(debouncedSearch)}`)
      return (res.data.data.customers || []) as CustomerInfo[]
    },
    enabled: tab === 'ledger'
  })

  const { data: entriesData, isLoading: entriesLoading, error: entriesErrorQuery } = useQuery({
    queryKey: ['ledgerEntries', selectedCust?.customer_id, submittedFromDate, submittedToDate],
    queryFn: async () => {
      if (!selectedCust) return { entries: [], opening_balance: 0 }
      const params = new URLSearchParams()
      if (submittedFromDate) params.set('from_date', submittedFromDate)
      if (submittedToDate) params.set('to_date', submittedToDate)
      const res = await client.get(`/ledger/${selectedCust.customer_id}/?${params}`)
      return {
        entries: (res.data.data.entries || []) as LedgerEntry[],
        opening_balance: Number(res.data.data.opening_balance || 0)
      }
    },
    enabled: tab === 'ledger' && !!selectedCust
  })

  const outstanding = outstandingData || []
  const customers = customersData || []
  const entries = entriesData?.entries || []
  const openingBalance = entriesData?.opening_balance || 0

  const outError = outErrorQuery ? 'Failed to load outstanding.' : ''
  const entriesError = entriesErrorQuery ? 'Failed to load ledger entries.' : ''

  const selectCustomer = (cust: CustomerInfo) => {
    setSelectedCust(cust)
    setFilterMode('monthly')
    setFyFilter(getCurrentFinancialYear())
    const curMonth = new Date().getMonth() + 1
    setMonthFilter(curMonth)
    setFromDate('')
    setToDate('')
    
    const { fromDate: initFrom, toDate: initTo } = getFYDateRange(getCurrentFinancialYear(), curMonth)
    setSubmittedFromDate(initFrom)
    setSubmittedToDate(initTo)
    setDateError('')
  }

  const handleFilter = () => {
    if (filterMode === 'monthly') {
      const { fromDate: mFrom, toDate: mTo } = getFYDateRange(fyFilter, monthFilter)
      setSubmittedFromDate(mFrom)
      setSubmittedToDate(mTo)
      setDateError('')
    } else {
      if (fromDate && toDate && new Date(fromDate) > new Date(toDate)) {
        setDateError('From Date cannot be after To Date.')
        return
      }
      setDateError('')
      setSubmittedFromDate(fromDate)
      setSubmittedToDate(toDate)
    }
  }

  const drillDown = (row: OutstandingRow) => {
    setTab('ledger')
    setSearch(row.customer_name)
    const mock: CustomerInfo = {
      customer_id: row.customer_id,
      customer_name: row.customer_name,
      mobile: row.mobile
    }
    setSelectedCust(mock)
    setFilterMode('monthly')
    setFyFilter(getCurrentFinancialYear())
    const curMonth = new Date().getMonth() + 1
    setMonthFilter(curMonth)
    setFromDate('')
    setToDate('')
    
    const { fromDate: initFrom, toDate: initTo } = getFYDateRange(getCurrentFinancialYear(), curMonth)
    setSubmittedFromDate(initFrom)
    setSubmittedToDate(initTo)
    setDateError('')
  }

  const handleDownloadPDF = async () => {
    if (!selectedCust || downloading) return
    setDownloading(true)
    try {
      const coRes = await client.get('/company/profile/')
      const company = coRes.data.data

      const htmlContent = buildLedgerPrintHTML(
        company,
        selectedCust,
        entries,
        openingBalance,
        totalBilled,
        totalReceived,
        closingBalance,
        submittedFromDate,
        submittedToDate
      )
      
      const filename = `${selectedCust.customer_name.replace(/\s+/g, '_')}_ledger.pdf`
      
      if (window.electronAPI?.saveInvoicePDF) {
        const result = await window.electronAPI.saveInvoicePDF(htmlContent, filename)
        if (result && !result.success && result.reason !== 'cancelled') {
          alert(`PDF save failed: ${result.reason}`)
        }
      } else {
        const w = window.open('', '_blank')
        if (w) {
          w.document.open()
          w.document.write(htmlContent)
          w.document.close()
          w.focus()
          setTimeout(() => w.print(), 500)
        }
      }
    } catch (e: any) {
      alert('PDF generation failed: ' + (e?.message || ''))
    } finally {
      setDownloading(false)
    }
  }

  const totalOutstanding = outstanding.reduce((s, r) => {
    const val = Number(r.outstanding)
    return s + (isNaN(val) ? 0 : val)
  }, 0)

  const filteredCusts = customers.filter(
    (c) => !search || c.customer_name.toLowerCase().includes(search.toLowerCase())
  )

  const totalBilled = entries.reduce((s, e) => {
    const val = Number(e.debit_amount)
    return s + (isNaN(val) ? 0 : val)
  }, 0)

  const totalReceived = entries.reduce((s, e) => {
    const val = Number(e.credit_amount)
    return s + (isNaN(val) ? 0 : val)
  }, 0)

  const closingBalance = entries.length > 0
    ? Number(entries[entries.length - 1].running_balance)
    : openingBalance

  return (
    <>
      <style>{LEDGER_STYLES}</style>
      <div className="page-hdr">
        <div>
          <div className="page-title">Ledger & Outstanding</div>
          <div className="page-sub">
            Customer account statements, balance tracking, and receivables report.
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 4,
          marginBottom: 20,
          borderBottom: '2px solid var(--border)',
          paddingBottom: 0
        }}
      >
        {(['outstanding', 'ledger'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => changeTab(t)}
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
            {t === 'outstanding' ? 'Outstanding Report' : 'Customer Ledger'}
          </button>
        ))}
      </div>

      {tab === 'outstanding' && (
        <>
          <div
            className="stats-grid"
            style={{ gridTemplateColumns: 'repeat(2, 1fr)', marginBottom: 20 }}
          >
            <div className="stat-card">
              <div className="stat-label">Total Outstanding</div>
              <div className="stat-value" style={{ fontSize: 22, color: 'var(--danger)' }}>
                {inr(totalOutstanding)}
              </div>
              <div className="stat-sub">Across all customers</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Customers With Balance</div>
              <div className="stat-value" style={{ fontSize: 22 }}>
                {outstanding.length}
              </div>
              <div className="stat-sub">Active accounts</div>
            </div>
          </div>

          <div className="card">
            <div className="card-hdr" style={{ background: '#F8FAFC' }}>
              <span className="card-title">Receivables — All Customers</span>
              <span className="fs12 t3 fw6">{outstanding.length} Customer(s)</span>
            </div>

            {outError && (
              <div className="login-err" style={{ margin: '16px 20px 0' }}>
                <AlertCircle size={15} />
                {outError}
              </div>
            )}

            <div className="tbl-wrap">
              {outLoading ? (
                <div className="loading">
                  <div className="spinner" />
                </div>
              ) : outstanding.length === 0 ? (
                <div className="empty">
                  <TrendingDown size={40} className="empty-icon" />
                  <div className="empty-text">No Outstanding Dues</div>
                  <div className="empty-sub">All customer accounts are settled. Great!</div>
                </div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Mobile</th>
                      <th style={{ textAlign: 'right' }}>Outstanding Amount</th>
                      <th style={{ textAlign: 'right', paddingRight: 20 }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...outstanding]
                      .sort((a, b) => Number(b.outstanding) - Number(a.outstanding))
                      .map((r) => (
                        <tr key={r.customer_id}>
                          <td 
                            style={{ fontWeight: 600, cursor: 'pointer', color: 'var(--primary)' }}
                            onClick={() => drillDown(r)}
                            title="Click to view detailed ledger"
                          >
                            {r.customer_name}
                          </td>
                          <td className="t2 fs12">{r.mobile || '—'}</td>

                          <td
                            style={{
                              textAlign: 'right',
                              fontWeight: 800,
                              color: 'var(--danger)',
                              fontVariantNumeric: 'tabular-nums',
                              fontSize: 14
                            }}
                          >
                            {inr(r.outstanding)}
                          </td>
                          <td>
                            <div className="row jc-end" style={{ paddingRight: 4 }}>
                              <button
                                className="btn btn-ghost btn-sm row gap-1"
                                onClick={() => drillDown(r)}
                                style={{ color: 'var(--primary)' }}
                              >
                                View Ledger <ChevronRight size={12} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}

      {tab === 'ledger' && (
        <>
          {!selectedCust ? (
            <div className="card" style={{ animation: 'fadeUp 0.3s ease' }}>
              <div
                className="card-hdr"
                style={{
                  background: '#F8FAFC',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 12,
                  borderBottom: '1px solid var(--border)'
                }}
              >
                <div>
                  <span className="card-title">Customer Ledger Directory</span>
                  <div className="fs12 t3 fw5" style={{ marginTop: 2 }}>
                    Select a customer to view their detailed account statement
                  </div>
                </div>
                <div
                  className="search-wrap"
                  style={{
                    background: '#fff',
                    border: '1px solid #CBD5E1',
                    borderRadius: '6px',
                    width: 300,
                    maxWidth: '100%'
                  }}
                >
                  <Search size={14} className="search-icon" style={{ color: '#64748B' }} />
                  <input
                    className="search-input"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by customer name or phone..."
                    style={{ width: '100%', fontSize: 13, border: 'none', padding: '6px 8px 6px 32px' }}
                  />
                </div>
              </div>

              <div className="tbl-wrap">
                {custLoading ? (
                  <div className="loading" style={{ padding: 40 }}>
                    <div className="spinner" />
                  </div>
                ) : filteredCusts.length === 0 ? (
                  <div className="empty" style={{ padding: '60px 20px' }}>
                    <Search size={40} className="empty-icon" />
                    <div className="empty-text">No Customers Found</div>
                    <div className="empty-sub">Try searching for a different name.</div>
                  </div>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th style={{ paddingLeft: 20 }}>Customer Name</th>
                        <th>Mobile</th>
                        <th>Location</th>
                        <th style={{ textAlign: 'right' }}>Outstanding Balance</th>
                        <th style={{ textAlign: 'right', paddingRight: 20 }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCusts.map((c) => {
                        const outstandingRow = outstandingData?.find(r => r.customer_id === c.customer_id)
                        const dueAmt = outstandingRow ? Number(outstandingRow.outstanding) : 0
                        const locationStr = [c.city, c.state].filter(Boolean).join(', ') || '—'

                        return (
                          <tr key={c.customer_id}>
                            <td style={{ paddingLeft: 20 }}>
                              <div className="row gap-2">
                                <div
                                  style={{
                                    width: 32,
                                    height: 32,
                                    borderRadius: '50%',
                                    background: 'var(--primary-light, #EFF6FF)',
                                    color: 'var(--primary)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontWeight: 700,
                                    fontSize: 12,
                                    textTransform: 'uppercase'
                                  }}
                                >
                                  {c.customer_name.charAt(0)}
                                </div>
                                <div
                                  style={{ fontWeight: 600, cursor: 'pointer', color: 'var(--primary)' }}
                                  onClick={() => selectCustomer(c)}
                                  title="View ledger"
                                >
                                  {c.customer_name}
                                </div>
                              </div>
                            </td>
                            <td className="t2 fs12">{c.mobile || '—'}</td>
                            <td className="t2 fs12">{locationStr}</td>
                            <td
                              style={{
                                textAlign: 'right',
                                fontWeight: 800,
                                color: dueAmt > 0 ? 'var(--danger)' : 'var(--success)',
                                fontVariantNumeric: 'tabular-nums',
                                fontSize: 14
                              }}
                            >
                              {inr(dueAmt)}
                            </td>
                            <td>
                              <div className="row jc-end" style={{ paddingRight: 20 }}>
                                <button
                                  className="btn btn-ghost btn-sm row gap-1"
                                  onClick={() => selectCustomer(c)}
                                  style={{ color: 'var(--primary)' }}
                                >
                                  View Ledger <ChevronRight size={12} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          ) : (
            <div className="card" style={{ animation: 'fadeUp 0.3s ease' }}>
              <div
                className="card-hdr"
                style={{
                  background: '#F8FAFC',
                  flexDirection: 'column',
                  alignItems: 'stretch',
                  gap: 12,
                  borderBottom: '1px solid var(--border)',
                  padding: '16px 20px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                  <div className="row gap-3" style={{ alignItems: 'center' }}>
                    <button
                      className="btn btn-ghost btn-sm row gap-1"
                      onClick={() => setSelectedCust(null)}
                      style={{ padding: '6px 10px', color: 'var(--t2)' }}
                    >
                      <ArrowLeft size={16} />
                      <span className="fs13 fw6">Back</span>
                    </button>
                    <div style={{ width: 1, height: 24, background: 'var(--border)' }} />
                    <div>
                      <div className="card-title" style={{ color: 'var(--t1)', fontWeight: 700 }}>
                        {selectedCust.customer_name}
                      </div>
                      {selectedCust.mobile && (
                        <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>
                          {selectedCust.mobile}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Mode Selector Segmented Control */}
                  <div className="row" style={{ background: '#E2E8F0', padding: 2, borderRadius: 8 }}>
                    <button
                      onClick={() => setFilterMode('monthly')}
                      className="btn btn-sm"
                      style={{
                        borderRadius: 6,
                        background: filterMode === 'monthly' ? '#fff' : 'transparent',
                        color: filterMode === 'monthly' ? 'var(--primary)' : 'var(--t2)',
                        boxShadow: filterMode === 'monthly' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                        fontWeight: 600,
                        fontSize: 12,
                        padding: '4px 12px'
                      }}
                    >
                      Monthly Filter
                    </button>
                    <button
                      onClick={() => setFilterMode('custom')}
                      className="btn btn-sm"
                      style={{
                        borderRadius: 6,
                        background: filterMode === 'custom' ? '#fff' : 'transparent',
                        color: filterMode === 'custom' ? 'var(--primary)' : 'var(--t2)',
                        boxShadow: filterMode === 'custom' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                        fontWeight: 600,
                        fontSize: 12,
                        padding: '4px 12px'
                      }}
                    >
                      Custom Date Range
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                  <div className="row gap-2">
                    {filterMode === 'monthly' ? (
                      <>
                        <select
                          className="finput"
                          style={{ width: 140, padding: '5px 10px', fontSize: 12, height: 28 }}
                          value={fyFilter}
                          onChange={(e) => setFyFilter(e.target.value)}
                        >
                          {getFinancialYearsList().map((fy) => (
                            <option key={fy} value={fy}>
                              FY - {fy}
                            </option>
                          ))}
                        </select>
                        <select
                          className="finput"
                          style={{ width: 130, padding: '5px 10px', fontSize: 12, height: 28 }}
                          value={monthFilter}
                          onChange={(e) => setMonthFilter(Number(e.target.value))}
                        >
                          <option value="0">All Months</option>
                          {MONTHS.map((m, i) => (
                            <option key={i} value={i + 1}>
                              {m}
                            </option>
                          ))}
                        </select>
                      </>
                    ) : (
                      <>
                        <Calendar size={14} className="t3" style={{ alignSelf: 'center' }} />
                        <div style={{ position: 'relative', width: 120 }}>
                          <div
                            className="finput"
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              pointerEvents: 'none',
                              padding: '5px 8px',
                              fontSize: 12,
                              height: '28px',
                              lineHeight: '28px',
                              boxSizing: 'border-box'
                            }}
                          >
                            <span>{fromDate ? formatDateToDDMMYYYY(fromDate) : 'dd/mm/yyyy'}</span>
                          </div>
                          <input
                            type="date"
                            className="date-input-overlay"
                            value={fromDate}
                            onChange={(e) => setFromDate(e.target.value)}
                            onClick={(e) => {
                              try {
                                (e.currentTarget as any).showPicker()
                              } catch (err) {}
                            }}
                            style={{
                              position: 'absolute',
                              top: 0,
                              left: 0,
                              width: '100%',
                              height: '100%',
                              opacity: 0,
                              cursor: 'pointer'
                            }}
                          />
                        </div>
                        <span className="t3 fs12" style={{ alignSelf: 'center' }}>
                          to
                        </span>
                        <div style={{ position: 'relative', width: 120 }}>
                          <div
                            className="finput"
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              pointerEvents: 'none',
                              padding: '5px 8px',
                              fontSize: 12,
                              height: '28px',
                              lineHeight: '28px',
                              boxSizing: 'border-box'
                            }}
                          >
                            <span>{toDate ? formatDateToDDMMYYYY(toDate) : 'dd/mm/yyyy'}</span>
                          </div>
                          <input
                            type="date"
                            className="date-input-overlay"
                            value={toDate}
                            onChange={(e) => setToDate(e.target.value)}
                            onClick={(e) => {
                              try {
                                (e.currentTarget as any).showPicker()
                              } catch (err) {}
                            }}
                            style={{
                              position: 'absolute',
                              top: 0,
                              left: 0,
                              width: '100%',
                              height: '100%',
                              opacity: 0,
                              cursor: 'pointer'
                            }}
                          />
                        </div>
                      </>
                    )}
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={handleFilter}
                    >
                      Filter
                    </button>
                  </div>

                  <button
                    className="btn btn-outline btn-sm row gap-1"
                    onClick={handleDownloadPDF}
                    disabled={downloading}
                    style={{
                      padding: '6px 12px',
                      fontSize: 12,
                      borderColor: 'var(--primary)',
                      color: 'var(--primary)'
                    }}
                  >
                    {downloading ? (
                      <div className="spinner spinner-sm" style={{ borderTopColor: 'var(--primary)' }} />
                    ) : (
                      <Download size={13} />
                    )}
                    Download PDF
                  </button>
                </div>
              </div>

              {dateError && (
                <div className="login-err" style={{ margin: '16px 20px 0' }}>
                  <AlertCircle size={15} />
                  {dateError}
                </div>
              )}

              {entriesError && (
                <div className="login-err" style={{ margin: '16px 20px 0' }}>
                  <AlertCircle size={15} />
                  {entriesError}
                </div>
              )}

              <div className="tbl-wrap">
                {entriesLoading ? (
                  <div className="loading">
                    <div className="spinner" />
                  </div>
                ) : entries.length === 0 ? (
                  <div className="empty">
                    <BookOpen size={36} className="empty-icon" />
                    <div className="empty-text">No Ledger Entries</div>
                    <div className="empty-sub">
                      No transactions found for this customer in the selected period.
                    </div>
                  </div>
                ) : (
                  <>
                    <table>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Type</th>
                          <th>Reference</th>
                          <th>Remarks</th>
                          <th style={{ textAlign: 'right' }}>Debit</th>
                          <th style={{ textAlign: 'right' }}>Credit</th>
                          <th style={{ textAlign: 'right' }}>Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {submittedFromDate && (
                          <tr>
                            <td className="fs12 t2" style={{ whiteSpace: 'nowrap' }}>
                              {fmt(submittedFromDate)}
                            </td>
                            <td>
                              <span className="badge badge-gray">Opening</span>
                            </td>
                            <td>—</td>
                            <td className="t2 fs12">Opening Balance</td>
                            <td style={{ textAlign: 'right' }}>—</td>
                            <td style={{ textAlign: 'right' }}>—</td>
                            <td
                              style={{
                                textAlign: 'right',
                                fontWeight: 700,
                                fontVariantNumeric: 'tabular-nums',
                                color:
                                  openingBalance > 0
                                    ? 'var(--danger)'
                                    : 'var(--success)'
                              }}
                            >
                              {inr(openingBalance)}
                            </td>
                          </tr>
                        )}
                        {entries.map((e) => (
                          <tr key={e.entry_id}>
                            <td className="fs12 t2" style={{ whiteSpace: 'nowrap' }}>
                              {fmt(e.transaction_date)}
                            </td>
                            <td>
                              <span
                                className={`badge ${e.transaction_type === 'DEBIT' ? 'badge-red' : 'badge-green'}`}
                              >
                                {e.transaction_type === 'DEBIT' ? '↑ Debit' : '↓ Credit'}
                              </span>
                            </td>
                            <td>
                              <span
                                className="badge badge-blue"
                                style={{ fontFamily: 'monospace', fontSize: 11 }}
                              >
                                {e.reference_type}-{e.reference_id}
                              </span>
                            </td>
                            <td className="t2 fs12">{e.remarks || '—'}</td>
                            <td
                              style={{
                                textAlign: 'right',
                                fontVariantNumeric: 'tabular-nums',
                                color: Number(e.debit_amount) > 0 ? 'var(--danger)' : 'var(--t3)'
                              }}
                            >
                              {Number(e.debit_amount) > 0 ? inr(e.debit_amount) : '—'}
                            </td>
                            <td
                              style={{
                                textAlign: 'right',
                                fontVariantNumeric: 'tabular-nums',
                                color:
                                  Number(e.credit_amount) > 0 ? 'var(--success)' : 'var(--t3)'
                              }}
                            >
                              {Number(e.credit_amount) > 0 ? inr(e.credit_amount) : '—'}
                            </td>
                            <td
                              style={{
                                textAlign: 'right',
                                fontWeight: 700,
                                fontVariantNumeric: 'tabular-nums',
                                color:
                                  Number(e.running_balance) > 0
                                    ? 'var(--danger)'
                                    : 'var(--success)'
                              }}
                            >
                              {inr(e.running_balance)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* Summary footer */}
                    <div
                      style={{
                        padding: '16px 24px',
                        background: '#F8FAFC',
                        borderTop: '2px solid var(--border)',
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: 20,
                        textAlign: 'center'
                      }}
                    >
                      <div style={{ borderRight: '1px solid var(--border)', padding: '4px 0' }}>
                        <span className="t2" style={{ display: 'block', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Total Billed</span>
                        <span style={{ fontWeight: 800, fontSize: 18, color: 'var(--danger)' }}>
                          {inr(totalBilled)}
                        </span>
                      </div>
                      <div style={{ borderRight: '1px solid var(--border)', padding: '4px 0' }}>
                        <span className="t2" style={{ display: 'block', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Total Received</span>
                        <span style={{ fontWeight: 800, fontSize: 18, color: 'var(--success)' }}>
                          {inr(totalReceived)}
                        </span>
                      </div>
                      <div style={{ padding: '4px 0' }}>
                        <span className="t2" style={{ display: 'block', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Closing Balance</span>
                        <span
                          style={{
                            fontWeight: 900,
                            fontSize: 18,
                            color: closingBalance > 0 ? 'var(--danger)' : 'var(--success)'
                          }}
                        >
                          {inr(closingBalance)}
                        </span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </>
  )
}
