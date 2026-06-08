// src/renderer/src/pages/Ledger.tsx

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, AlertCircle, BookOpen, TrendingDown, ChevronRight } from 'lucide-react'
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

const inr = (n: number | string | null | undefined) =>
  n == null
    ? '₹0.00'
    : '₹' +
      Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmt = (d: string) =>
  new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

type Tab = 'outstanding' | 'ledger'

export default function Ledger() {
  const [tab, setTab] = useState<Tab>('outstanding')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedCust, setSelectedCust] = useState<CustomerInfo | null>(null)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [submittedFromDate, setSubmittedFromDate] = useState('')
  const [submittedToDate, setSubmittedToDate] = useState('')

  // Debounce search changes
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search)
    }, 300)
    return () => clearTimeout(handler)
  }, [search])

  // Queries
  const { data: outstandingData, isLoading: outLoading, error: outErrorQuery } = useQuery({
    queryKey: ['ledgerOutstanding'],
    queryFn: async () => {
      const res = await client.get('/ledger/outstanding/')
      return (res.data.data.outstanding || []) as OutstandingRow[]
    },
    enabled: tab === 'outstanding'
  })

  const { data: customersData, isLoading: custLoading } = useQuery({
    queryKey: ['ledgerCustomers', debouncedSearch],
    queryFn: async () => {
      const res = await client.get(`/customers/?search=${debouncedSearch}`)
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
    setFromDate('')
    setToDate('')
    setSubmittedFromDate('')
    setSubmittedToDate('')
  }

  const handleFilter = () => {
    setSubmittedFromDate(fromDate)
    setSubmittedToDate(toDate)
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
    setFromDate('')
    setToDate('')
    setSubmittedFromDate('')
    setSubmittedToDate('')
  }

  const totalOutstanding = outstanding.reduce((s, r) => s + Number(r.outstanding), 0)
  const filteredCusts = customers.filter(
    (c) => !search || c.customer_name.toLowerCase().includes(search.toLowerCase())
  )
  const closingBalance = entries.length > 0
    ? Number(entries[entries.length - 1].running_balance)
    : openingBalance

  return (
    <>
      <div className="page-hdr">
        <div>
          <div className="page-title">Ledger & Outstanding</div>
          <div className="page-sub">
            Customer account statements, balance tracking, and receivables report.
          </div>
        </div>
      </div>

      {/* Tabs */}
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
            onClick={() => setTab(t)}
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

      {/* ── Tab: Outstanding ── */}
      {tab === 'outstanding' && (
        <>
          {/* Summary */}
          <div
            className="stats-grid"
            style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 20 }}
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
            <div className="stat-card">
              <div className="stat-label">Pending Invoices</div>
              <div className="stat-value" style={{ fontSize: 22 }}>
                {outstanding.reduce((s, r) => s + r.pending_invoices, 0)}
              </div>
              <div className="stat-sub">Awaiting settlement</div>
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
                      <th style={{ textAlign: 'right' }}>Pending Invoices</th>
                      <th style={{ textAlign: 'right' }}>Outstanding Amount</th>
                      <th style={{ textAlign: 'right', paddingRight: 20 }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outstanding
                      .sort((a, b) => Number(b.outstanding) - Number(a.outstanding))
                      .map((r) => (
                        <tr key={r.customer_id}>
                          <td style={{ fontWeight: 600 }}>{r.customer_name}</td>
                          <td className="t2 fs12">{r.mobile || '—'}</td>
                          <td style={{ textAlign: 'right' }}>
                            <span className="badge badge-yellow">
                              {r.pending_invoices} Invoice(s)
                            </span>
                          </td>
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

      {/* ── Tab: Customer Ledger ── */}
      {tab === 'ledger' && (
        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16 }}>
          {/* Left: customer list */}
          <div className="card" style={{ height: 'fit-content' }}>
            <div className="card-hdr" style={{ background: '#F8FAFC' }}>
              <span className="card-title">Customers</span>
            </div>
            <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
              <div className="search-wrap">
                <Search size={14} className="search-icon" />
                <input
                  className="search-input"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search customer..."
                  style={{ width: '100%' }}
                />
              </div>
            </div>
            <div style={{ maxHeight: 460, overflowY: 'auto' }}>
              {custLoading ? (
                <div className="loading" style={{ padding: 20 }}>
                  <div className="spinner spinner-sm" />
                </div>
              ) : filteredCusts.length === 0 ? (
                <div
                  style={{
                    padding: '20px 16px',
                    textAlign: 'center',
                    color: 'var(--t3)',
                    fontSize: 13
                  }}
                >
                  No customers
                </div>
              ) : (
                filteredCusts.map((c) => (
                  <div
                    key={c.customer_id}
                    onClick={() => selectCustomer(c)}
                    style={{
                      padding: '10px 16px',
                      cursor: 'pointer',
                      borderBottom: '1px solid var(--border)',
                      background:
                        selectedCust?.customer_id === c.customer_id
                          ? 'var(--primary-light)'
                          : 'transparent',
                      borderLeft:
                        selectedCust?.customer_id === c.customer_id
                          ? '3px solid var(--primary)'
                          : '3px solid transparent',
                      transition: 'background 0.1s'
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{c.customer_name}</div>
                    {c.mobile && (
                      <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>
                        {c.mobile}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right: entries */}
          <div>
            {!selectedCust ? (
              <div className="card">
                <div className="empty" style={{ padding: '80px 20px' }}>
                  <BookOpen size={40} className="empty-icon" />
                  <div className="empty-text">Select a Customer</div>
                  <div className="empty-sub">
                    Choose a customer from the left to view their ledger statement.
                  </div>
                </div>
              </div>
            ) : (
              <div className="card">
                {/* Header with date filters */}
                <div
                  className="card-hdr"
                  style={{ background: '#0B1426', flexWrap: 'wrap', gap: 10 }}
                >
                  <div>
                    <div className="card-title" style={{ color: '#fff' }}>
                      {selectedCust.customer_name}
                    </div>
                    {selectedCust.mobile && (
                      <div style={{ fontSize: 11, color: '#4A6080', marginTop: 2 }}>
                        {selectedCust.mobile}
                      </div>
                    )}
                  </div>
                  <div className="row gap-2">
                    <input
                      type="date"
                      className="finput"
                      value={fromDate}
                      onChange={(e) => setFromDate(e.target.value)}
                      style={{ width: 140, padding: '5px 8px', fontSize: 12 }}
                    />
                    <span className="t3 fs12" style={{ alignSelf: 'center' }}>
                      to
                    </span>
                    <input
                      type="date"
                      className="finput"
                      value={toDate}
                      onChange={(e) => setToDate(e.target.value)}
                      style={{ width: 140, padding: '5px 8px', fontSize: 12 }}
                    />
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={handleFilter}
                    >
                      Filter
                    </button>
                  </div>
                </div>

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
                          padding: '14px 20px',
                          background: '#F8FAFC',
                          borderTop: '2px solid var(--border)',
                          display: 'flex',
                          justifyContent: 'flex-end',
                          gap: 32,
                          fontSize: 13
                        }}
                      >
                        <div>
                          <span className="t2">Total Billed: </span>
                          <span style={{ fontWeight: 700, color: 'var(--danger)' }}>
                            {inr(entries.reduce((s, e) => s + Number(e.debit_amount), 0))}
                          </span>
                        </div>
                        <div>
                          <span className="t2">Total Received: </span>
                          <span style={{ fontWeight: 700, color: 'var(--success)' }}>
                            {inr(entries.reduce((s, e) => s + Number(e.credit_amount), 0))}
                          </span>
                        </div>
                        <div>
                          <span className="t2 fw6">Closing Balance: </span>
                          <span
                            style={{
                              fontWeight: 800,
                              fontSize: 15,
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
          </div>
        </div>
      )}
    </>
  )
}
