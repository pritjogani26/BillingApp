// src/renderer/src/pages/Products.tsx

import React, { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Plus, Edit3, Trash2, X, AlertCircle, Package } from 'lucide-react'
import client from '../api/client'

interface Product {
  product_id: number
  customer_id: number | null
  product_name: string
  hsn_code: string
  gst_percentage: number | string
  height: number | string
  width: number | string
  unit_price: number | string
  description: string
  status: string
}

const inr = (n: number | string | null | undefined) =>
  n == null
    ? '₹0'
    : '₹' +
      Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const initialForm = {
  customer_id: '',
  product_name: '',
  hsn_code: '94054090',
  gst_percentage: '18.00',
  height: '0.00',
  width: '0.00',
  unit_price: '0.00',
  description: ''
}

export default function Products() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [selected, setSelected] = useState<Product | null>(null)

  const [form, setForm] = useState(initialForm)
  const [formError, setFormError] = useState('')

  // Debounce search changes
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search)
    }, 300)
    return () => clearTimeout(handler)
  }, [search])

  // 1. Fetch Products
  const { data: productsData, isLoading: loadingProducts, error: productsError } = useQuery({
    queryKey: ['products', debouncedSearch],
    queryFn: async () => {
      const res = await client.get(`/products/?search=${debouncedSearch}`)
      return (res.data.data.products || []) as Product[]
    }
  })

  // 2. Fetch Customers for Dropdown
  const { data: customersData } = useQuery({
    queryKey: ['customersDropdown'],
    queryFn: async () => {
      const res = await client.get('/customers/?search=')
      return (res.data.data.customers || []) as any[]
    }
  })

  // 3. Create Product Mutation
  const createProductMutation = useMutation({
    mutationFn: async (newProduct: typeof form) => {
      const res = await client.post('/products/', newProduct)
      return res.data
    },
    onSuccess: () => {
      setShowAddModal(false)
      queryClient.invalidateQueries({ queryKey: ['products'] })
    },
    onError: (err: any) => {
      setFormError(err.response?.data?.message || 'Failed to create product.')
    }
  })

  // 4. Update Product Mutation
  const updateProductMutation = useMutation({
    mutationFn: async (updatedData: { id: number; form: typeof form }) => {
      const res = await client.put(`/products/${updatedData.id}/`, updatedData.form)
      return res.data
    },
    onSuccess: () => {
      setShowEditModal(false)
      queryClient.invalidateQueries({ queryKey: ['products'] })
    },
    onError: (err: any) => {
      setFormError(err.response?.data?.message || 'Failed to update product.')
    }
  })

  // 5. Delete Product Mutation
  const deleteProductMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await client.delete(`/products/${id}/`)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
    },
    onError: (err: any) => {
      alert(err.response?.data?.message || 'Failed to delete product.')
    }
  })

  const products = productsData || []
  const loading = loadingProducts
  const error = productsError ? 'Error connecting to server.' : ''
  const customers = customersData || []
  const formLoading = createProductMutation.isPending || updateProductMutation.isPending

  // Reactive price calculations: height * width * customer_rate
  useEffect(() => {
    const h = parseFloat(form.height) || 0
    const w = parseFloat(form.width) || 0
    const selectedCust = customers.find((c) => String(c.customer_id) === form.customer_id)
    const rate = selectedCust ? parseFloat(String(selectedCust.default_rate)) || 0 : 0
    if (h > 0 && w > 0 && rate > 0) {
      const calculatedPrice = ((h * w * rate)/100)
      setForm((prev) => ({ ...prev, unit_price: calculatedPrice.toFixed(2) }))
    }
  }, [form.height, form.width, form.customer_id, customers])

  const handleInput = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    setForm({ ...form, [e.target.name]: e.target.value })
    if (formError) setFormError('')
  }

  const openAdd = () => {
    setForm(initialForm)
    setFormError('')
    setShowAddModal(true)
  }

  const openEdit = (p: Product) => {
    setSelected(p)
    setForm({
      customer_id: p.customer_id ? String(p.customer_id) : '',
      product_name: p.product_name,
      hsn_code: p.hsn_code || '',
      gst_percentage: String(p.gst_percentage),
      height: String(p.height),
      width: String(p.width),
      unit_price: String(p.unit_price),
      description: p.description || ''
    })
    setFormError('')
    setShowEditModal(true)
  }

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.customer_id) {
      setFormError('Customer selection is required.')
      return
    }
    if (!form.product_name.trim()) {
      setFormError('Product name is required.')
      return
    }
    setFormError('')
    createProductMutation.mutate(form)
  }

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selected) return
    if (!form.customer_id) {
      setFormError('Customer selection is required.')
      return
    }
    if (!form.product_name.trim()) {
      setFormError('Product name is required.')
      return
    }
    setFormError('')
    updateProductMutation.mutate({ id: selected.product_id, form })
  }

  const handleDelete = (id: number) => {
    if (!window.confirm('Delete this product?')) return
    deleteProductMutation.mutate(id)
  }

  const renderFormBody = () => (
    <div className="modal-body">
      {formError && (
        <div className="login-err" style={{ marginBottom: 16 }}>
          <AlertCircle size={15} />
          {formError}
        </div>
      )}

      <div className="fgrp">
        <label className="flabel">Customer Mapping *</label>
        <select
          className="finput"
          name="customer_id"
          value={form.customer_id}
          onChange={handleInput}
          required
        >
          <option value="">— Select Customer —</option>
          {customers.map((c) => (
            <option key={c.customer_id} value={c.customer_id}>
              {c.customer_name} (Rate: ₹{parseFloat(c.default_rate).toFixed(2)}/sq ft)
            </option>
          ))}
        </select>
      </div>

      <div className="fgrp">
        <label className="flabel">Product / Service Name *</label>
        <input
          className="finput"
          name="product_name"
          value={form.product_name}
          onChange={handleInput}
          placeholder="e.g. Flex Banner 13oz"
          required
        />
      </div>

      <div className="fgrid2">
        <div className="fgrp">
          <label className="flabel">HSN Code</label>
          <input
            className="finput"
            name="hsn_code"
            value={form.hsn_code}
            onChange={handleInput}
            placeholder="e.g. 4911"
          />
        </div>
        <div className="fgrp">
          <label className="flabel">GST %</label>
          <input
            className="finput"
            name="gst_percentage"
            type="number"
            step="0.01"
            value={form.gst_percentage}
            onChange={handleInput}
            placeholder="18.00"
          />
        </div>
      </div>

      <div className="fgrid2" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <div className="fgrp">
          <label className="flabel">Height (ft)</label>
          <input
            className="finput"
            name="height"
            type="number"
            step="0.01"
            value={form.height}
            onChange={handleInput}
            placeholder="0.00"
          />
        </div>
        <div className="fgrp">
          <label className="flabel">Width (ft)</label>
          <input
            className="finput"
            name="width"
            type="number"
            step="0.01"
            value={form.width}
            onChange={handleInput}
            placeholder="0.00"
          />
        </div>
        <div className="fgrp">
          <label className="flabel">Unit Price (₹) *</label>
          <input
            className="finput"
            name="unit_price"
            type="number"
            step="0.01"
            value={form.unit_price}
            onChange={handleInput}
            placeholder="0.00"
            readOnly
            style={{ background: '#F1F5F9', color: '#475569', cursor: 'not-allowed' }}
            title="Calculated automatically: Height × Width × Customer Rate / 100 (Excluding GST)"
          />
        </div>
      </div>

      <div className="fgrp">
        <label className="flabel">Description</label>
        <textarea
          className="finput"
          name="description"
          rows={2}
          value={form.description}
          onChange={handleInput}
          placeholder="Optional product description..."
          style={{ resize: 'none', fontFamily: 'var(--font)' }}
        />
      </div>
    </div>
  )

  return (
    <>
      <div className="page-hdr">
        <div>
          <div className="page-title">Products & Services</div>
          <div className="page-sub">
            Manage your product catalogue, pricing, and HSN/GST details.
          </div>
        </div>
        <div className="page-hdr-actions">
          <button className="btn btn-primary" onClick={openAdd}>
            <Plus size={15} /> Add Product
          </button>
        </div>
      </div>

      <div className="card" style={{ animation: 'fadeUp 0.3s ease' }}>
        <div className="card-hdr" style={{ background: '#F8FAFC' }}>
          <div className="search-wrap">
            <Search size={15} className="search-icon" />
            <input
              className="search-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by product name or HSN code..."
              style={{ width: 300 }}
            />
          </div>
          <span className="fs12 t3 fw6">{products.length} Product(s)</span>
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
          ) : products.length === 0 ? (
            <div className="empty">
              <Package size={40} className="empty-icon" />
              <div className="empty-text">No Products Found</div>
              <div className="empty-sub">Add your first product or service to get started.</div>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Product Name</th>
                  <th>HSN Code</th>
                  <th style={{ textAlign: 'right' }}>Dimensions (H × W)</th>
                  <th style={{ textAlign: 'right' }}>Unit Price</th>
                  <th style={{ textAlign: 'right' }}>GST %</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right', paddingRight: 20 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.product_id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{p.product_name}</div>
                      {p.description && (
                        <div className="fs12 t3" style={{ marginTop: 2 }}>
                          {p.description}
                        </div>
                      )}
                    </td>
                    <td>
                      {p.hsn_code ? (
                        <span className="badge badge-blue" style={{ fontFamily: 'monospace' }}>
                          {p.hsn_code}
                        </span>
                      ) : (
                        <span className="t3 fs12">—</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {Number(p.height) > 0 || Number(p.width) > 0 ? (
                        <span className="fs12 t2">
                          {Number(p.height).toFixed(2)} × {Number(p.width).toFixed(2)} ft
                        </span>
                      ) : (
                        <span className="t3 fs12">—</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{inr(p.unit_price)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="badge badge-yellow">
                        {Number(p.gst_percentage).toFixed(1)}%
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${p.status === 'A' ? 'badge-green' : 'badge-red'}`}>
                        {p.status === 'A' ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <div className="row gap-2 jc-end" style={{ paddingRight: 4 }}>
                        <button
                          className="btn btn-ghost btn-sm btn-icon"
                          onClick={() => openEdit(p)}
                          title="Edit"
                        >
                          <Edit3 size={13} />
                        </button>
                        <button
                          className="btn btn-ghost btn-sm btn-icon"
                          onClick={() => handleDelete(p.product_id)}
                          title="Delete"
                          style={{ color: 'var(--danger)' }}
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

      {/* Add Modal */}
      {showAddModal && (
        <div className="overlay">
          <div className="modal">
            <div className="modal-hdr">
              <span className="modal-title">New Product / Service</span>
              <button className="tb-btn" onClick={() => setShowAddModal(false)}>
                <X size={15} />
              </button>
            </div>
            <form onSubmit={handleCreate}>
              {renderFormBody()}
              <div className="modal-ftr">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setShowAddModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={formLoading}>
                  {formLoading ? 'Creating...' : 'Create Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && (
        <div className="overlay">
          <div className="modal">
            <div className="modal-hdr">
              <span className="modal-title">Edit Product</span>
              <button className="tb-btn" onClick={() => setShowEditModal(false)}>
                <X size={15} />
              </button>
            </div>
            <form onSubmit={handleUpdate}>
              {renderFormBody()}
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
    </>
  )
}
