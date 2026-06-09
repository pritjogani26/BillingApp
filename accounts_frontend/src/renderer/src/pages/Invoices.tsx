// src/renderer/src/pages/Invoices.tsx

import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Plus, Eye, Edit, X, AlertCircle, FileText, Trash2, CreditCard, Printer, Download } from 'lucide-react'
import client from '../api/client'
import InvoicePrint from './InvoicePrint'
import { parseApiError } from '../utils/errorHelper'

/* ── Types ─────────────────────────────────────────── */
interface Customer {
  customer_id: number
  customer_name: string
  gstin?: string
  state?: string
}
interface Product {
  product_id: number
  product_name: string
  unit_price: number | string
  gst_percentage: number | string
  hsn_code?: string
  customer_id?: number | null
}

interface InvoiceItem {
  item_id?: number
  product_id: number
  product_name?: string
  hsn_code?: string
  quantity: string
  unit_price: string
  gst_percentage: string
  taxable_amount?: number | string
  cgst_amount?: number | string
  sgst_amount?: number | string
  igst_amount?: number | string
  total_amount?: number | string
}

interface Invoice {
  invoice_id: number
  company_id: number
  invoice_number: string
  invoice_type: string
  invoice_date: string
  customer_id: number
  customer_name: string
  customer_mobile?: string
  subtotal: number | string
  cgst_amount: number | string
  sgst_amount: number | string
  igst_amount: number | string
  discount_amount: number | string
  grand_total: number | string
  due_amount: number | string
  payment_status: string
  notes?: string
  items?: InvoiceItem[]
  contact_person?: string
  customer_address?: string
  customer_city?: string
  customer_state?: string
  customer_gstin?: string
}

/* ── Helpers ───────────────────────────────────────── */
const inr = (n: number | string | null | undefined) => {
  if (n == null) return '₹0.00'
  const val = Number(n)
  if (isNaN(val)) return '₹0.00'
  return '₹' + val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const fmtVal = (n: number | string | null | undefined) => {
  if (n == null) return '0.00'
  const val = Number(n)
  if (isNaN(val)) return '0.00'
  return val.toFixed(2)
}

const fmt = (d: string) => {
  if (!d) return ''
  const parsed = new Date(d)
  if (isNaN(parsed.getTime())) return d
  return parsed.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

const statusBadge = (s: string) => {
  if (s === 'PAID') return <span className="badge badge-green">Paid</span>
  if (s === 'PARTIAL') return <span className="badge badge-yellow">Partial</span>
  return <span className="badge badge-red">Pending</span>
}

const emptyItem = (): InvoiceItem => ({
  product_id: 0,
  product_name: '',
  quantity: '1',
  unit_price: '0',
  gst_percentage: '18',
  hsn_code: '94054090'
})

const getInitialCform = () => ({
  customer_id: '',
  invoice_type: 'TAX',
  invoice_date: new Date().toISOString().slice(0, 10),
  discount_amount: '0',
  notes: ''
})

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

/* ── Component ─────────────────────────────────────── */
export default function Invoices() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatus] = useState('')
  const [typeFilter, setType] = useState('')

  // Modals
  const [showCreate, setShowCreate] = useState(false)
  const [showDetail, setShowDetail] = useState(false)
  const [activeInvoiceId, setActiveInvoiceId] = useState<number | null>(null)

  // Print / PDF preview
  const [printInvId, setPrintInvId] = useState<number | null>(null)
  // Direct download (no modal)
  const [downloadInvId, setDownloadInvId] = useState<number | null>(null)

  // Payment modal
  const [showPay, setShowPay] = useState(false)
  const [payForm, setPayForm] = useState({
    amount: '',
    payment_date: '',
    payment_method: 'CASH',
    reference_number: '',
    notes: ''
  })
  const [payError, setPayError] = useState<React.ReactNode>('')
  const [payFieldErrors, setPayFieldErrors] = useState<Record<string, string[]>>({})

  // Create form
  const [cform, setCform] = useState(getInitialCform())
  const [items, setItems] = useState<InvoiceItem[]>([emptyItem()])
  const [cformError, setCformError] = useState<React.ReactNode>('')
  const [cfieldErrors, setCfieldErrors] = useState<Record<string, string[]>>({})
  const [editInvoiceId, setEditInvoiceId] = useState<number | null>(null)
  const [editInvoiceNumber, setEditInvoiceNumber] = useState<string>('')

  const [fyFilter, setFyFilter] = useState(getCurrentFinancialYear())
  const [monthFilter, setMonthFilter] = useState<number>(new Date().getMonth() + 1)

  const { fromDate, toDate } = getFYDateRange(fyFilter, monthFilter)

  // Queries
  const { data: invoicesData, isLoading: loadingInvoices, error: invoicesError } = useQuery({
    queryKey: ['invoices', statusFilter, typeFilter, fromDate, toDate],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (statusFilter) params.set('payment_status', statusFilter)
      if (typeFilter) params.set('invoice_type', typeFilter)
      if (fromDate) params.set('from_date', fromDate)
      if (toDate) params.set('to_date', toDate)
      const res = await client.get(`/invoices/?${params}`)
      return (res.data.data.invoices || []) as Invoice[]
    }
  })

  const { data: dropdownCustomersData } = useQuery({
    queryKey: ['customersDropdown'],
    queryFn: async () => {
      const res = await client.get('/customers/?search=')
      return (res.data.data.customers || []) as Customer[]
    },
    enabled: showCreate
  })

  const { data: dropdownProductsData } = useQuery({
    queryKey: ['productsDropdown'],
    queryFn: async () => {
      const res = await client.get('/products/?search=')
      return (res.data.data.products || []) as Product[]
    },
    enabled: showCreate
  })

  const { data: detailInvData, isLoading: detailLoading } = useQuery({
    queryKey: ['invoiceDetail', activeInvoiceId],
    queryFn: async () => {
      if (!activeInvoiceId) return null
      const res = await client.get(`/invoices/${activeInvoiceId}/`)
      return res.data.data as Invoice
    },
    enabled: !!activeInvoiceId
  })

  const invoices = invoicesData || []
  const loading = loadingInvoices
  const error = invoicesError ? 'Failed to load invoices.' : ''

  const customers = dropdownCustomersData || []
  const products = dropdownProductsData || []
  const detailInv = detailInvData || null

  // Mutations
  const createInvoiceMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await client.post('/invoices/', payload)
      return res.data
    },
    onSuccess: () => {
      setShowCreate(false)
      setCform(getInitialCform())
      setItems([emptyItem()])
      setCfieldErrors({})
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (err: any) => {
      const { formError, fieldErrors } = parseApiError(err, 'Error creating invoice.')
      setCformError(formError)
      setCfieldErrors(fieldErrors)
    }
  })

  const updateInvoiceMutation = useMutation({
    mutationFn: async ({ invoiceId, payload }: { invoiceId: number; payload: any }) => {
      const res = await client.put(`/invoices/${invoiceId}/`, payload)
      return res.data
    },
    onSuccess: () => {
      setShowCreate(false)
      setEditInvoiceId(null)
      setEditInvoiceNumber('')
      setCform(getInitialCform())
      setItems([emptyItem()])
      setCfieldErrors({})
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['invoiceDetail'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (err: any) => {
      const { formError, fieldErrors } = parseApiError(err, 'Error updating invoice.')
      setCformError(formError)
      setCfieldErrors(fieldErrors)
    }
  })

  const createPaymentMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await client.post('/payments/', payload)
      return res.data
    },
    onSuccess: () => {
      setShowPay(false)
      setShowDetail(false)
      setActiveInvoiceId(null)
      setPayFieldErrors({})
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (err: any) => {
      const { formError, fieldErrors } = parseApiError(err, 'Error recording payment.')
      setPayError(formError)
      setPayFieldErrors(fieldErrors)
    }
  })

  const cformLoading = createInvoiceMutation.isPending || updateInvoiceMutation.isPending
  const payLoading = createPaymentMutation.isPending

  /* Load dropdowns when create modal opens */
  const openCreate = () => {
    setEditInvoiceId(null)
    setEditInvoiceNumber('')
    setItems([emptyItem()])
    setCform(getInitialCform())
    setCformError('')
    setCfieldErrors({})
    setShowCreate(true)
  }

  const openEdit = async (inv: Invoice) => {
    setCformError('')
    setCfieldErrors({})
    try {
      const res = await client.get(`/invoices/${inv.invoice_id}/`)
      const data = res.data.data as Invoice
      
      setEditInvoiceId(inv.invoice_id)
      setEditInvoiceNumber(data.invoice_number)
      setCform({
        customer_id: String(data.customer_id),
        invoice_type: data.invoice_type,
        invoice_date: data.invoice_date,
        discount_amount: String(data.discount_amount),
        notes: data.notes || ''
      })
      setItems(data.items ? data.items.map(it => ({
        product_id: it.product_id || 0,
        product_name: it.product_name || '',
        quantity: String(it.quantity),
        unit_price: String(it.unit_price),
        gst_percentage: String(it.gst_percentage),
        hsn_code: it.hsn_code || ''
      })) : [emptyItem()])
      
      setShowCreate(true)
    } catch (err: any) {
      const { formError } = parseApiError(err, 'Failed to load invoice details for editing.')
      alert(formError || 'Failed to load invoice details.')
    }
  }

  /* View detail */
  const openDetail = (inv: Invoice) => {
    setActiveInvoiceId(inv.invoice_id)
    setShowDetail(true)
  }

  /* Item helpers */
  const updateItem = (idx: number, field: keyof InvoiceItem, val: string) => {
    setItems((prev) => {
      const next = [...prev]
      if (field === 'product_name') {
        const prod = products.find(
          (p) =>
            p.product_name.toLowerCase() === val.toLowerCase() &&
            String(p.customer_id) === String(cform.customer_id)
        )
        if (prod) {
          next[idx] = {
            ...next[idx],
            product_id: prod.product_id,
            product_name: prod.product_name,
            unit_price: String(prod.unit_price ?? 0),
            gst_percentage: String(prod.gst_percentage ?? 18),
            hsn_code: prod.hsn_code || ''
          }
        } else {
          next[idx] = {
            ...next[idx],
            product_id: 0,
            product_name: val
          }
        }
      } else {
        ; (next[idx] as any)[field] = val
      }
      return next
    })
  }
  const addItem = () => setItems((p) => [...p, emptyItem()])
  const removeItem = (idx: number) => setItems((p) => p.filter((_, i) => i !== idx))

  const calcLine = (it: InvoiceItem) => {
    const qty = Math.max(0, Number(it.quantity) || 0),
      up = Math.max(0, Number(it.unit_price) || 0),
      gst = cform.invoice_type === 'TAX' ? 18 : 0
    const taxable = qty * up
    const half = gst / 2
    const cgst = +((taxable * half) / 100).toFixed(2)
    const sgst = +((taxable * half) / 100).toFixed(2)
    return { taxable, cgst, sgst, igst: 0, total: taxable + cgst + sgst }
  }

  const totals = items.reduce(
    (acc, it) => {
      const c = calcLine(it)
      return {
        subtotal: acc.subtotal + c.taxable,
        cgst: acc.cgst + c.cgst,
        sgst: acc.sgst + c.sgst,
        total: acc.total + c.total
      }
    },
    { subtotal: 0, cgst: 0, sgst: 0, total: 0 }
  )
  const disc = Number(cform.discount_amount) || 0
  const grandTotal = Math.max(0, totals.total - disc)

  const gstRates = Array.from(new Set(items.map(it => {
    return (it.gst_percentage === '' || it.gst_percentage === undefined || it.gst_percentage === null) ? 18 : (Number(it.gst_percentage) || 0)
  })))
  const cgstLabel = gstRates.length === 1 ? `CGST (${gstRates[0] / 2}%)` : 'CGST'
  const sgstLabel = gstRates.length === 1 ? `SGST (${gstRates[0] / 2}%)` : 'SGST'

  const getDetailGstRates = () => {
    if (!detailInv || !detailInv.items) return []
    return Array.from(new Set(detailInv.items.map(it => Number(it.gst_percentage) || 0)))
  }
  const detailGstRates = getDetailGstRates()
  const detailCgstLabel = detailGstRates.length === 1 ? `CGST (${detailGstRates[0] / 2}%)` : 'CGST'
  const detailSgstLabel = detailGstRates.length === 1 ? `SGST (${detailGstRates[0] / 2}%)` : 'SGST'
  const detailIgstLabel = detailGstRates.length === 1 ? `IGST (${detailGstRates[0]}%)` : 'IGST'

  /* Submit create */
  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    if (!cform.customer_id) {
      setCformError('Please select a customer.')
      return
    }
    if (items.length === 0) {
      setCformError('Please add at least one line item.')
      return
    }
    if (items.some((it) => !it.product_name?.trim())) {
      setCformError('Please enter a product name or select a product for all line items.')
      return
    }
    setCformError('')
    const payload = {
      ...cform,
      subtotal: totals.subtotal.toFixed(2),
      grand_total: grandTotal.toFixed(2),
      items: items.map((it) => ({
        product_id: it.product_id ? it.product_id : null,
        product_name: it.product_name,
        quantity: it.quantity,
        unit_price: it.unit_price,
        gst_percentage: cform.invoice_type === 'TAX' ? '18' : '0',
        hsn_code: it.hsn_code || null
      }))
    }
    if (editInvoiceId) {
      updateInvoiceMutation.mutate({ invoiceId: editInvoiceId, payload })
    } else {
      createInvoiceMutation.mutate(payload)
    }
  }

  /* Open payment dialog */
  const openPay = () => {
    if (!detailInv || detailLoading) return
    setPayForm({
      amount: String(Number(detailInv.due_amount).toFixed(2)),
      payment_date: new Date().toISOString().slice(0, 10),
      payment_method: 'NEFT',
      reference_number: '',
      notes: ''
    })
    setPayError('')
    setPayFieldErrors({})
    setShowPay(true)
  }

  const handleCformChange = (field: string, val: string) => {
    setCform((prev) => ({ ...prev, [field]: val }))
    if (cformError) setCformError('')
    if (cfieldErrors[field]) {
      setCfieldErrors((prev) => ({ ...prev, [field]: [] }))
    }
  }

  const handlePayFormChange = (field: string, val: string) => {
    setPayForm((prev) => ({ ...prev, [field]: val }))
    if (payError) setPayError('')
    if (payFieldErrors[field]) {
      setPayFieldErrors((prev) => ({ ...prev, [field]: [] }))
    }
  }

  /* Submit payment */
  const handlePay = (e: React.FormEvent) => {
    e.preventDefault()
    if (!detailInv) return
    if (!payForm.amount || Number(payForm.amount) <= 0) {
      setPayError('Enter a valid amount.')
      return
    }
    if (Number(payForm.amount) > Number(detailInv.due_amount)) {
      setPayError(`Amount cannot exceed outstanding due of ${inr(detailInv.due_amount)}.`)
      return
    }
    setPayError('')
    setPayFieldErrors({})
    createPaymentMutation.mutate({
      invoice_id: detailInv.invoice_id,
      ...payForm
    })
  }

  /* ── Filtered display ── */
  const displayed = invoices.filter((inv) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      inv.invoice_number.toLowerCase().includes(q) || inv.customer_name.toLowerCase().includes(q)
    )
  })

  return (
    <>
      {/* Header */}
      <div className="page-hdr">
        <div>
          <div className="page-title">Invoices</div>
          <div className="page-sub">
            Create GST/Non-GST invoices and track payment status. Defaults to the current month and the mandatory current Financial Year. Selecting a month displays invoices for that month, while clearing the month filter (selecting 'All Months') displays all invoices for the entire selected Financial Year.
          </div>
        </div>
        <div className="page-hdr-actions">
          <button className="btn btn-primary" onClick={openCreate}>
            <Plus size={15} /> New Invoice
          </button>
        </div>
      </div>

      {/* Filters */}
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
              style={{ width: 140, padding: '7px 10px' }}
              value={statusFilter}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">All Status</option>
              <option value="PENDING">Pending</option>
              <option value="PARTIAL">Partial</option>
              <option value="PAID">Paid</option>
            </select>
            <select
              className="finput"
              style={{ width: 130, padding: '7px 10px' }}
              value={typeFilter}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="">All Types</option>
              <option value="TAX">TAX</option>
              <option value="RETAIL">RETAIL</option>
            </select>
          </div>
          <span className="fs12 t3 fw6">{displayed.length} Invoice(s)</span>
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
          ) : displayed.length === 0 ? (
            <div className="empty">
              <FileText size={40} className="empty-icon" />
              <div className="empty-text">No Invoices Found</div>
              <div className="empty-sub">Create your first invoice using the button above.</div>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Customer</th>
                  <th>Date</th>
                  <th>Type</th>
                  <th style={{ textAlign: 'right' }}>Grand Total</th>
                  <th style={{ textAlign: 'right' }}>Due</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right', paddingRight: 20 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {displayed.map((inv) => (
                  <tr key={inv.invoice_id}>
                    <td>
                      <span
                        style={{
                          fontWeight: 600,
                          color: 'var(--primary)',
                          fontVariantNumeric: 'tabular-nums'
                        }}
                      >
                        {inv.invoice_number}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{inv.customer_name}</div>
                      {inv.customer_mobile && <div className="fs12 t3">{inv.customer_mobile}</div>}
                    </td>
                    <td className="t2 fs12">{fmt(inv.invoice_date)}</td>
                    <td>
                      <span
                        className={`badge ${inv.invoice_type === 'TAX' ? 'badge-blue' : 'badge-yellow'}`}
                      >
                        {inv.invoice_type}
                      </span>
                    </td>
                    <td
                      style={{
                        textAlign: 'right',
                        fontWeight: 500,
                        fontVariantNumeric: 'tabular-nums'
                      }}
                    >
                      {inr(inv.grand_total)}
                    </td>
                    <td
                      style={{
                        textAlign: 'right',
                        fontWeight: 700,
                        color: Number(inv.due_amount) > 0 ? 'var(--danger)' : 'var(--success)',
                        fontVariantNumeric: 'tabular-nums'
                      }}
                    >
                      {inr(inv.due_amount)}
                    </td>
                    <td>{statusBadge(inv.payment_status)}</td>
                    <td>
                      <div className="row jc-end gap-1" style={{ paddingRight: 4 }}>
                        <button
                          className="btn btn-ghost btn-sm row gap-1"
                          onClick={() => openDetail(inv)}
                          style={{ color: 'var(--primary)' }}
                          title="View invoice details"
                        >
                          <Eye size={13} /> View
                        </button>
                        <button
                          className="btn btn-ghost btn-sm row gap-1"
                          onClick={() => openEdit(inv)}
                          style={{ color: 'var(--primary)' }}
                          title="Edit invoice"
                        >
                          <Edit size={13} /> Edit
                        </button>
                        <button
                          className="btn btn-ghost btn-sm row gap-1"
                          onClick={() => setPrintInvId(inv.invoice_id)}
                          style={{ color: 'var(--t2)' }}
                          title="Print / Download PDF"
                        >
                          <Printer size={13} /> Print
                        </button>
                        <button
                          className="btn btn-ghost btn-sm row gap-1"
                          onClick={() => setDownloadInvId(inv.invoice_id)}
                          style={{ color: 'var(--success, #16a34a)' }}
                          title="Download PDF directly"
                        >
                          <Download size={13} /> Download
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

      {/* ── Create Invoice Modal ── */}
      {showCreate && (
        <div className="overlay">
          <div className="modal" style={{ width: 860, maxWidth: '97vw' }}>
            <div className="modal-hdr">
              <span className="modal-title">
                {editInvoiceId ? `Edit Invoice - ${editInvoiceNumber}` : 'Create New Invoice'}
              </span>
              <button className="tb-btn" onClick={() => setShowCreate(false)}>
                <X size={15} />
              </button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body">
                {cformError && (
                  <div className="login-err" style={{ marginBottom: 16, alignItems: 'flex-start' }}>
                    <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
                    <div style={{ flex: 1 }}>{cformError}</div>
                  </div>
                )}

                {/* Basic info */}
                <div className="fgrid2" style={{ gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
                  <div className="fgrp">
                    <label className="flabel">Customer *</label>
                    <select
                      className={`finput ${cfieldErrors.customer_id?.length ? 'err' : ''}`}
                      value={cform.customer_id}
                      onChange={(e) => handleCformChange('customer_id', e.target.value)}
                    >
                      <option value="">— Select Customer —</option>
                      {customers.map((c) => (
                        <option key={c.customer_id} value={c.customer_id}>
                          {c.customer_name}
                        </option>
                      ))}
                    </select>
                    {cfieldErrors.customer_id?.map((errMsg, idx) => (
                      <div key={idx} className="ferr">{errMsg}</div>
                    ))}
                  </div>
                  <div className="fgrp">
                    <label className="flabel">Invoice Type</label>
                    <select
                      className={`finput ${cfieldErrors.invoice_type?.length ? 'err' : ''}`}
                      value={cform.invoice_type}
                      onChange={(e) => handleCformChange('invoice_type', e.target.value)}
                    >
                      <option value="TAX">TAX</option>
                      <option value="RETAIL">RETAIL</option>
                    </select>
                    {cfieldErrors.invoice_type?.map((errMsg, idx) => (
                      <div key={idx} className="ferr">{errMsg}</div>
                    ))}
                  </div>
                  <div className="fgrp">
                    <label className="flabel">Invoice Date *</label>
                    <input
                      className={`finput ${cfieldErrors.invoice_date?.length ? 'err' : ''}`}
                      type="date"
                      required
                      value={cform.invoice_date}
                      onChange={(e) => handleCformChange('invoice_date', e.target.value)}
                    />
                    {cfieldErrors.invoice_date?.map((errMsg, idx) => (
                      <div key={idx} className="ferr">{errMsg}</div>
                    ))}
                  </div>
                </div>

                {/* Line items */}
                <div style={{ marginBottom: 12 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 8
                    }}
                  >
                    <div className="flabel" style={{ marginBottom: 0 }}>
                      Line Items
                    </div>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm row gap-1"
                      onClick={addItem}
                    >
                      <Plus size={12} /> Add Row
                    </button>
                  </div>

                  <div
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--r)',
                      overflow: 'hidden'
                    }}
                  >
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr
                          style={{ background: '#F7FAFD', borderBottom: '1px solid var(--border)' }}
                        >
                          <th
                            style={{
                              padding: '7px 10px',
                              fontSize: 11,
                              fontWeight: 700,
                              color: 'var(--t3)',
                              textAlign: 'left',
                              letterSpacing: '.5px',
                              textTransform: 'uppercase'
                            }}
                          >
                            Product
                          </th>
                          {cform.invoice_type === 'TAX' && (
                            <th
                              style={{
                                padding: '7px 10px',
                                fontSize: 11,
                                fontWeight: 700,
                                color: 'var(--t3)',
                                textAlign: 'left',
                                letterSpacing: '.5px',
                                textTransform: 'uppercase',
                                width: 100
                              }}
                            >
                              HSN Code
                            </th>
                          )}
                          <th
                            style={{
                              padding: '7px 10px',
                              fontSize: 11,
                              fontWeight: 700,
                              color: 'var(--t3)',
                              textAlign: 'right',
                              letterSpacing: '.5px',
                              textTransform: 'uppercase',
                              width: 80
                            }}
                          >
                            Qty
                          </th>
                          <th
                            style={{
                              padding: '7px 10px',
                              fontSize: 11,
                              fontWeight: 700,
                              color: 'var(--t3)',
                              textAlign: 'right',
                              letterSpacing: '.5px',
                              textTransform: 'uppercase',
                              width: 110
                            }}
                          >
                            Price
                          </th>
                          <th
                            style={{
                              padding: '7px 10px',
                              fontSize: 11,
                              fontWeight: 700,
                              color: 'var(--t3)',
                              textAlign: 'right',
                              letterSpacing: '.5px',
                              textTransform: 'uppercase',
                              width: 60
                            }}
                          >
                            GST%
                          </th>
                          <th
                            style={{
                              padding: '7px 10px',
                              fontSize: 11,
                              fontWeight: 700,
                              color: 'var(--t3)',
                              textAlign: 'right',
                              letterSpacing: '.5px',
                              textTransform: 'uppercase',
                              width: 120
                            }}
                          >
                            Line Total
                          </th>
                          <th style={{ width: 36 }} />
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((it, idx) => {
                          const c = calcLine(it)
                          return (
                            <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                              <td style={{ padding: '6px 8px' }}>
                                <input
                                  type="text"
                                  className="finput"
                                  style={{ padding: '5px 8px', fontSize: 13 }}
                                  placeholder={!cform.customer_id ? 'Choose Customer First' : 'Type or select product...'}
                                  disabled={!cform.customer_id}
                                  value={it.product_name || ''}
                                  onChange={(e) => updateItem(idx, 'product_name', e.target.value)}
                                  list={`products-datalist-${idx}`}
                                />
                                {cform.customer_id && (
                                  <datalist id={`products-datalist-${idx}`}>
                                    {products
                                      .filter((p) => String(p.customer_id) === String(cform.customer_id))
                                      .map((p) => (
                                        <option key={p.product_id} value={p.product_name} />
                                      ))}
                                  </datalist>
                                )}
                              </td>
                              {cform.invoice_type === 'TAX' && (
                                <td style={{ padding: '6px 8px', width: 100 }}>
                                  <input
                                    type="text"
                                    className="finput"
                                    style={{ padding: '5px 8px', fontSize: 13 }}
                                    placeholder="HSN Code"
                                    value={it.hsn_code || ''}
                                    onChange={(e) => updateItem(idx, 'hsn_code', e.target.value)}
                                  />
                                </td>
                              )}
                              <td style={{ padding: '6px 8px' }}>
                                <input
                                  className="finput"
                                  type="number"
                                  step="0.0001"
                                  min="0.0001"
                                  style={{ padding: '5px 8px', fontSize: 13, textAlign: 'right' }}
                                  value={it.quantity}
                                  onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                                />
                              </td>
                              <td style={{ padding: '6px 8px' }}>
                                <input
                                  className="finput"
                                  type="number"
                                  step="0.0001"
                                  min="0"
                                  style={{ padding: '5px 8px', fontSize: 13, textAlign: 'right' }}
                                  value={it.unit_price}
                                  onChange={(e) => updateItem(idx, 'unit_price', e.target.value)}
                                />
                              </td>
                              <td style={{ padding: '6px 8px' }}>
                                <input
                                  className="finput"
                                  style={{
                                    padding: '5px 8px',
                                    fontSize: 13,
                                    textAlign: 'right',
                                    background: '#F1F5F9',
                                    color: '#475569',
                                    cursor: 'not-allowed'
                                  }}
                                  value={cform.invoice_type === 'TAX' ? '18%' : '0%'}
                                  readOnly
                                />
                              </td>
                              <td
                                style={{
                                  padding: '6px 8px',
                                  textAlign: 'right',
                                  fontWeight: 600,
                                  fontSize: 13,
                                  fontVariantNumeric: 'tabular-nums'
                                }}
                              >
                                {inr(c.total)}
                              </td>
                              <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                                {items.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => removeItem(idx)}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      cursor: 'pointer',
                                      color: 'var(--danger)',
                                      padding: 4
                                    }}
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Totals row */}
                <div style={{ display: 'flex', gap: 16 }}>
                  <div style={{ flex: 1, display: 'flex', gap: 12 }}>
                    <div className="fgrp" style={{ flex: 2 }}>
                      <label className="flabel">Notes</label>
                      <textarea
                        className={`finput ${cfieldErrors.notes?.length ? 'err' : ''}`}
                        rows={2}
                        value={cform.notes}
                        onChange={(e) => handleCformChange('notes', e.target.value)}
                        placeholder="Optional delivery or payment notes..."
                        style={{ resize: 'none', fontFamily: 'var(--font)' }}
                      />
                      {cfieldErrors.notes?.map((errMsg, idx) => (
                        <div key={idx} className="ferr">{errMsg}</div>
                      ))}
                    </div>
                    <div className="fgrp" style={{ flex: 1 }}>
                      <label className="flabel">Discount Amount (₹)</label>
                      <input
                        type="number"
                        step="0.0001"
                        className={`finput ${cfieldErrors.discount_amount?.length ? 'err' : ''}`}
                        min="0"
                        max={totals.total}
                        value={cform.discount_amount}
                        onChange={(e) => handleCformChange('discount_amount', e.target.value)}
                        placeholder="0.0000"
                      />
                      {cfieldErrors.discount_amount?.map((errMsg, idx) => (
                        <div key={idx} className="ferr">{errMsg}</div>
                      ))}
                    </div>
                  </div>
                  <div style={{ width: 220 }}>
                    <div
                      style={{
                        background: '#F8FAFC',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--r)',
                        padding: '12px 14px',
                        fontSize: 13
                      }}
                    >
                      <div className="row jc-sb" style={{ marginBottom: 6 }}>
                        <span className="t2">Subtotal</span>
                        <span className="fw6">{inr(totals.subtotal)}</span>
                      </div>
                      {cform.invoice_type === 'TAX' && (
                        <>
                          <div className="row jc-sb" style={{ marginBottom: 6 }}>
                            <span className="t2">{cgstLabel}</span>
                            <span className="fw6">{inr(totals.cgst)}</span>
                          </div>
                          <div className="row jc-sb" style={{ marginBottom: 6 }}>
                            <span className="t2">{sgstLabel}</span>
                            <span className="fw6">{inr(totals.sgst)}</span>
                          </div>
                        </>
                      )}
                      {disc > 0 && (
                        <div className="row jc-sb" style={{ marginBottom: 6, color: 'var(--success)' }}>
                          <span className="t2">Discount</span>
                          <span className="fw6">-{inr(disc)}</span>
                        </div>
                      )}
                      <div
                        style={{
                          borderTop: '1px solid var(--border)',
                          marginTop: 8,
                          paddingTop: 8
                        }}
                        className="row jc-sb"
                      >
                        <span style={{ fontWeight: 700 }}>Grand Total</span>
                        <span style={{ fontWeight: 800, fontSize: 15 }}>{inr(grandTotal)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="modal-ftr">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setShowCreate(false)}
                >
                  Cancel
                </button>
                 <button type="submit" className="btn btn-primary" disabled={cformLoading}>
                  {cformLoading ? (editInvoiceId ? 'Saving...' : 'Creating...') : (editInvoiceId ? 'Save Changes' : 'Create Invoice')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Invoice Detail Modal ── */}
      {showDetail && detailInv && (
        <div className="overlay">
          <div className="modal" style={{ width: 720, maxWidth: '97vw' }}>
            <div className="modal-hdr" style={{ background: '#0B1426' }}>
              <div>
                <span className="modal-title" style={{ color: '#fff', fontSize: 13 }}>
                  Invoice Detail
                </span>
                <div style={{ color: '#4A6080', fontSize: 12, marginTop: 2 }}>
                  {detailInv.invoice_number}
                </div>
              </div>
              <div className="row gap-2">
                {detailInv.payment_status !== 'PAID' && (
                  <button
                    className="btn btn-primary btn-sm row gap-1"
                    onClick={openPay}
                    disabled={detailLoading}
                  >
                    <CreditCard size={13} /> Record Payment
                  </button>
                )}
                <button
                  className="btn btn-outline btn-sm row gap-1"
                  onClick={() => {
                    setShowDetail(false)
                    openEdit(detailInv)
                  }}
                  disabled={detailLoading}
                  style={{ color: '#fff', borderColor: '#4A6080' }}
                >
                  <Edit size={13} /> Edit
                </button>
                <button
                  className="tb-btn"
                  onClick={() => {
                    setShowDetail(false)
                    setActiveInvoiceId(null)
                  }}
                  style={{ color: '#8898AA' }}
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            <div className="modal-body" style={{ padding: 20 }}>
              {detailLoading ? (
                <div className="loading" style={{ padding: '40px 0' }}>
                  <div className="spinner" />
                </div>
              ) : (
                <>
                  {/* Customer + meta */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: 16,
                      marginBottom: 20
                    }}
                  >
                    <div
                      style={{
                        background: '#F8FAFC',
                        borderRadius: 8,
                        padding: '12px 14px',
                        border: '1px solid var(--border)'
                      }}
                    >
                      <div
                        className="fs12 t3 fw6"
                        style={{
                          marginBottom: 6,
                          textTransform: 'uppercase',
                          letterSpacing: '.5px'
                        }}
                      >
                        Bill To
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{detailInv.customer_name}</div>
                      {detailInv.contact_person && (
                        <div className="fs12 t2" style={{ marginTop: 2 }}>
                          {detailInv.contact_person}
                        </div>
                      )}
                      {detailInv.customer_address && (
                        <div className="fs12 t3" style={{ marginTop: 2 }}>
                          {detailInv.customer_address}
                        </div>
                      )}
                      {detailInv.invoice_type === 'TAX' && detailInv.customer_gstin && (
                        <div className="fs12 t2" style={{ marginTop: 4 }}>
                          GSTIN:{' '}
                          <span style={{ fontFamily: 'monospace' }}>
                            {detailInv.customer_gstin}
                          </span>
                        </div>
                      )}
                    </div>
                    <div
                      style={{
                        background: '#F8FAFC',
                        borderRadius: 8,
                        padding: '12px 14px',
                        border: '1px solid var(--border)'
                      }}
                    >
                      <div
                        className="fs12 t3 fw6"
                        style={{
                          marginBottom: 8,
                          textTransform: 'uppercase',
                          letterSpacing: '.5px'
                        }}
                      >
                        Invoice Details
                      </div>
                      <div className="row jc-sb" style={{ marginBottom: 5 }}>
                        <span className="t2 fs12">Invoice #</span>
                        <span
                          className="fw6 fs12"
                          style={{ fontFamily: 'monospace', color: 'var(--primary)' }}
                        >
                          {detailInv.invoice_number}
                        </span>
                      </div>
                      <div className="row jc-sb" style={{ marginBottom: 5 }}>
                        <span className="t2 fs12">Date</span>
                        <span className="fw6 fs12">{fmt(detailInv.invoice_date)}</span>
                      </div>
                      <div className="row jc-sb" style={{ marginBottom: 5 }}>
                        <span className="t2 fs12">Type</span>
                        <span
                          className={`badge ${detailInv.invoice_type === 'TAX' ? 'badge-blue' : 'badge-yellow'}`}
                          style={{ padding: '2px 8px' }}
                        >
                          {detailInv.invoice_type}
                        </span>
                      </div>
                      <div className="row jc-sb">
                        <span className="t2 fs12">Status</span>
                        {statusBadge(detailInv.payment_status)}
                      </div>
                    </div>
                  </div>

                  {/* Items table */}
                  {detailInv.items && detailInv.items.length > 0 && (
                    <div
                      style={{
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        overflow: 'hidden',
                        marginBottom: 16
                      }}
                    >
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr
                            style={{
                              background: '#F7FAFD',
                              borderBottom: '1px solid var(--border)'
                            }}
                          >
                            <th
                              style={{
                                padding: '8px 12px',
                                fontSize: 11,
                                fontWeight: 700,
                                color: 'var(--t3)',
                                textAlign: 'left',
                                letterSpacing: '.5px',
                                textTransform: 'uppercase'
                              }}
                            >
                              Product
                            </th>
                            <th
                              style={{
                                padding: '8px 12px',
                                fontSize: 11,
                                fontWeight: 700,
                                color: 'var(--t3)',
                                textAlign: 'right',
                                letterSpacing: '.5px',
                                textTransform: 'uppercase'
                              }}
                            >
                              Qty
                            </th>
                            <th
                              style={{
                                padding: '8px 12px',
                                fontSize: 11,
                                fontWeight: 700,
                                color: 'var(--t3)',
                                textAlign: 'right',
                                letterSpacing: '.5px',
                                textTransform: 'uppercase'
                              }}
                            >
                              Rate
                            </th>
                            <th
                              style={{
                                padding: '8px 12px',
                                fontSize: 11,
                                fontWeight: 700,
                                color: 'var(--t3)',
                                textAlign: 'right',
                                letterSpacing: '.5px',
                                textTransform: 'uppercase'
                              }}
                            >
                              Taxable
                            </th>
                            <th
                              style={{
                                padding: '8px 12px',
                                fontSize: 11,
                                fontWeight: 700,
                                color: 'var(--t3)',
                                textAlign: 'right',
                                letterSpacing: '.5px',
                                textTransform: 'uppercase'
                              }}
                            >
                              GST
                            </th>
                            <th
                              style={{
                                padding: '8px 12px',
                                fontSize: 11,
                                fontWeight: 700,
                                color: 'var(--t3)',
                                textAlign: 'right',
                                letterSpacing: '.5px',
                                textTransform: 'uppercase'
                              }}
                            >
                              Total
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {detailInv.items.map((it, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                              <td style={{ padding: '9px 12px', fontWeight: 500 }}>
                                {it.product_name || `Product #${it.product_id}`}
                                {detailInv.invoice_type === 'TAX' && it.hsn_code && (
                                  <span className="fs12 t3" style={{ marginLeft: 6 }}>
                                    HSN: {it.hsn_code}
                                  </span>
                                )}
                              </td>
                              <td
                                style={{
                                  padding: '9px 12px',
                                  textAlign: 'right',
                                  fontVariantNumeric: 'tabular-nums'
                                }}
                              >
                                {fmtVal(it.quantity)}
                              </td>
                              <td
                                style={{
                                  padding: '9px 12px',
                                  textAlign: 'right',
                                  fontVariantNumeric: 'tabular-nums'
                                }}
                              >
                                {inr(it.unit_price)}
                              </td>
                              <td
                                style={{
                                  padding: '9px 12px',
                                  textAlign: 'right',
                                  fontVariantNumeric: 'tabular-nums'
                                }}
                              >
                                {inr(it.taxable_amount)}
                              </td>
                              <td
                                style={{
                                  padding: '9px 12px',
                                  textAlign: 'right',
                                  fontSize: 12,
                                  color: 'var(--t2)',
                                  fontVariantNumeric: 'tabular-nums'
                                }}
                              >
                                {inr(
                                  Number(it.cgst_amount || 0) +
                                  Number(it.sgst_amount || 0) +
                                  Number(it.igst_amount || 0)
                                )}
                              </td>
                              <td
                                style={{
                                  padding: '9px 12px',
                                  textAlign: 'right',
                                  fontWeight: 600,
                                  fontVariantNumeric: 'tabular-nums'
                                }}
                              >
                                {inr(it.total_amount)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Summary */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <div
                      style={{
                        width: 260,
                        background: '#F8FAFC',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        padding: '14px 16px',
                        fontSize: 13
                      }}
                    >
                      {[
                        ['Subtotal', detailInv.subtotal],
                        [detailCgstLabel, detailInv.cgst_amount],
                        [detailSgstLabel, detailInv.sgst_amount],
                        [detailIgstLabel, detailInv.igst_amount]
                      ].map(([label, val]) =>
                        Number(val) > 0 ? (
                          <div
                            key={String(label)}
                            className="row jc-sb"
                            style={{ marginBottom: 5 }}
                          >
                            <span className="t2">{label}</span>
                            <span className="fw6">{inr(val as any)}</span>
                          </div>
                        ) : null
                      )}
                      {Number(detailInv.discount_amount) > 0 && (
                        <div
                          className="row jc-sb"
                          style={{ marginBottom: 5, color: 'var(--success)' }}
                        >
                          <span>Discount</span>
                          <span>− {inr(detailInv.discount_amount)}</span>
                        </div>
                      )}
                      <div
                        style={{
                          borderTop: '2px solid var(--border)',
                          paddingTop: 8,
                          marginTop: 4
                        }}
                        className="row jc-sb"
                      >
                        <span style={{ fontWeight: 700 }}>Grand Total</span>
                        <span style={{ fontWeight: 800, fontSize: 16 }}>
                          {inr(detailInv.grand_total)}
                        </span>
                      </div>
                      <div className="row jc-sb" style={{ marginTop: 6 }}>
                        <span className="t2">Amount Paid</span>
                        <span className="fw6" style={{ color: 'var(--success)' }}>
                          {inr(Number(detailInv.grand_total) - Number(detailInv.due_amount))}
                        </span>
                      </div>
                      <div className="row jc-sb" style={{ marginTop: 4 }}>
                        <span style={{ fontWeight: 700 }}>Balance Due</span>
                        <span
                          style={{
                            fontWeight: 800,
                            color:
                              Number(detailInv.due_amount) > 0 ? 'var(--danger)' : 'var(--success)'
                          }}
                        >
                          {inr(detailInv.due_amount)}
                        </span>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="modal-ftr">
              <button
                className="btn btn-outline"
                onClick={() => {
                  setShowDetail(false)
                  setActiveInvoiceId(null)
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Record Payment Modal ── */}
      {showPay && detailInv && (
        <div className="overlay" style={{ zIndex: 900 }}>
          <div className="modal modal-sm" style={{ width: 440 }}>
            <div className="modal-hdr">
              <span className="modal-title">Record Payment</span>
              <button className="tb-btn" onClick={() => setShowPay(false)}>
                <X size={15} />
              </button>
            </div>
            <form onSubmit={handlePay}>
              <div className="modal-body">
                {payError && (
                  <div className="login-err" style={{ marginBottom: 12, alignItems: 'flex-start' }}>
                    <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
                    <div style={{ flex: 1 }}>{payError}</div>
                  </div>
                )}
                <div
                  style={{
                    background: '#F8FAFC',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: '10px 14px',
                    marginBottom: 16,
                    fontSize: 13
                  }}
                >
                  <div className="row jc-sb">
                    <span className="t2">Invoice</span>
                    <span className="fw6">{detailInv.invoice_number}</span>
                  </div>
                  <div className="row jc-sb" style={{ marginTop: 4 }}>
                    <span className="t2">Grand Total</span>
                    <span className="fw6">{inr(detailInv.grand_total)}</span>
                  </div>
                  <div className="row jc-sb" style={{ marginTop: 4 }}>
                    <span className="t2">Outstanding</span>
                    <span style={{ fontWeight: 800, color: 'var(--danger)' }}>
                      {inr(detailInv.due_amount)}
                    </span>
                  </div>
                </div>
                <div className="fgrid2">
                  <div className="fgrp">
                    <label className="flabel">Amount (₹) *</label>
                    <input
                      className={`finput ${payFieldErrors.amount?.length ? 'err' : ''}`}
                      type="number"
                      step="0.0001"
                      min="0.0001"
                      max={Number(detailInv.due_amount)}
                      value={payForm.amount}
                      onChange={(e) => handlePayFormChange('amount', e.target.value)}
                    />
                    {payFieldErrors.amount?.map((errMsg, idx) => (
                      <div key={idx} className="ferr">{errMsg}</div>
                    ))}
                  </div>
                  <div className="fgrp">
                    <label className="flabel">Payment Date *</label>
                    <input
                      className={`finput ${payFieldErrors.payment_date?.length ? 'err' : ''}`}
                      type="date"
                      value={payForm.payment_date}
                      onChange={(e) => handlePayFormChange('payment_date', e.target.value)}
                    />
                    {payFieldErrors.payment_date?.map((errMsg, idx) => (
                      <div key={idx} className="ferr">{errMsg}</div>
                    ))}
                  </div>
                </div>
                <div className="fgrid2">
                  <div className="fgrp">
                    <label className="flabel">Payment Method</label>
                    <select
                      className={`finput ${payFieldErrors.payment_method?.length ? 'err' : ''}`}
                      value={payForm.payment_method}
                      onChange={(e) => handlePayFormChange('payment_method', e.target.value)}
                    >
                      <option value="NEFT">NEFT</option>
                      <option value="RTGS">RTGS</option>
                      <option value="CHEQUE">Cheque</option>
                      <option value="UPI">UPI</option>
                      <option value="CASH">Cash</option>
                      <option value="CARD">Card</option>
                    </select>
                    {payFieldErrors.payment_method?.map((errMsg, idx) => (
                      <div key={idx} className="ferr">{errMsg}</div>
                    ))}
                  </div>
                  <div className="fgrp">
                    <label className="flabel">Reference / UTR</label>
                    <input
                      className={`finput ${payFieldErrors.reference_number?.length ? 'err' : ''}`}
                      value={payForm.reference_number}
                      onChange={(e) => handlePayFormChange('reference_number', e.target.value)}
                      placeholder="Optional ref. number"
                    />
                    {payFieldErrors.reference_number?.map((errMsg, idx) => (
                      <div key={idx} className="ferr">{errMsg}</div>
                    ))}
                  </div>
                </div>
                <div className="fgrp">
                  <label className="flabel">Notes</label>
                  <input
                    className={`finput ${payFieldErrors.notes?.length ? 'err' : ''}`}
                    value={payForm.notes}
                    onChange={(e) => handlePayFormChange('notes', e.target.value)}
                    placeholder="Optional payment note"
                  />
                  {payFieldErrors.notes?.map((errMsg, idx) => (
                    <div key={idx} className="ferr">{errMsg}</div>
                  ))}
                </div>
              </div>
              <div className="modal-ftr">
                <button type="button" className="btn btn-outline" onClick={() => setShowPay(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={payLoading}>
                  {payLoading ? 'Recording...' : 'Record Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Invoice Print / PDF Preview ── */}
      {printInvId !== null && (
        <InvoicePrint
          invoiceId={printInvId}
          onClose={() => setPrintInvId(null)}
        />
      )}

      {/* ── Direct PDF Download (no modal shown) ── */}
      {downloadInvId !== null && (
        <InvoicePrint
          invoiceId={downloadInvId}
          onClose={() => setDownloadInvId(null)}
          autoDownload
        />
      )}
    </>
  )
}
