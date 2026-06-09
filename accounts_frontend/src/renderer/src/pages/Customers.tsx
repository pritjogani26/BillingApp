import React, { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Search,
  Plus,
  Edit3,
  Trash2,
  BookOpen,
  X,
  AlertCircle,
  Building2,
  Phone,
  Mail,
  MapPin,
  User,
  HelpCircle
} from 'lucide-react'
import client from '../api/client'
import { parseApiError } from '../utils/errorHelper'

interface Customer {
  customer_id: number
  customer_name: string
  contact_person: string
  gstin: string
  address: string
  city: string
  state: string
  pincode: string
  mobile: string
  email: string
  default_rate: number | string
  status: string
}

interface LedgerSummary {
  customer_id: number
  customer_name: string
  total_debit: number | string
  total_credit: number | string
  current_balance: number | string
}

const inr = (n: number | string | null | undefined) => {
  if (n == null) return '₹0.00'
  const num = Number(n)
  if (isNaN(num)) return '₹0.00'
  return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const inr4 = (n: number | string | null | undefined) => {
  if (n == null) return '₹0.0000'
  const num = Number(n)
  if (isNaN(num)) return '₹0.0000'
  return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
}

const initialFormState = {
  customer_name: '',
  contact_person: '',
  gstin: '',
  address: '',
  city: 'AHMEDABAD',
  state: 'GUJARAT',
  pincode: '',
  mobile: '',
  email: '',
  default_rate: '0.00'
}

export default function Customers() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showLedgerModal, setShowLedgerModal] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)

  // Form State
  const [form, setForm] = useState(initialFormState)
  const [formError, setFormError] = useState<React.ReactNode>('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})

  // Debounce search changes
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search)
    }, 300)
    return () => clearTimeout(handler)
  }, [search])

  // 1. Fetch Customers list
  const { data: customersData, isLoading: loadingCustomers, error: customersError } = useQuery({
    queryKey: ['customers', debouncedSearch],
    queryFn: async () => {
      const res = await client.get(`/customers/?search=${encodeURIComponent(debouncedSearch)}`)
      return (res.data.data.customers || []) as Customer[]
    }
  })

  // 2. Ledger Summary Query
  const { data: ledgerData, isLoading: loadingLedger } = useQuery({
    queryKey: ['ledgerSummary', selectedCustomer?.customer_id],
    queryFn: async () => {
      if (!selectedCustomer) return null
      const res = await client.get(`/customers/${selectedCustomer.customer_id}/summary/`)
      return res.data.data as LedgerSummary
    },
    enabled: showLedgerModal && !!selectedCustomer
  })

  // 3. Create Customer Mutation
  const createCustomerMutation = useMutation({
    mutationFn: async (newCustomer: typeof form) => {
      const res = await client.post('/customers/', newCustomer)
      return res.data
    },
    onSuccess: () => {
      setShowAddModal(false)
      setForm(initialFormState)
      setFieldErrors({})
      queryClient.invalidateQueries({ queryKey: ['customers'] })
    },
    onError: (err: any) => {
      const { formError, fieldErrors } = parseApiError(err, 'Failed to create customer.')
      setFormError(formError)
      setFieldErrors(fieldErrors)
    }
  })

  // 4. Update Customer Mutation
  const updateCustomerMutation = useMutation({
    mutationFn: async (updatedData: { id: number; form: typeof form }) => {
      const res = await client.put(`/customers/${updatedData.id}/`, updatedData.form)
      return res.data
    },
    onSuccess: () => {
      setShowEditModal(false)
      setFieldErrors({})
      queryClient.invalidateQueries({ queryKey: ['customers'] })
    },
    onError: (err: any) => {
      const { formError, fieldErrors } = parseApiError(err, 'Failed to update customer.')
      setFormError(formError)
      setFieldErrors(fieldErrors)
    }
  })

  // 5. Delete Customer Mutation
  const deleteCustomerMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await client.delete(`/customers/${id}/`)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
    },
    onError: (err: any) => {
      alert(err.response?.data?.message || 'Failed to delete customer.')
    }
  })

  const customers = customersData || []
  const loading = loadingCustomers
  const error = customersError ? 'Error connecting to the API server.' : ''
  const ledgerSummary = ledgerData || null
  const ledgerLoading = loadingLedger
  const formLoading = createCustomerMutation.isPending || updateCustomerMutation.isPending

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    let { name, value } = e.target

    if (name === 'pincode') {
      value = value.replace(/\D/g, '').slice(0, 6)
    } else if (name === 'mobile') {
      value = value.replace(/\D/g, '').slice(0, 20)
    } else if (name === 'email') {
      value = value.toLowerCase()
    } else if (name === 'default_rate') {
      // numeric rate field, leave untouched
    } else {
      value = value.toUpperCase()
    }

    setForm((prev) => ({ ...prev, [name]: value }))
    if (formError) setFormError('')
    if (fieldErrors[name]) {
      setFieldErrors((prev) => ({ ...prev, [name]: [] }))
    }
  }

  const openAddModal = () => {
    setForm(initialFormState)
    setFormError('')
    setFieldErrors({})
    setShowAddModal(true)
  }

  const handleCreateCustomer = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.customer_name.trim()) {
      setFormError('Company Name is required.')
      setFieldErrors({ customer_name: ['Company Name is required.'] })
      return
    }
    setFormError('')
    setFieldErrors({})
    createCustomerMutation.mutate(form)
  }

  const openEditModal = (c: Customer) => {
    setSelectedCustomer(c)
    setForm({
      customer_name: c.customer_name,
      contact_person: c.contact_person || '',
      gstin: c.gstin || '',
      address: c.address || '',
      city: c.city || '',
      state: c.state || '',
      pincode: c.pincode || '',
      mobile: c.mobile || '',
      email: c.email || '',
      default_rate: String(c.default_rate)
    })
    setFormError('')
    setFieldErrors({})
    setShowEditModal(true)
  }

  const handleUpdateCustomer = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedCustomer) return
    if (!form.customer_name.trim()) {
      setFormError('Company Name is required.')
      setFieldErrors({ customer_name: ['Company Name is required.'] })
      return
    }
    setFormError('')
    setFieldErrors({})
    updateCustomerMutation.mutate({ id: selectedCustomer.customer_id, form })
  }

  const handleDeleteCustomer = (id: number) => {
    if (!window.confirm('Are you sure you want to delete this customer?')) return
    deleteCustomerMutation.mutate(id)
  }

  const openLedgerSummary = (c: Customer) => {
    setSelectedCustomer(c)
    setShowLedgerModal(true)
  }

  const closeLedgerModal = () => {
    setShowLedgerModal(false)
    setSelectedCustomer(null)
  }

  const renderFormFields = () => (
    <>
      <div className="fgrp">
        <label className="flabel">Company/Party Name *</label>
        <input
          className={`finput ${fieldErrors.customer_name?.length ? 'err' : ''}`}
          name="customer_name"
          value={form.customer_name}
          onChange={handleInputChange}
          placeholder="Enter official business name"
          maxLength={255}
          required
        />
        {fieldErrors.customer_name?.map((errMsg, idx) => (
          <div key={idx} className="ferr">
            {errMsg}
          </div>
        ))}
      </div>

      <div className="fgrid2">
        <div className="fgrp">
          <label className="flabel">Contact Person</label>
          <input
            className={`finput ${fieldErrors.contact_person?.length ? 'err' : ''}`}
            name="contact_person"
            value={form.contact_person}
            onChange={handleInputChange}
            placeholder="Person to contact"
            maxLength={255}
          />
          {fieldErrors.contact_person?.map((errMsg, idx) => (
            <div key={idx} className="ferr">
              {errMsg}
            </div>
          ))}
        </div>
        <div className="fgrp">
          <label className="flabel">Custom Rate (per unit)</label>
          <input
            className={`finput ${fieldErrors.default_rate?.length ? 'err' : ''}`}
            name="default_rate"
            type="number"
            step="0.0001"
            min="0"
            value={form.default_rate}
            onChange={handleInputChange}
            placeholder="0.0000"
          />
          {fieldErrors.default_rate?.map((errMsg, idx) => (
            <div key={idx} className="ferr">
              {errMsg}
            </div>
          ))}
        </div>
      </div>

      <div className="fgrid2">
        <div className="fgrp">
          <label className="flabel">Mobile No.</label>
          <input
            className={`finput ${fieldErrors.mobile?.length ? 'err' : ''}`}
            name="mobile"
            value={form.mobile}
            onChange={handleInputChange}
            placeholder="10-digit mobile number"
            maxLength={20}
          />
          {fieldErrors.mobile?.map((errMsg, idx) => (
            <div key={idx} className="ferr">
              {errMsg}
            </div>
          ))}
        </div>
        <div className="fgrp">
          <label className="flabel">Email Address</label>
          <input
            className={`finput ${fieldErrors.email?.length ? 'err' : ''}`}
            name="email"
            type="email"
            value={form.email}
            onChange={handleInputChange}
            placeholder="billing@client.com"
            maxLength={255}
          />
          {fieldErrors.email?.map((errMsg, idx) => (
            <div key={idx} className="ferr">
              {errMsg}
            </div>
          ))}
        </div>
      </div>

      <div className="fgrp">
        <label className="flabel">GSTIN (15-digit)</label>
        <input
          className={`finput ${fieldErrors.gstin?.length ? 'err' : ''}`}
          name="gstin"
          value={form.gstin}
          onChange={handleInputChange}
          placeholder="e.g. 27AAPFU0939F1ZV"
          maxLength={15}
        />
        {fieldErrors.gstin?.map((errMsg, idx) => (
          <div key={idx} className="ferr">
            {errMsg}
          </div>
        ))}
      </div>

      <div className="fgrp">
        <label className="flabel">Billing Address</label>
        <textarea
          className={`finput ${fieldErrors.address?.length ? 'err' : ''}`}
          name="address"
          rows={2}
          value={form.address}
          onChange={handleInputChange}
          placeholder="Enter building number, street, locality..."
          maxLength={500}
          style={{ resize: 'none', fontFamily: 'var(--font)' }}
        />
        {fieldErrors.address?.map((errMsg, idx) => (
          <div key={idx} className="ferr">
            {errMsg}
          </div>
        ))}
      </div>

      <div className="fgrid2" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <div className="fgrp">
          <label className="flabel">City</label>
          <input
            className={`finput ${fieldErrors.city?.length ? 'err' : ''}`}
            name="city"
            value={form.city}
            onChange={handleInputChange}
            placeholder="City"
            maxLength={100}
          />
          {fieldErrors.city?.map((errMsg, idx) => (
            <div key={idx} className="ferr">
              {errMsg}
            </div>
          ))}
        </div>
        <div className="fgrp">
          <label className="flabel">State</label>
          <input
            className={`finput ${fieldErrors.state?.length ? 'err' : ''}`}
            name="state"
            value={form.state}
            onChange={handleInputChange}
            placeholder="State"
            maxLength={100}
          />
          {fieldErrors.state?.map((errMsg, idx) => (
            <div key={idx} className="ferr">
              {errMsg}
            </div>
          ))}
        </div>
        <div className="fgrp">
          <label className="flabel">Pincode</label>
          <input
            className={`finput ${fieldErrors.pincode?.length ? 'err' : ''}`}
            name="pincode"
            value={form.pincode}
            onChange={handleInputChange}
            placeholder="Pincode"
            maxLength={6}
          />
          {fieldErrors.pincode?.map((errMsg, idx) => (
            <div key={idx} className="ferr">
              {errMsg}
            </div>
          ))}
        </div>
      </div>
    </>
  )

  return (
    <>
      {/* Page Header */}
      <div className="page-hdr">
        <div>
          <div className="page-title">Customer Ledger & CRM</div>
          <div className="page-sub">
            Manage client accounts, addresses, tax profiles, and financial summaries.
          </div>
        </div>
        <div className="page-hdr-actions">
          <button className="btn btn-primary" onClick={openAddModal}>
            <Plus size={15} /> Add Customer
          </button>
        </div>
      </div>

      {/* Main Grid Card */}
      <div className="card" style={{ animation: 'fadeUp 0.3s ease' }}>
        <div className="card-hdr" style={{ background: '#F8FAFC' }}>
          <div className="search-wrap">
            <Search size={15} className="search-icon" />
            <input
              className="search-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by company, mobile, or GSTIN..."
              style={{ width: 320 }}
            />
          </div>
          <span className="fs12 t3 fw6">{customers.length} Client Record(s)</span>
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
          ) : customers.length === 0 ? (
            <div className="empty">
              <Building2 size={40} className="empty-icon" />
              <div className="empty-text">No Customers Found</div>
              <div className="empty-sub">
                Try searching with a different keyword or create a new client record.
              </div>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Company Name</th>
                  <th>Contact Person</th>
                  <th>Contact Details</th>
                  <th>GSTIN</th>
                  <th style={{ textAlign: 'right' }}>Price Rate</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right', paddingRight: 20 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.customer_id}>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--t1)' }}>{c.customer_name}</div>
                      {(c.city || c.state) && (
                        <div className="fs12 t3 row gap-1" style={{ marginTop: 2 }}>
                          <MapPin size={11} /> {[c.city, c.state].filter(Boolean).join(', ')}
                        </div>
                      )}
                    </td>
                    <td>
                      <div className="row gap-1 fw6 text-secondary">
                        <User size={13} color="var(--t2)" />
                        {c.contact_person || 'N/A'}
                      </div>
                    </td>
                    <td>
                      {c.mobile && (
                        <div className="row gap-1 fs12 t2">
                          <Phone size={11} color="var(--t3)" /> {c.mobile}
                        </div>
                      )}
                      {c.email && (
                        <div className="row gap-1 fs12 t3" style={{ marginTop: 2 }}>
                          <Mail size={11} /> {c.email}
                        </div>
                      )}
                    </td>
                    <td>
                      {c.gstin ? (
                        <span
                          className="badge badge-blue fs12"
                          style={{ fontWeight: 600, fontFamily: 'monospace' }}
                        >
                          GST: {c.gstin}
                        </span>
                      ) : (
                        <span className="badge badge-red fs12">Unregistered</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{inr4(c.default_rate)}</td>
                    <td>
                      <span className={`badge ${c.status === 'A' ? 'badge-green' : 'badge-red'}`}>
                        {c.status === 'A' ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <div className="row gap-2 jc-end" style={{ paddingRight: 4 }}>
                        <button
                          className="btn btn-ghost btn-sm row gap-1"
                          onClick={() => openLedgerSummary(c)}
                          title="Ledger Statement"
                          style={{ color: 'var(--primary)' }}
                        >
                          <BookOpen size={13} /> Ledger
                        </button>
                        <button
                          className="btn btn-ghost btn-sm btn-icon"
                          onClick={() => openEditModal(c)}
                          title="Edit Customer"
                        >
                          <Edit3 size={13} />
                        </button>
                        <button
                          className="btn btn-ghost btn-sm btn-icon"
                          onClick={() => handleDeleteCustomer(c.customer_id)}
                          title="Delete Customer"
                          style={{ color: 'var(--danger)' }}
                          disabled={deleteCustomerMutation.isPending}
                        >
                          <Trash2 size={13} />
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

      {/* ── Modal: Add Customer ──────────────────────────────────── */}
      {showAddModal && (
        <div className="overlay">
          <div className="modal">
            <div className="modal-hdr">
              <span className="modal-title">New Client Profile</span>
              <button className="tb-btn" onClick={() => setShowAddModal(false)}>
                <X size={15} />
              </button>
            </div>
            <form onSubmit={handleCreateCustomer}>
              <div className="modal-body">
                {formError && (
                  <div className="login-err" style={{ marginBottom: 16, alignItems: 'flex-start' }}>
                    <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
                    <div style={{ flex: 1 }}>{formError}</div>
                  </div>
                )}
                {renderFormFields()}
              </div>

              <div className="modal-ftr">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setShowAddModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={formLoading}>
                  {formLoading ? 'Creating...' : 'Create Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Edit Customer ─────────────────────────────────── */}
      {showEditModal && (
        <div className="overlay">
          <div className="modal">
            <div className="modal-hdr">
              <span className="modal-title">Edit Client Details</span>
              <button className="tb-btn" onClick={() => setShowEditModal(false)}>
                <X size={15} />
              </button>
            </div>
            <form onSubmit={handleUpdateCustomer}>
              <div className="modal-body">
                {formError && (
                  <div className="login-err" style={{ marginBottom: 16, alignItems: 'flex-start' }}>
                    <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
                    <div style={{ flex: 1 }}>{formError}</div>
                  </div>
                )}
                {renderFormFields()}
              </div>

              <div className="modal-ftr">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setShowEditModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={formLoading}>
                  {formLoading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Ledger Summary ─────────────────────────────────── */}
      {showLedgerModal && (
        <div className="overlay">
          <div className="modal modal-sm" style={{ width: 480 }}>
            <div className="modal-hdr" style={{ background: '#0B1426', color: '#fff' }}>
              <span className="modal-title" style={{ color: '#fff' }}>
                Ledger Account Statement
              </span>
              <button
                className="tb-btn"
                onClick={closeLedgerModal}
                style={{ color: '#8898AA' }}
              >
                <X size={15} />
              </button>
            </div>

            <div className="modal-body" style={{ padding: 24 }}>
              {ledgerLoading ? (
                <div className="loading" style={{ padding: '40px 0' }}>
                  <div className="spinner" />
                </div>
              ) : ledgerSummary ? (
                <div>
                  <div style={{ textAlign: 'center', marginBottom: 24 }}>
                    <div
                      style={{
                        fontSize: 13,
                        textTransform: 'uppercase',
                        letterSpacing: 0.6,
                        color: 'var(--t3)',
                        fontWeight: 600
                      }}
                    >
                      Outstanding Statement
                    </div>
                    <div
                      style={{ fontSize: 18, fontWeight: 700, marginTop: 4, color: 'var(--t1)' }}
                    >
                      {ledgerSummary.customer_name}
                    </div>
                  </div>

                  <div
                    className="col gap-3"
                    style={{
                      background: '#F8FAFC',
                      borderRadius: 'var(--r-lg)',
                      padding: 18,
                      border: '1px solid var(--border)'
                    }}
                  >
                    <div className="row jc-sb">
                      <span className="t2 fw6">Total Debit (Billed)</span>
                      <span className="t1 fw6" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {inr(ledgerSummary.total_debit)}
                      </span>
                    </div>

                    <div
                      className="row jc-sb"
                      style={{ borderBottom: '1px dashed var(--border)', paddingBottom: 12 }}
                    >
                      <span className="t2 fw6">Total Credit (Received)</span>
                      <span
                        className="t1 fw6"
                        style={{ color: 'var(--success)', fontVariantNumeric: 'tabular-nums' }}
                      >
                        - {inr(ledgerSummary.total_credit)}
                      </span>
                    </div>

                    <div className="row jc-sb" style={{ paddingTop: 6 }}>
                      <span className="t1 fw6" style={{ fontSize: 15 }}>
                        Net Balance Due
                      </span>
                      <span
                        className="t1"
                        style={{
                          fontSize: 18,
                          fontWeight: 800,
                          color:
                            Number(ledgerSummary.current_balance) > 0
                              ? 'var(--danger)'
                              : 'var(--success)',
                          fontVariantNumeric: 'tabular-nums'
                        }}
                      >
                        {inr(ledgerSummary.current_balance)}
                      </span>
                    </div>
                  </div>

                  <div
                    style={{
                      marginTop: 24,
                      padding: '12px 14px',
                      borderRadius: 'var(--r)',
                      background: 'var(--warning-bg)',
                      border: '1px solid #FEF3C7',
                      color: '#B45309',
                      display: 'flex',
                      gap: 10,
                      alignItems: 'flex-start'
                    }}
                  >
                    <HelpCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                    <div style={{ fontSize: 12, lineHeight: 1.4 }}>
                      Debit sums the values of all raised sales invoices. Credit sums all compiled
                      cash or bank payments. The remaining net balance specifies current customer
                      outstanding dues.
                    </div>
                  </div>
                </div>
              ) : (
                <div className="empty">
                  <AlertCircle size={30} color="var(--danger)" />
                  <div className="empty-text" style={{ marginTop: 10 }}>
                    Failed Loading Data
                  </div>
                  <div className="empty-sub">
                    We couldn't retrieve the statements. Close this window and try again.
                  </div>
                </div>
              )}
            </div>

            <div className="modal-ftr">
              <button
                className="btn btn-primary"
                onClick={closeLedgerModal}
                style={{ width: '100%', justifyContent: 'center' }}
              >
                Close Summary
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
