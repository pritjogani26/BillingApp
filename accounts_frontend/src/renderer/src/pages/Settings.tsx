import { useState, useEffect } from 'react'
import {
  Building,
  User,
  Lock,
  Edit2,
  Check,
  AlertCircle,
  Save,
  X,
  Shield,
  KeyRound,
  Store
} from 'lucide-react'
import client from '../api/client'
import { useAuth } from '../context/AuthContext'

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
  invoice_prefix: string
}

export default function Settings() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<'company' | 'user' | 'password'>('company')

  // Company Profile states
  const [company, setCompany] = useState<CompanyData | null>(null)
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
    ifsc_code: '',
    invoice_prefix: ''
  })

  // User Profile states
  const [isEditingUser, setIsEditingUser] = useState(false)
  const [userForm, setUserForm] = useState({
    full_name: user?.full_name || '',
    username: user?.username || ''
  })

  // Change Password states
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // UI state
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    fetchCompanyData()
  }, [])

  const fetchCompanyData = () => {
    setLoading(true)
    client
      .get('/company/profile/')
      .then((res) => {
        if (res.data.success) {
          setCompany(res.data.data)
          setCompanyForm(res.data.data)
        }
      })
      .catch((err) => {
        console.error(err)
        showNotification('error', 'Failed to load company profile')
      })
      .finally(() => setLoading(false))
  }

  const showNotification = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => {
      setMessage(null)
    }, 4000)
  }

  // Handle Company Save
  const handleCompanySave = (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    client
      .put('/company/profile/update/', companyForm)
      .then((res) => {
        if (res.data.success) {
          setCompany(companyForm)
          setIsEditingCompany(false)
          showNotification('success', 'Company profile updated successfully')
        } else {
          showNotification('error', res.data.message || 'Failed to update company profile')
        }
      })
      .catch((err) => {
        console.error(err)
        showNotification('error', 'Server error updating company profile')
      })
      .finally(() => setLoading(false))
  }

  // Handle User Save
  const handleUserSave = (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    // Simulate updating user profile (since there is no direct endpoint in views yet)
    setTimeout(() => {
      setIsEditingUser(false)
      showNotification('success', 'User profile details mock-saved successfully')
      setLoading(false)
    }, 800)
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

    setLoading(true)
    client
      .post('/auth/change-password/', {
        old_password: oldPassword,
        new_password: newPassword
      })
      .then((res) => {
        if (res.data.success) {
          showNotification('success', 'Password changed successfully')
          setOldPassword('')
          setNewPassword('')
          setConfirmPassword('')
        } else {
          showNotification('error', res.data.message || 'Failed to change password')
        }
      })
      .catch((err) => {
        console.error(err)
        const errMsg = err.response?.data?.message || 'Old password incorrect'
        showNotification('error', errMsg)
      })
      .finally(() => setLoading(false))
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
            alignItems: 'center',
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
          {message.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
          <span>{message.text}</span>
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
              padding: '10px 12px',
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
            <button
              onClick={() => setActiveTab('company')}
              className="btn btn-ghost"
              style={{
                justifyContent: 'flex-start',
                width: '100%',
                background: activeTab === 'company' ? 'var(--bg)' : 'transparent',
                color: activeTab === 'company' ? 'var(--primary)' : 'var(--t2)',
                fontWeight: activeTab === 'company' ? 600 : 400
              }}
            >
              <Store size={16} style={{ color: activeTab === 'company' ? 'var(--primary)' : 'var(--t3)' }} />
              Company Profile
            </button>
            <button
              onClick={() => setActiveTab('user')}
              className="btn btn-ghost"
              style={{
                justifyContent: 'flex-start',
                width: '100%',
                background: activeTab === 'user' ? 'var(--bg)' : 'transparent',
                color: activeTab === 'user' ? 'var(--primary)' : 'var(--t2)',
                fontWeight: activeTab === 'user' ? 600 : 400
              }}
            >
              <User size={16} style={{ color: activeTab === 'user' ? 'var(--primary)' : 'var(--t3)' }} />
              User Profile
            </button>
            <button
              onClick={() => setActiveTab('password')}
              className="btn btn-ghost"
              style={{
                justifyContent: 'flex-start',
                width: '100%',
                background: activeTab === 'password' ? 'var(--bg)' : 'transparent',
                color: activeTab === 'password' ? 'var(--primary)' : 'var(--t2)',
                fontWeight: activeTab === 'password' ? 600 : 400
              }}
            >
              <Lock size={16} style={{ color: activeTab === 'password' ? 'var(--primary)' : 'var(--t3)' }} />
              Change Password
            </button>
          </div>
        </div>

        {/* Subsection Content */}
        <div className="card">
          {loading && (
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

          {/* 1) COMPANY PROFILE */}
          {activeTab === 'company' && (
            <div>
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
                    onClick={() => setIsEditingCompany(true)}
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
                          className="finput"
                          required
                          value={companyForm.company_name}
                          onChange={(e) =>
                            setCompanyForm({ ...companyForm, company_name: e.target.value })
                          }
                        />
                      </div>
                      <div className="fgrp">
                        <label className="flabel">GSTIN</label>
                        <input
                          type="text"
                          className="finput"
                          required
                          value={companyForm.gstin}
                          onChange={(e) =>
                            setCompanyForm({ ...companyForm, gstin: e.target.value })
                          }
                        />
                      </div>
                      <div className="fgrp">
                        <label className="flabel">PAN Number</label>
                        <input
                          type="text"
                          className="finput"
                          required
                          value={companyForm.pan_number}
                          onChange={(e) =>
                            setCompanyForm({ ...companyForm, pan_number: e.target.value })
                          }
                        />
                      </div>
                      <div className="fgrp span2">
                        <label className="flabel">Address</label>
                        <textarea
                          rows={2}
                          className="finput"
                          style={{ resize: 'none', fontFamily: 'inherit' }}
                          required
                          value={companyForm.address}
                          onChange={(e) =>
                            setCompanyForm({ ...companyForm, address: e.target.value })
                          }
                        />
                      </div>
                      <div className="fgrp">
                        <label className="flabel">City</label>
                        <input
                          type="text"
                          className="finput"
                          required
                          value={companyForm.city}
                          onChange={(e) =>
                            setCompanyForm({ ...companyForm, city: e.target.value })
                          }
                        />
                      </div>
                      <div className="fgrp">
                        <label className="flabel">State</label>
                        <input
                          type="text"
                          className="finput"
                          required
                          value={companyForm.state}
                          onChange={(e) =>
                            setCompanyForm({ ...companyForm, state: e.target.value })
                          }
                        />
                      </div>
                      <div className="fgrp">
                        <label className="flabel">Pincode</label>
                        <input
                          type="text"
                          className="finput"
                          required
                          value={companyForm.pincode}
                          onChange={(e) =>
                            setCompanyForm({ ...companyForm, pincode: e.target.value })
                          }
                        />
                      </div>
                      <div className="fgrp">
                        <label className="flabel">Invoice Number Prefix</label>
                        <input
                          type="text"
                          className="finput"
                          required
                          placeholder="e.g. INV"
                          value={companyForm.invoice_prefix}
                          onChange={(e) =>
                            setCompanyForm({ ...companyForm, invoice_prefix: e.target.value })
                          }
                        />
                      </div>
                      <div className="fgrp">
                        <label className="flabel">Phone</label>
                        <input
                          type="text"
                          className="finput"
                          required
                          value={companyForm.phone}
                          onChange={(e) =>
                            setCompanyForm({ ...companyForm, phone: e.target.value })
                          }
                        />
                      </div>
                      <div className="fgrp">
                        <label className="flabel">Email Address</label>
                        <input
                          type="email"
                          className="finput"
                          required
                          value={companyForm.email}
                          onChange={(e) =>
                            setCompanyForm({ ...companyForm, email: e.target.value })
                          }
                        />
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
                          className="finput"
                          required
                          value={companyForm.bank_name}
                          onChange={(e) =>
                            setCompanyForm({ ...companyForm, bank_name: e.target.value })
                          }
                        />
                      </div>
                      <div className="fgrp">
                        <label className="flabel">Account Number</label>
                        <input
                          type="text"
                          className="finput"
                          required
                          value={companyForm.account_number}
                          onChange={(e) =>
                            setCompanyForm({ ...companyForm, account_number: e.target.value })
                          }
                        />
                      </div>
                      <div className="fgrp">
                        <label className="flabel">IFSC Code</label>
                        <input
                          type="text"
                          className="finput"
                          required
                          value={companyForm.ifsc_code}
                          onChange={(e) =>
                            setCompanyForm({ ...companyForm, ifsc_code: e.target.value })
                          }
                        />
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
                          if (company) setCompanyForm(company)
                        }}
                      >
                        <X size={15} /> Cancel
                      </button>
                      <button type="submit" className="btn btn-primary">
                        <Save size={15} /> Save Changes
                      </button>
                    </div>
                  </form>
                ) : (
                  <div>
                    {company ? (
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(2, 1fr)',
                          gap: '20px'
                        }}
                      >
                        <div style={{ gridColumn: 'span 2' }}>
                          <span style={{ fontSize: '12px', color: 'var(--t3)', fontWeight: 600 }}>
                            Company Name
                          </span>
                          <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--t1)' }}>
                            {company.company_name}
                          </div>
                        </div>

                        <div>
                          <span style={{ fontSize: '12px', color: 'var(--t3)', fontWeight: 600 }}>
                            GSTIN
                          </span>
                          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--t1)' }}>
                            {company.gstin}
                          </div>
                        </div>
                        <div>
                          <span style={{ fontSize: '12px', color: 'var(--t3)', fontWeight: 600 }}>
                            PAN Number
                          </span>
                          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--t1)' }}>
                            {company.pan_number}
                          </div>
                        </div>

                        <div style={{ gridColumn: 'span 2' }}>
                          <span style={{ fontSize: '12px', color: 'var(--t3)', fontWeight: 600 }}>
                            Address
                          </span>
                          <div style={{ fontSize: '13.5px', color: 'var(--t2)' }}>
                            {company.address}, {company.city}, {company.state} - {company.pincode}
                          </div>
                        </div>

                        <div>
                          <span style={{ fontSize: '12px', color: 'var(--t3)', fontWeight: 600 }}>
                            Phone
                          </span>
                          <div style={{ fontSize: '13.5px', color: 'var(--t2)' }}>
                            {company.phone}
                          </div>
                        </div>
                        <div>
                          <span style={{ fontSize: '12px', color: 'var(--t3)', fontWeight: 600 }}>
                            Email Address
                          </span>
                          <div style={{ fontSize: '13.5px', color: 'var(--t2)' }}>
                            {company.email}
                          </div>
                        </div>

                        <div>
                          <span style={{ fontSize: '12px', color: 'var(--t3)', fontWeight: 600 }}>
                            Invoice Number Prefix
                          </span>
                          <div style={{ fontSize: '13.5px', color: 'var(--t2)' }}>
                            <span className="badge badge-blue">{company.invoice_prefix}</span>
                          </div>
                        </div>

                        <div
                          style={{
                            gridColumn: 'span 2',
                            margin: '10px 0 4px',
                            borderTop: '1px solid var(--border)',
                            paddingTop: '16px'
                          }}
                        >
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 700,
                              color: 'var(--t3)',
                              textTransform: 'uppercase',
                              letterSpacing: '0.5px'
                            }}
                          >
                            Bank Account Information
                          </span>
                        </div>

                        <div style={{ gridColumn: 'span 2' }}>
                          <span style={{ fontSize: '12px', color: 'var(--t3)', fontWeight: 600 }}>
                            Bank Name
                          </span>
                          <div style={{ fontSize: '13.5px', color: 'var(--t2)' }}>
                            {company.bank_name}
                          </div>
                        </div>
                        <div>
                          <span style={{ fontSize: '12px', color: 'var(--t3)', fontWeight: 600 }}>
                            Account Number
                          </span>
                          <div
                            style={{
                              fontSize: '14px',
                              fontWeight: 600,
                              color: 'var(--t1)',
                              fontFamily: 'monospace'
                            }}
                          >
                            {company.account_number}
                          </div>
                        </div>
                        <div>
                          <span style={{ fontSize: '12px', color: 'var(--t3)', fontWeight: 600 }}>
                            IFSC Code
                          </span>
                          <div
                            style={{
                              fontSize: '14px',
                              fontWeight: 600,
                              color: 'var(--t1)',
                              fontFamily: 'monospace'
                            }}
                          >
                            {company.ifsc_code}
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
                {!isEditingUser && (
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => setIsEditingUser(true)}
                  >
                    <Edit2 size={13} /> Edit Profile
                  </button>
                )}
              </div>

              <div style={{ padding: '24px' }}>
                {isEditingUser ? (
                  <form onSubmit={handleUserSave}>
                    <div className="fgrp">
                      <label className="flabel">Full Name</label>
                      <input
                        type="text"
                        className="finput"
                        required
                        value={userForm.full_name}
                        onChange={(e) => setUserForm({ ...userForm, full_name: e.target.value })}
                      />
                    </div>
                    <div className="fgrp">
                      <label className="flabel">Username (Email)</label>
                      <input
                        type="text"
                        className="finput"
                        required
                        value={userForm.username}
                        onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                      />
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                        gap: '10px',
                        marginTop: '20px'
                      }}
                    >
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => {
                          setIsEditingUser(false)
                          setUserForm({
                            full_name: user?.full_name || '',
                            username: user?.username || ''
                          })
                        }}
                      >
                        <X size={15} /> Cancel
                      </button>
                      <button type="submit" className="btn btn-primary">
                        <Save size={15} /> Save Details
                      </button>
                    </div>
                  </form>
                ) : (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(2, 1fr)',
                      gap: '20px'
                    }}
                  >
                    <div>
                      <span style={{ fontSize: '12px', color: 'var(--t3)', fontWeight: 600 }}>
                        User ID
                      </span>
                      <div
                        style={{
                          fontSize: '14px',
                          fontWeight: 600,
                          color: 'var(--t1)',
                          fontFamily: 'monospace'
                        }}
                      >
                        #{user?.user_id || 'N/A'}
                      </div>
                    </div>
                    <div>
                      <span style={{ fontSize: '12px', color: 'var(--t3)', fontWeight: 600 }}>
                        System Permission Role
                      </span>
                      <div>
                        <span className="badge badge-green" style={{ textTransform: 'uppercase' }}>
                          {user?.role || 'Staff'}
                        </span>
                      </div>
                    </div>

                    <div>
                      <span style={{ fontSize: '12px', color: 'var(--t3)', fontWeight: 600 }}>
                        Account Full Name
                      </span>
                      <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--t1)' }}>
                        {user?.full_name || 'N/A'}
                      </div>
                    </div>
                    <div>
                      <span style={{ fontSize: '12px', color: 'var(--t3)', fontWeight: 600 }}>
                        Username Credentials
                      </span>
                      <div style={{ fontSize: '13.5px', color: 'var(--t2)' }}>
                        {user?.username || 'N/A'}
                      </div>
                    </div>

                    <div
                      style={{
                        gridColumn: 'span 2',
                        background: 'var(--bg)',
                        padding: '16px',
                        borderRadius: 'var(--r-lg)',
                        border: '1px dashed var(--border)',
                        marginTop: '10px'
                      }}
                    >
                      <div
                        style={{
                          fontSize: '12px',
                          fontWeight: 700,
                          color: 'var(--t2)',
                          marginBottom: '4px'
                        }}
                      >
                        Admin Control Restriction Notice
                      </div>
                      <div style={{ fontSize: '11.5px', color: 'var(--t3)', lineHeight: 1.5 }}>
                        Modifications to authorization roles, status parameters, or company bindings
                        must be approved and applied by the Chief System Administrator to preserve audit records.
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 3) CHANGE PASSWORD */}
          {activeTab === 'password' && (
            <div>
              <div className="card-hdr" style={{ background: '#f8fafc' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <KeyRound size={18} color="var(--primary)" />
                  <span className="card-title" style={{ fontSize: '15px' }}>
                    Change Password Credentials
                  </span>
                </div>
              </div>

              <div style={{ padding: '24px' }}>
                <form onSubmit={handlePasswordSave} style={{ maxWidth: '420px' }}>
                  <div className="fgrp">
                    <label className="flabel">Current System Password</label>
                    <input
                      type="password"
                      className="finput"
                      required
                      placeholder="Enter your current password"
                      value={oldPassword}
                      onChange={(e) => setOldPassword(e.target.value)}
                    />
                  </div>

                  <div className="fgrp" style={{ marginTop: '18px' }}>
                    <label className="flabel">New Secure Password</label>
                    <input
                      type="password"
                      className="finput"
                      required
                      placeholder="At least 6 characters"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                    />
                  </div>

                  <div className="fgrp">
                    <label className="flabel">Confirm New Password</label>
                    <input
                      type="password"
                      className="finput"
                      required
                      placeholder="Re-enter new password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                  </div>

                  <button
                    type="submit"
                    className="btn btn-primary"
                    style={{ marginTop: '16px', width: '100%', justifyContent: 'center' }}
                  >
                    <Save size={15} /> Update Credentials
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
