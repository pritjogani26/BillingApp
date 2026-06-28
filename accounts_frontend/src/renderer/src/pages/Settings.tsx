import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Building,
  User,
  Lock,
  Edit2,
  Check,
  AlertCircle,
  Save,
  Shield,
  KeyRound,
  Store,
  Database
} from 'lucide-react'
import client from '../api/client'
import { useAuth } from '../context/AuthContext'
import BackupSection from './BackupSection'
import { parseApiError } from '../utils/errorHelper'


interface CompanyData {
  company_name: string
  gstin: string
  pan_number: string
  address: string
  city: string
  state: string
  pincode: string
  phone: string
  email: string
  bank_name: string
  account_number: string
  ifsc_code: string
}

export default function Settings() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<'company' | 'user' | 'password' | 'backup'>('company')

  const queryClient = useQueryClient()

  const [isEditingCompany, setIsEditingCompany] = useState(false)
  const [companyForm, setCompanyForm] = useState<CompanyData>({
    company_name: '',
    gstin: '',
    pan_number: '',
    address: '',
    city: '',
    state: '',
    pincode: '',
    phone: '',
    email: '',
    bank_name: '',
    account_number: '',
    ifsc_code: ''
  })

  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // UI state
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: React.ReactNode | string } | null>(null)
  const [companyFieldErrors, setCompanyFieldErrors] = useState<Record<string, string[]>>({})
  const [passwordFieldErrors, setPasswordFieldErrors] = useState<Record<string, string[]>>({})

  // Queries
  const { data: companyProfileData, isLoading: loadingCompany } = useQuery({
    queryKey: ['companyProfile'],
    queryFn: async () => {
      const res = await client.get('/company/profile/')
      return res.data.data as CompanyData
    }
  })

  const company = companyProfileData || null

  const showNotification = (type: 'success' | 'error', text: React.ReactNode | string) => {
    setMessage({ type, text })
    setTimeout(() => {
      setMessage(null)
    }, 6000)
  }

  // Mutations
  const updateCompanyMutation = useMutation({
    mutationFn: async (updatedData: CompanyData) => {
      const res = await client.put('/company/profile/', updatedData)
      return res.data
    },
    onSuccess: () => {
      setIsEditingCompany(false)
      setCompanyFieldErrors({})
      queryClient.invalidateQueries({ queryKey: ['companyProfile'] })
      showNotification('success', 'Company profile updated successfully')
    },
    onError: (err: any) => {
      const { formError, fieldErrors } = parseApiError(err, 'Failed to update company profile')
      showNotification('error', formError)
      setCompanyFieldErrors(fieldErrors)
    }
  })

  const changePasswordMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await client.post('/auth/change-password/', payload)
      return res.data
    },
    onSuccess: () => {
      showNotification('success', 'Password changed successfully')
      setOldPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setPasswordFieldErrors({})
    },
    onError: (err: any) => {
      const { formError, fieldErrors } = parseApiError(err, 'Failed to change password')
      showNotification('error', formError)
      setPasswordFieldErrors(fieldErrors)
    }
  })

  const startEditingCompany = () => {
    if (company) {
      setCompanyForm({
        company_name: company.company_name ?? '',
        gstin: company.gstin ?? '',
        pan_number: company.pan_number ?? '',
        address: company.address ?? '',
        city: company.city ?? '',
        state: company.state ?? '',
        pincode: company.pincode ?? '',
        phone: company.phone ?? '',
        email: company.email ?? '',
        bank_name: company.bank_name ?? '',
        account_number: company.account_number ?? '',
        ifsc_code: company.ifsc_code ?? ''
      })
    }
    setCompanyFieldErrors({})
    setIsEditingCompany(true)
  }

  const handleCompanyFieldChange = (field: keyof CompanyData, val: string) => {
    setCompanyForm((prev) => ({ ...prev, [field]: val }))
    if (companyFieldErrors[field]) {
      setCompanyFieldErrors((prev) => ({ ...prev, [field]: [] }))
    }
  }

  const handlePasswordChange = (
    field: 'old_password' | 'new_password' | 'confirm_password',
    val: string
  ) => {
    if (field === 'old_password') {
      setOldPassword(val)
      if (passwordFieldErrors.old_password) {
        setPasswordFieldErrors((prev) => ({ ...prev, old_password: [] }))
      }
    }
    if (field === 'new_password') {
      setNewPassword(val)
      if (passwordFieldErrors.new_password) {
        setPasswordFieldErrors((prev) => ({ ...prev, new_password: [] }))
      }
    }
    if (field === 'confirm_password') {
      setConfirmPassword(val)
      if (passwordFieldErrors.confirm_password) {
        setPasswordFieldErrors((prev) => ({ ...prev, confirm_password: [] }))
      }
    }
  }

  const handleTabChange = (tab: typeof activeTab) => {
    setActiveTab(tab)
    setMessage(null)
    setCompanyFieldErrors({})
    setPasswordFieldErrors({})
    setOldPassword('')
    setNewPassword('')
    setConfirmPassword('')
  }

  // Handle Company Save
  const handleCompanySave = (e: React.FormEvent) => {
    e.preventDefault()
    updateCompanyMutation.mutate(companyForm)
  }

  // Handle Password Save
  const handlePasswordSave = (e: React.FormEvent) => {
    e.preventDefault()
    if (!oldPassword || !newPassword || !confirmPassword) {
      showNotification('error', 'All password fields are required')
      return
    }
    if (newPassword !== confirmPassword) {
      showNotification('error', 'New passwords do not match')
      return
    }
    changePasswordMutation.mutate({
      old_password: oldPassword,
      new_password: newPassword
    })
  }

  return (
    <div className="page" style={{ animation: 'fadeIn 0.25s ease' }}>
      {/* Header */}
      <div className="page-hdr">
        <div>
          <div className="page-title">Settings</div>
          <div className="page-sub">
            Manage your company profile details, your personal account, and security credentials.
          </div>
        </div>
      </div>

      {/* Notifications */}
      {message && (
        <div
          className={`badge ${message.type === 'success' ? 'badge-green' : 'badge-red'}`}
          style={{
            display: 'flex',
            alignItems: message.type === 'error' ? 'flex-start' : 'center',
            gap: '8px',
            padding: '12px 18px',
            borderRadius: 'var(--r-lg)',
            marginBottom: '20px',
            fontSize: '13px',
            width: 'fit-content',
            animation: 'slideUp 0.2s ease',
            boxShadow: 'var(--sh)'
          }}
        >
          {message.type === 'success' ? (
            <Check size={16} />
          ) : (
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
          )}
          <div style={{ flex: 1 }}>{message.text}</div>
        </div>
      )}

      {/* Layout Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '240px 1fr',
          gap: '24px',
          alignItems: 'start'
        }}
      >
        {/* Settings Subsections List (Tabs) */}
        <div className="card" style={{ padding: '8px' }}>
          <div
            style={{
              padding: '10px 12px 6px',
              fontSize: '10px',
              fontWeight: 700,
              color: 'var(--t3)',
              textTransform: 'uppercase',
              letterSpacing: '1px'
            }}
          >
            Subsections
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
             {([
              { key: 'company', icon: Store, label: 'Company Profile' },
              { key: 'user', icon: User, label: 'User Profile' },
              { key: 'password', icon: Lock, label: 'Change Password' },
              { key: 'backup', icon: Database, label: 'Database Backup' }
            ] as const).map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                onClick={() => handleTabChange(key)}
                className="btn btn-ghost"
                style={{
                  justifyContent: 'flex-start',
                  width: '100%',
                  background: activeTab === key ? 'var(--primary-light)' : 'transparent',
                  color: activeTab === key ? 'var(--primary-dark)' : 'var(--t2)',
                  fontWeight: activeTab === key ? 600 : 400,
                  padding: '10px 16px',
                  borderLeft: `3px solid ${activeTab === key ? 'var(--primary)' : 'transparent'}`,
                  borderRadius: activeTab === key ? '0 var(--r) var(--r) 0' : 'var(--r)',
                  transition: 'all 0.2s ease',
                  gap: '12px'
                }}
              >
                <Icon
                  size={16}
                  style={{ color: activeTab === key ? 'var(--primary)' : 'var(--t3)' }}
                />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Subsection Content */}
        {activeTab === 'backup' ? (
          <div>
            <BackupSection />
          </div>
        ) : (
          <div className="card">
            {/* 1) COMPANY PROFILE */}
            {activeTab === 'company' && (
              <div style={{ position: 'relative' }}>
                {(loadingCompany || updateCompanyMutation.isPending) && (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'rgba(255,255,255,0.7)',
                      zIndex: 10,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <div className="spinner" />
                  </div>
                )}

                <div className="card-hdr" style={{ background: '#f8fafc' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Building size={18} color="var(--primary)" />
                    <span className="card-title" style={{ fontSize: '15px' }}>
                      Company Profile Details
                    </span>
                  </div>
                  {!isEditingCompany && (
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={startEditingCompany}
                    >
                      <Edit2 size={13} /> Edit Profile
                    </button>
                  )}
                </div>

                <div style={{ padding: '24px' }}>
                  {isEditingCompany ? (
                    <form onSubmit={handleCompanySave}>
                      <div className="fgrid2">
                        <div className="fgrp span2">
                          <label className="flabel">Company Name</label>
                          <input
                            type="text"
                            className={`finput ${companyFieldErrors.company_name?.length ? 'err' : ''}`}
                            required
                            value={companyForm.company_name}
                            onChange={(e) =>
                              handleCompanyFieldChange('company_name', e.target.value.toUpperCase())
                            }
                          />
                          {companyFieldErrors.company_name?.map((errMsg, idx) => (
                            <div key={idx} className="ferr">{errMsg}</div>
                          ))}
                        </div>
                        <div className="fgrp">
                          <label className="flabel">GSTIN</label>
                          <input
                            type="text"
                            className={`finput ${companyFieldErrors.gstin?.length ? 'err' : ''}`}
                            required
                            maxLength={15}
                            value={companyForm.gstin}
                            onChange={(e) =>
                              handleCompanyFieldChange('gstin', e.target.value.toUpperCase())
                            }
                          />
                          {companyFieldErrors.gstin?.map((errMsg, idx) => (
                            <div key={idx} className="ferr">{errMsg}</div>
                          ))}
                        </div>
                        <div className="fgrp">
                          <label className="flabel">PAN Number</label>
                          <input
                            type="text"
                            className={`finput ${companyFieldErrors.pan_number?.length ? 'err' : ''}`}
                            maxLength={10}
                            value={companyForm.pan_number}
                            onChange={(e) =>
                              handleCompanyFieldChange('pan_number', e.target.value.toUpperCase())
                            }
                          />
                          {companyFieldErrors.pan_number?.map((errMsg, idx) => (
                            <div key={idx} className="ferr">{errMsg}</div>
                          ))}
                        </div>
                        <div className="fgrp span2">
                          <label className="flabel">Address</label>
                          <textarea
                            rows={2}
                            className={`finput ${companyFieldErrors.address?.length ? 'err' : ''}`}
                            style={{ resize: 'none', fontFamily: 'inherit' }}
                            required
                            value={companyForm.address}
                            onChange={(e) =>
                              handleCompanyFieldChange('address', e.target.value.toUpperCase())
                            }
                          />
                          {companyFieldErrors.address?.map((errMsg, idx) => (
                            <div key={idx} className="ferr">{errMsg}</div>
                          ))}
                        </div>
                        <div className="fgrp">
                          <label className="flabel">City</label>
                          <input
                            type="text"
                            className={`finput ${companyFieldErrors.city?.length ? 'err' : ''}`}
                            required
                            value={companyForm.city}
                            onChange={(e) =>
                              handleCompanyFieldChange('city', e.target.value.toUpperCase())
                            }
                          />
                          {companyFieldErrors.city?.map((errMsg, idx) => (
                            <div key={idx} className="ferr">{errMsg}</div>
                          ))}
                        </div>
                        <div className="fgrp">
                          <label className="flabel">State</label>
                          <input
                            type="text"
                            className={`finput ${companyFieldErrors.state?.length ? 'err' : ''}`}
                            required
                            value={companyForm.state}
                            onChange={(e) =>
                              handleCompanyFieldChange('state', e.target.value.toUpperCase())
                            }
                          />
                          {companyFieldErrors.state?.map((errMsg, idx) => (
                            <div key={idx} className="ferr">{errMsg}</div>
                          ))}
                        </div>
                        <div className="fgrp">
                          <label className="flabel">Pincode</label>
                          <input
                            type="text"
                            className={`finput ${companyFieldErrors.pincode?.length ? 'err' : ''}`}
                            required
                            maxLength={6}
                            value={companyForm.pincode}
                            onChange={(e) =>
                              handleCompanyFieldChange('pincode', e.target.value.replace(/\D/g, ''))
                            }
                          />
                          {companyFieldErrors.pincode?.map((errMsg, idx) => (
                            <div key={idx} className="ferr">{errMsg}</div>
                          ))}
                        </div>
                        <div className="fgrp">
                          <label className="flabel">Phone</label>
                          <input
                            type="text"
                            className={`finput ${companyFieldErrors.phone?.length ? 'err' : ''}`}
                            required
                            maxLength={20}
                            value={companyForm.phone}
                            onChange={(e) =>
                              handleCompanyFieldChange('phone', e.target.value.toUpperCase())
                            }
                          />
                          {companyFieldErrors.phone?.map((errMsg, idx) => (
                            <div key={idx} className="ferr">{errMsg}</div>
                          ))}
                        </div>
                        <div className="fgrp">
                          <label className="flabel">Email Address</label>
                          <input
                            type="email"
                            className={`finput ${companyFieldErrors.email?.length ? 'err' : ''}`}
                            required
                            value={companyForm.email}
                            onChange={(e) =>
                              handleCompanyFieldChange('email', e.target.value.toLowerCase())
                            }
                          />
                          {companyFieldErrors.email?.map((errMsg, idx) => (
                            <div key={idx} className="ferr">{errMsg}</div>
                          ))}
                        </div>
   
                        <div
                          className="span2"
                          style={{
                            margin: '12px 0 6px',
                            borderTop: '1px solid var(--border)',
                            paddingTop: '16px',
                            fontSize: '12px',
                            fontWeight: 700,
                            color: 'var(--t3)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px'
                          }}
                        >
                          Bank Details
                        </div>
   
                        <div className="fgrp span2">
                          <label className="flabel">Bank Name</label>
                          <input
                            type="text"
                            className={`finput ${companyFieldErrors.bank_name?.length ? 'err' : ''}`}
                            required
                            value={companyForm.bank_name}
                            onChange={(e) =>
                              handleCompanyFieldChange('bank_name', e.target.value.toUpperCase())
                            }
                          />
                          {companyFieldErrors.bank_name?.map((errMsg, idx) => (
                            <div key={idx} className="ferr">{errMsg}</div>
                          ))}
                        </div>
                        <div className="fgrp">
                          <label className="flabel">Account Number</label>
                          <input
                            type="text"
                            className={`finput ${companyFieldErrors.account_number?.length ? 'err' : ''}`}
                            required
                            maxLength={100}
                            value={companyForm.account_number}
                            onChange={(e) =>
                              handleCompanyFieldChange('account_number', e.target.value.toUpperCase())
                            }
                          />
                          {companyFieldErrors.account_number?.map((errMsg, idx) => (
                            <div key={idx} className="ferr">{errMsg}</div>
                          ))}
                        </div>
                        <div className="fgrp">
                          <label className="flabel">IFSC Code</label>
                          <input
                            type="text"
                            className={`finput ${companyFieldErrors.ifsc_code?.length ? 'err' : ''}`}
                            required
                            maxLength={11}
                            value={companyForm.ifsc_code}
                            onChange={(e) =>
                              handleCompanyFieldChange('ifsc_code', e.target.value.toUpperCase())
                            }
                          />
                          {companyFieldErrors.ifsc_code?.map((errMsg, idx) => (
                            <div key={idx} className="ferr">{errMsg}</div>
                          ))}
                        </div>
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'flex-end',
                          gap: '10px',
                          marginTop: '16px'
                        }}
                      >
                        <button
                          type="button"
                          className="btn btn-outline"
                          onClick={() => {
                            setIsEditingCompany(false)
                          }}
                        >
                          Cancel
                        </button>
                        <button type="submit" className="btn btn-primary">
                          <Save size={15} /> Save Changes
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div>
                      {company ? (
                        <div>
                          {/* Business Profile Header Card */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, borderBottom: '1px solid var(--border)', paddingBottom: 20 }}>
                            <div style={{ width: 64, height: 64, borderRadius: 12, background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)', border: '1px solid var(--border)', boxShadow: 'var(--sh)' }}>
                              <Building size={30} />
                            </div>
                            <div>
                              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--t1)' }}>
                                {company.company_name || '—'}
                              </div>
                              <div style={{ fontSize: '13px', color: 'var(--t3)', marginTop: 4 }}>
                                Official Business Identity & Financial Profile
                              </div>
                            </div>
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                            {/* Identity & Tax Profile */}
                            <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: 18, background: '#fff', boxShadow: 'var(--sh)' }}>
                              <h4 style={{ fontSize: '12px', fontWeight: 700, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Shield size={15} style={{ color: 'var(--primary)' }} /> Identity & Tax Info
                              </h4>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                <div>
                                  <span style={{ fontSize: '11px', color: 'var(--t3)', fontWeight: 600, display: 'block', marginBottom: 4 }}>GSTIN</span>
                                  <span className="badge badge-blue" style={{ fontSize: '12px', fontFamily: 'monospace', fontWeight: 600 }}>{company.gstin || '—'}</span>
                                </div>
                                <div>
                                  <span style={{ fontSize: '11px', color: 'var(--t3)', fontWeight: 600, display: 'block', marginBottom: 4 }}>PAN Number</span>
                                  <span className="badge badge-gray" style={{ fontSize: '12px', fontFamily: 'monospace', fontWeight: 600 }}>{company.pan_number || '—'}</span>
                                </div>
                              </div>
                            </div>

                            {/* Contact Details */}
                            <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: 18, background: '#fff', boxShadow: 'var(--sh)' }}>
                              <h4 style={{ fontSize: '12px', fontWeight: 700, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <User size={15} style={{ color: 'var(--primary)' }} /> Contact & Location
                              </h4>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                <div>
                                  <span style={{ fontSize: '11px', color: 'var(--t3)', display: 'block' }}>Phone</span>
                                  <span style={{ fontSize: '13.5px', color: 'var(--t1)', fontWeight: 600 }}>{company.phone || '—'}</span>
                                </div>
                                <div>
                                  <span style={{ fontSize: '11px', color: 'var(--t3)', display: 'block' }}>Email Address</span>
                                  <span style={{ fontSize: '13.5px', color: 'var(--t1)', fontWeight: 600 }}>{company.email || '—'}</span>
                                </div>
                                <div>
                                  <span style={{ fontSize: '11px', color: 'var(--t3)', display: 'block' }}>Address Details</span>
                                  <span style={{ fontSize: '13px', color: 'var(--t2)', lineHeight: 1.4, fontWeight: 500 }}>
                                    {(() => {
                                      const parts = [company.address, company.city, company.state].filter(Boolean)
                                      const mainAddress = parts.join(', ')
                                      return mainAddress
                                        ? (mainAddress + (company.pincode ? ` - ${company.pincode}` : ''))
                                        : (company.pincode || '—')
                                    })()}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Bank details */}
                            <div style={{ gridColumn: 'span 2', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: 18, background: '#F8FAFC', boxShadow: 'var(--sh)' }}>
                              <h4 style={{ fontSize: '12px', fontWeight: 700, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Lock size={15} style={{ color: 'var(--primary)' }} /> Bank Account Information
                              </h4>
                              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 16 }}>
                                <div>
                                  <span style={{ fontSize: '11px', color: 'var(--t3)', display: 'block', marginBottom: 2 }}>Bank Name</span>
                                  <span style={{ fontSize: '13.5px', color: 'var(--t1)', fontWeight: 600 }}>{company.bank_name || '—'}</span>
                                </div>
                                <div>
                                  <span style={{ fontSize: '11px', color: 'var(--t3)', display: 'block', marginBottom: 2 }}>Account Number</span>
                                  <span style={{ fontSize: '13.5px', color: 'var(--t1)', fontFamily: 'monospace', fontWeight: 600 }}>{company.account_number || '—'}</span>
                                </div>
                                <div>
                                  <span style={{ fontSize: '11px', color: 'var(--t3)', display: 'block', marginBottom: 2 }}>IFSC Code</span>
                                  <span style={{ fontSize: '13.5px', color: 'var(--t1)', fontFamily: 'monospace', fontWeight: 600 }}>{company.ifsc_code || '—'}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div style={{ textAlign: 'center', padding: '20px', color: 'var(--t3)' }}>
                          No company details loaded.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 2) USER PROFILE */}
            {activeTab === 'user' && (
              <div>
                <div className="card-hdr" style={{ background: '#f8fafc' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Shield size={18} color="var(--primary)" />
                    <span className="card-title" style={{ fontSize: '15px' }}>
                      User Account Settings
                    </span>
                  </div>
                </div>

                <div style={{ padding: '24px' }}>
                  {/* Avatar & Header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, borderBottom: '1px solid var(--border)', paddingBottom: 20 }}>
                    <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'linear-gradient(135deg, var(--primary), #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 24, fontWeight: 700, boxShadow: 'var(--sh)' }}>
                      {user?.full_name ? user.full_name.charAt(0).toUpperCase() : 'U'}
                    </div>
                    <div>
                      <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--t1)' }}>
                        {user?.full_name || 'System User'}
                      </div>
                      <div style={{ fontSize: '13px', color: 'var(--t3)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                        Username ID: <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--t2)' }}>{user?.username}</span>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: 18, background: '#fff', boxShadow: 'var(--sh)' }}>
                      <span style={{ fontSize: '11px', color: 'var(--t3)', fontWeight: 600, display: 'block', marginBottom: 4 }}>System Permission Role</span>
                      <span className="badge badge-green" style={{ textTransform: 'uppercase', fontSize: '11.5px', fontWeight: 600 }}>{user?.role || '—'}</span>
                    </div>
                    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: 18, background: '#fff', boxShadow: 'var(--sh)' }}>
                      <span style={{ fontSize: '11px', color: 'var(--t3)', fontWeight: 600, display: 'block', marginBottom: 4 }}>User ID Code</span>
                      <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--t1)', fontFamily: 'monospace' }}>#{user?.user_id || 'N/A'}</span>
                    </div>

                    {/* Security Notice */}
                    <div
                      style={{
                        gridColumn: 'span 2',
                        background: 'var(--warning-bg)',
                        padding: '16px 20px',
                        borderRadius: 'var(--r-lg)',
                        border: '1px solid #FEF3C7',
                        color: '#B45309',
                        display: 'flex',
                        gap: '12px',
                        alignItems: 'flex-start'
                      }}
                    >
                      <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
                      <div>
                        <div
                          style={{
                            fontSize: '13px',
                            fontWeight: 700,
                            marginBottom: '4px'
                          }}
                        >
                          Admin Control Restriction Notice
                        </div>
                        <div style={{ fontSize: '12px', lineHeight: 1.5, opacity: 0.9 }}>
                          Modifications to authorization roles, status parameters, or company bindings
                          must be approved and applied by the Chief System Administrator to preserve audit records.
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 3) CHANGE PASSWORD */}
            {activeTab === 'password' && (
              <div style={{ position: 'relative' }}>
                {changePasswordMutation.isPending && (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'rgba(255,255,255,0.7)',
                      zIndex: 10,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <div className="spinner" />
                  </div>
                )}

                <div className="card-hdr" style={{ background: '#f8fafc' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <KeyRound size={18} color="var(--primary)" />
                    <span className="card-title" style={{ fontSize: '15px' }}>
                      Change Password Credentials
                    </span>
                  </div>
                </div>

                <div style={{ padding: '24px' }}>
                  <form onSubmit={handlePasswordSave} style={{ maxWidth: '440px' }}>
                    <div className="fgrp">
                      <label className="flabel">Current System Password</label>
                      <input
                        type="password"
                        className={`finput ${passwordFieldErrors.old_password?.length ? 'err' : ''}`}
                        required
                        placeholder="Enter your current password"
                        value={oldPassword}
                        onChange={(e) => handlePasswordChange('old_password', e.target.value)}
                      />
                      {passwordFieldErrors.old_password?.map((errMsg, idx) => (
                        <div key={idx} className="ferr">{errMsg}</div>
                      ))}
                    </div>
   
                    <div className="fgrp" style={{ marginTop: '18px' }}>
                      <label className="flabel">New Secure Password</label>
                      <input
                        type="password"
                        className={`finput ${passwordFieldErrors.new_password?.length ? 'err' : ''}`}
                        required
                        placeholder="At least 8 characters"
                        value={newPassword}
                        onChange={(e) => handlePasswordChange('new_password', e.target.value)}
                      />
                      {passwordFieldErrors.new_password?.map((errMsg, idx) => (
                        <div key={idx} className="ferr">{errMsg}</div>
                      ))}
                    </div>
   
                    <div className="fgrp">
                      <label className="flabel">Confirm New Password</label>
                      <input
                        type="password"
                        className={`finput ${passwordFieldErrors.confirm_password?.length ? 'err' : ''}`}
                        required
                        placeholder="Re-enter new password"
                        value={confirmPassword}
                        onChange={(e) => handlePasswordChange('confirm_password', e.target.value)}
                      />
                      {passwordFieldErrors.confirm_password?.map((errMsg, idx) => (
                        <div key={idx} className="ferr">{errMsg}</div>
                      ))}
                    </div>

                    <button
                      type="submit"
                      className="btn btn-primary"
                      style={{ marginTop: '20px', width: '100%', justifyContent: 'center', padding: '10px 16px' }}
                    >
                      <Save size={15} /> Update Credentials
                    </button>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
