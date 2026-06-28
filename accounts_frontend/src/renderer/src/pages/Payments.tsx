// src/renderer/src/pages/Payments.tsx

import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Search,
  AlertCircle,
  CreditCard,
  Wallet,
  Building2,
  Smartphone,
  FileCheck,
  Plus,
  X,
  Calendar,
  Edit3
} from 'lucide-react'
import client from '../api/client'
import { parseApiError } from '../utils/errorHelper'

interface Payment {
  payment_id: number
  customer_id: number
  customer_name: string
  payment_date: string
  payment_method: string
  reference_number: string
  amount: number | string
  notes: string
}

interface CustomerInfo {
  customer_id: number
  customer_name: string
  mobile?: string
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
    IMPS:   { icon: <Building2 size={12} />, cls: 'badge-blue',   label: 'IMPS'   },
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

  const queryClient = useQueryClient()
  const [showRecordModal, setShowRecordModal] = useState(false)
  const [editPaymentId, setEditPaymentId] = useState<number | null>(null)
  const [recordForm, setRecordForm] = useState({
    customer_id: '',
    amount: '',
    payment_date: new Date().toISOString().slice(0, 10),
    payment_method: 'IMPS',
    reference_number: '',
    notes: ''
  })
  const [recordError, setRecordError] = useState<React.ReactNode>('')
  const [recordFieldErrors, setRecordFieldErrors] = useState<Record<string, string[]>>({})

  const resetRecordForm = () => {
    setRecordForm({
      customer_id: '',
      amount: '',
      payment_date: new Date().toISOString().slice(0, 10),
      payment_method: 'IMPS',
      reference_number: '',
      notes: ''
    })
    setRecordError('')
    setRecordFieldErrors({})
    setShowRecordModal(false)
    setEditPaymentId(null)
  }

  const { data: dropdownCustomersData } = useQuery({
    queryKey: ['customersDropdown'],
    queryFn: async () => {
      const res = await client.get('/customers/?search=')
      return (res.data.data.customers || []) as CustomerInfo[]
    },
    enabled: showRecordModal
  })
  const customers = dropdownCustomersData || []

  const createPaymentMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await client.post('/payments/', payload)
      return res.data
    },
    onSuccess: () => {
      resetRecordForm()
      queryClient.invalidateQueries({ queryKey: ['payments'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['ledgerEntries'] })
      queryClient.invalidateQueries({ queryKey: ['ledgerOutstanding'] })
    },
    onError: (err: any) => {
      const { formError, fieldErrors } = parseApiError(err, 'Error recording payment.')
      setRecordError(formError)
      setRecordFieldErrors(fieldErrors)
    }
  })

  const updatePaymentMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: any }) => {
      const res = await client.put(`/payments/${id}/`, payload)
      return res.data
    },
    onSuccess: () => {
      resetRecordForm()
      queryClient.invalidateQueries({ queryKey: ['payments'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['ledgerEntries'] })
      queryClient.invalidateQueries({ queryKey: ['ledgerOutstanding'] })
    },
    onError: (err: any) => {
      const { formError, fieldErrors } = parseApiError(err, 'Error updating payment.')
      setRecordError(formError)
      setRecordFieldErrors(fieldErrors)
    }
  })

  const openEdit = (p: Payment) => {
    setRecordForm({
      customer_id: String(p.customer_id),
      amount: String(p.amount),
      payment_date: p.payment_date,
      payment_method: p.payment_method,
      reference_number: p.reference_number || '',
      notes: p.notes || ''
    })
    setEditPaymentId(p.payment_id)
    setRecordError('')
    setRecordFieldErrors({})
    setShowRecordModal(true)
  }

  const handleRecordSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!recordForm.customer_id) {
      setRecordError('Please select a customer.')
      return
    }
    if (!recordForm.amount || Number(recordForm.amount) <= 0) {
      setRecordError('Enter a valid amount.')
      return
    }
    setRecordError('')
    setRecordFieldErrors({})
    if (editPaymentId !== null) {
      updatePaymentMutation.mutate({ id: editPaymentId, payload: recordForm })
    } else {
      createPaymentMutation.mutate(recordForm)
    }
  }

  const filtered = payments.filter((p) => {
    const q = search.toLowerCase()
    const matchSearch =
      !search ||
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
    ['UPI', 'CHEQUE', 'CARD', 'IMPS'].includes(p.payment_method)
  ).length

  return (
    <>
      <div className="page-hdr">
        <div>
          <div className="page-title">Payment History</div>
          <div className="page-sub">
            All recorded payments across customer accounts. Record customer lump-sum payments directly.
          </div>
        </div>
        <div className="page-hdr-actions">
          <button className="btn btn-primary" onClick={() => { setEditPaymentId(null); setShowRecordModal(true); }}>
            <Plus size={15} /> Record Payment
          </button>
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
              <option value="IMPS">IMPS</option>
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
                Record a customer payment using the Record Payment button above.
              </div>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Customer</th>
                  <th>Date</th>
                  <th>Method</th>
                  <th>Reference</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                  <th>Notes</th>
                  <th style={{ textAlign: 'right', width: 60 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.payment_id}>
                    <td className="t3 fs12">{p.payment_id}</td>
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
                    <td>
                      <div className="row gap-2 jc-end" style={{ paddingRight: 4 }}>
                        <button
                          className="btn btn-ghost btn-sm btn-icon"
                          onClick={() => openEdit(p)}
                          title="Edit"
                        >
                          <Edit3 size={13} />
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
      
      {/* ── Record Payment Modal ── */}
      {showRecordModal && (
        <div className="overlay">
          <div className="modal modal-sm" style={{ width: 440 }}>
            <div className="modal-hdr">
              <span className="modal-title">{editPaymentId ? 'Edit Payment' : 'Record Payment'}</span>
              <button className="modal-close-btn" onClick={resetRecordForm}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleRecordSubmit}>
              <div className="modal-body">
                {recordError && (
                  <div className="login-err" style={{ marginBottom: 12, alignItems: 'flex-start' }}>
                    <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
                    <div style={{ flex: 1 }}>{recordError}</div>
                  </div>
                )}
                <div className="fgrp">
                  <label className="flabel">Customer *</label>
                  <select
                    className={`finput ${recordFieldErrors.customer_id?.length ? 'err' : ''}`}
                    value={recordForm.customer_id}
                    onChange={(e) => setRecordForm({ ...recordForm, customer_id: e.target.value })}
                  >
                    <option value="">— Select Customer —</option>
                    {customers.map((c) => (
                      <option key={c.customer_id} value={c.customer_id}>
                        {c.customer_name}
                      </option>
                    ))}
                  </select>
                  {recordFieldErrors.customer_id?.map((errMsg, idx) => (
                    <div key={idx} className="ferr">{errMsg}</div>
                  ))}
                </div>
                <div className="fgrid2">
                  <div className="fgrp">
                    <label className="flabel">Amount (₹) *</label>
                    <input
                      className={`finput ${recordFieldErrors.amount?.length ? 'err' : ''}`}
                      type="number"
                      step="0.0001"
                      min="0.0001"
                      value={recordForm.amount}
                      onChange={(e) => setRecordForm({ ...recordForm, amount: e.target.value })}
                      placeholder="0.00"
                    />
                    {recordFieldErrors.amount?.map((errMsg, idx) => (
                      <div key={idx} className="ferr">{errMsg}</div>
                    ))}
                  </div>
                  <div className="fgrp">
                    <label className="flabel">Payment Date *</label>
                    <div style={{ position: 'relative' }}>
                      <div
                        className={`finput ${recordFieldErrors.payment_date?.length ? 'err' : ''}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          pointerEvents: 'none'
                        }}
                      >
                        <span>{recordForm.payment_date ? fmt(recordForm.payment_date) : 'dd/mm/yyyy'}</span>
                        <Calendar size={15} style={{ color: 'var(--t3)' }} />
                      </div>
                      <input
                        type="date"
                        required
                        value={recordForm.payment_date}
                        onChange={(e) => setRecordForm({ ...recordForm, payment_date: e.target.value })}
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
                    {recordFieldErrors.payment_date?.map((errMsg, idx) => (
                      <div key={idx} className="ferr">{errMsg}</div>
                    ))}
                  </div>
                </div>
                <div className="fgrid2">
                  <div className="fgrp">
                    <label className="flabel">Payment Method</label>
                    <select
                      className={`finput ${recordFieldErrors.payment_method?.length ? 'err' : ''}`}
                      value={recordForm.payment_method}
                      onChange={(e) => setRecordForm({ ...recordForm, payment_method: e.target.value })}
                    >
                      <option value="NEFT">NEFT</option>
                      <option value="RTGS">RTGS</option>
                      <option value="IMPS">IMPS</option>
                      <option value="CHEQUE">Cheque</option>
                      <option value="UPI">UPI</option>
                      <option value="CASH">Cash</option>
                      <option value="CARD">Card</option>
                    </select>
                    {recordFieldErrors.payment_method?.map((errMsg, idx) => (
                      <div key={idx} className="ferr">{errMsg}</div>
                    ))}
                  </div>
                  <div className="fgrp">
                    <label className="flabel">Reference / UTR</label>
                    <input
                      className={`finput ${recordFieldErrors.reference_number?.length ? 'err' : ''}`}
                      value={recordForm.reference_number}
                      onChange={(e) => setRecordForm({ ...recordForm, reference_number: e.target.value })}
                      placeholder="Optional ref. number"
                    />
                    {recordFieldErrors.reference_number?.map((errMsg, idx) => (
                      <div key={idx} className="ferr">{errMsg}</div>
                    ))}
                  </div>
                </div>
                <div className="fgrp">
                  <label className="flabel">Notes</label>
                  <input
                    className={`finput ${recordFieldErrors.notes?.length ? 'err' : ''}`}
                    value={recordForm.notes}
                    onChange={(e) => setRecordForm({ ...recordForm, notes: e.target.value })}
                    placeholder="Optional payment note"
                  />
                  {recordFieldErrors.notes?.map((errMsg, idx) => (
                    <div key={idx} className="ferr">{errMsg}</div>
                  ))}
                </div>
              </div>
              <div className="modal-ftr">
                <button type="button" className="btn btn-outline" onClick={resetRecordForm}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={createPaymentMutation.isPending || updatePaymentMutation.isPending}
                >
                  {editPaymentId
                    ? (updatePaymentMutation.isPending ? 'Updating...' : 'Update Payment')
                    : (createPaymentMutation.isPending ? 'Recording...' : 'Record Payment')
                  }
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
