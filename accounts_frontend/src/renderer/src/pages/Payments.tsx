// src/renderer/src/pages/Payments.tsx

import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Search,
  AlertCircle,
  CreditCard,
  Wallet,
  Building2,
  Smartphone,
  FileCheck
} from 'lucide-react'
import client from '../api/client'

interface Payment {
  payment_id: number
  invoice_id: number
  invoice_number: string
  customer_id: number
  customer_name: string
  payment_date: string
  payment_method: string
  reference_number: string
  amount: number | string
  notes: string
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

const MethodIcon = ({ method }: { method: string }) => {
  const map: Record<string, { icon: React.ReactNode; cls: string; label: string }> = {
    CASH:   { icon: <Wallet size={12} />,    cls: 'badge-green',  label: 'Cash'   },
    NEFT:   { icon: <Building2 size={12} />, cls: 'badge-blue',   label: 'NEFT'   },
    RTGS:   { icon: <Building2 size={12} />, cls: 'badge-blue',   label: 'RTGS'   },
    UPI:    { icon: <Smartphone size={12} />, cls: 'badge-yellow', label: 'UPI'   },
    CHEQUE: { icon: <FileCheck size={12} />, cls: 'badge-red',    label: 'Cheque' },
    CARD:   { icon: <CreditCard size={12} />, cls: 'badge-blue',  label: 'Card'  }
  }
  const m = map[method] || { icon: <CreditCard size={12} />, cls: 'badge-blue', label: method }
  return (
    <span
      className={`badge ${m.cls} row gap-1`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
    >
      {m.icon}
      {m.label}
    </span>
  )
}

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

export default function Payments() {
  const [search, setSearch] = useState('')
  const [method, setMethod] = useState('')
  const [fyFilter, setFyFilter] = useState(getCurrentFinancialYear())
  const [monthFilter, setMonthFilter] = useState<number>(new Date().getMonth() + 1)

  const { fromDate, toDate } = getFYDateRange(fyFilter, monthFilter)

  const { data: paymentsData, isLoading: loadingPayments, error: paymentsError } = useQuery({
    queryKey: ['payments', fromDate, toDate],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (fromDate) params.set('from_date', fromDate)
      if (toDate) params.set('to_date', toDate)
      const res = await client.get(`/payments/?${params}`)
      return (res.data.data.payments || []) as Payment[]
    }
  })

  const payments = paymentsData || []
  const loading = loadingPayments
  const error = paymentsError ? 'Failed to load payments.' : ''

  const filtered = payments.filter((p) => {
    const q = search.toLowerCase()
    const matchSearch =
      !search ||
      (p.invoice_number ?? '').toLowerCase().includes(q) ||
      (p.customer_name ?? '').toLowerCase().includes(q)
    const matchMethod = !method || p.payment_method === method
    return matchSearch && matchMethod
  })

  const totalReceived = filtered.reduce((sum, p) => {
    const n = Number(p.amount)
    return sum + (isNaN(n) ? 0 : n)
  }, 0)

  const cashNeftRtgsCount = filtered.filter((p) =>
    ['CASH', 'NEFT', 'RTGS'].includes(p.payment_method)
  ).length

  const digitalCount = filtered.filter((p) =>
    ['UPI', 'CHEQUE', 'CARD'].includes(p.payment_method)
  ).length

  return (
    <>
      <div className="page-hdr">
        <div>
          <div className="page-title">Payment History</div>
          <div className="page-sub">
            All recorded payments across invoices. Record payments from the Invoices page.
          </div>
        </div>
      </div>

      {/* Summary strip */}
      <div
        className="stats-grid"
        style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 20 }}
      >
        {[
          { label: 'Total Receipts', value: filtered.length, sub: 'filtered' },
          { label: 'Total Received', value: inr(totalReceived), sub: 'filtered sum' },
          {
            label: 'Cash / NEFT / RTGS',
            value: cashNeftRtgsCount,
            sub: 'transactions'
          },
          {
            label: 'UPI / Cheque / Card',
            value: digitalCount,
            sub: 'transactions'
          }
        ].map((s, i) => (
          <div key={i} className="stat-card" style={{ animationDelay: `${i * 0.05}s` }}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ fontSize: 22 }}>
              {s.value}
            </div>
            <div className="stat-sub">{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ animation: 'fadeUp 0.3s ease' }}>
        <div className="card-hdr" style={{ background: '#F8FAFC', flexWrap: 'wrap', gap: 10 }}>
          <div className="search-wrap">
            <Search size={15} className="search-icon" />
            <input
              className="search-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search invoice # or customer..."
              style={{ width: 280 }}
            />
          </div>
          <div className="row gap-2">
            <select
              className="finput"
              style={{ width: 160, padding: '7px 10px' }}
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
              style={{ width: 140, padding: '7px 10px' }}
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
            <select
              className="finput"
              style={{ width: 150, padding: '7px 10px' }}
              value={method}
              onChange={(e) => setMethod(e.target.value)}
            >
              <option value="">All Methods</option>
              <option value="CASH">Cash</option>
              <option value="NEFT">NEFT</option>
              <option value="RTGS">RTGS</option>
              <option value="UPI">UPI</option>
              <option value="CHEQUE">Cheque</option>
              <option value="CARD">Card</option>
            </select>
          </div>
          <span className="fs12 t3 fw6">{filtered.length} Payment(s)</span>
        </div>

        {error && (
          <div className="login-err" style={{ margin: '16px 20px 0' }}>
            <AlertCircle size={15} />
            {error}
          </div>
        )}

        <div className="tbl-wrap">
          {loading ? (
            <div className="loading">
              <div className="spinner" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="empty">
              <CreditCard size={40} className="empty-icon" />
              <div className="empty-text">No Payments Found</div>
              <div className="empty-sub">
                Payments are recorded from the Invoices page when you view an invoice.
              </div>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Invoice</th>
                  <th>Customer</th>
                  <th>Date</th>
                  <th>Method</th>
                  <th>Reference</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.payment_id}>
                    <td className="t3 fs12">{p.payment_id}</td>
                    <td>
                      <span
                        style={{
                          color: 'var(--primary)',
                          fontWeight: 600,
                          fontFamily: 'monospace',
                          fontSize: 13
                        }}
                      >
                        {p.invoice_number}
                      </span>
                    </td>
                    <td style={{ fontWeight: 500 }}>{p.customer_name}</td>
                    <td className="t2 fs12">{fmt(p.payment_date)}</td>
                    <td>
                      <MethodIcon method={p.payment_method} />
                    </td>
                    <td
                      className="t2 fs12"
                      style={{ fontFamily: p.reference_number ? 'monospace' : 'inherit' }}
                    >
                      {p.reference_number || '—'}
                    </td>
                    <td
                      style={{
                        textAlign: 'right',
                        fontWeight: 700,
                        color: 'var(--success)',
                        fontVariantNumeric: 'tabular-nums'
                      }}
                    >
                      {inr(p.amount)}
                    </td>
                    <td className="t3 fs12">{p.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  )
}
