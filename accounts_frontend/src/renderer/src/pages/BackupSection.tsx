import React, { useState, useEffect, useRef } from 'react'
import {
  Database,
  Cloud,
  Folder,
  RefreshCw,
  Trash2,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  UploadCloud,
  HelpCircle,
  FileText
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface BackupFile {
  filename: string
  size: number
  size_readable: string
  created_at: string
}

interface DriveStatusResponse {
  configured: boolean
  folder_id?: string
  service_account_email?: string
}

interface CreateBackupResponse {
  success: boolean
  filename: string
  size_readable: string
  created_at: string
  drive_status: string
  drive_link?: string
  error?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('token')
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers ?? {})
    }
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`)
  return data as T
}

function driveStatusLabel(status: string): { text: string; color: string; icon?: React.ReactNode } {
  if (status === 'uploaded') {
    return {
      text: 'Uploaded to Drive',
      color: 'var(--success)',
      icon: <CheckCircle2 size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
    }
  }
  if (status === 'not_configured') {
    return { text: 'Drive not configured', color: 'var(--t3)', icon: null }
  }
  if (status === 'libraries_missing') {
    return {
      text: 'Drive libraries missing',
      color: 'var(--warning)',
      icon: <AlertTriangle size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
    }
  }
  if (status.startsWith('upload_failed')) {
    return {
      text: 'Drive upload failed',
      color: 'var(--danger)',
      icon: <AlertCircle size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
    }
  }
  return { text: status, color: 'var(--t3)', icon: null }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function BackupSection() {
  // Backup list
  const [backups, setBackups] = useState<BackupFile[]>([])
  const [backupDir, setBackupDir] = useState('')
  const [loadingList, setLoadingList] = useState(false)

  // Create backup
  const [creating, setCreating] = useState(false)
  const [lastResult, setLastResult] = useState<CreateBackupResponse | null>(null)
  const [createError, setCreateError] = useState('')

  // Drive config
  const [driveInfo, setDriveInfo] = useState<DriveStatusResponse | null>(null)
  const [folderIdInput, setFolderIdInput] = useState('')
  const [credJson, setCredJson] = useState<object | null>(null)
  const [credFileName, setCredFileName] = useState('')
  const [savingDrive, setSavingDrive] = useState(false)
  const [driveMsg, setDriveMsg] = useState('')
  const [driveMsgType, setDriveMsgType] = useState<'ok' | 'err'>('ok')
  const [removingDrive, setRemovingDrive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Load on mount ──────────────────────────────────────────────────────────
  useEffect(() => {
    fetchList()
    fetchDriveStatus()
  }, [])

  async function fetchList() {
    setLoadingList(true)
    try {
      const data = await apiFetch<{ backups: BackupFile[]; backup_dir: string }>('/api/backups/')
      setBackups(data.backups)
      setBackupDir(data.backup_dir)
    } catch {
      // silent
    } finally {
      setLoadingList(false)
    }
  }

  async function fetchDriveStatus() {
    try {
      const data = await apiFetch<DriveStatusResponse>('/api/backups/drive/status/')
      setDriveInfo(data)
      if (data.folder_id) setFolderIdInput(data.folder_id)
    } catch {
      // silent
    }
  }

  // ── Create backup ─────────────────────────────────────────────────────────
  async function handleCreateBackup() {
    setCreating(true)
    setCreateError('')
    setLastResult(null)
    try {
      const data = await apiFetch<CreateBackupResponse>('/api/backups/create/', {
        method: 'POST'
      })
      setLastResult(data)
      fetchList()
    } catch (e: unknown) {
      setCreateError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setCreating(false)
    }
  }

  // ── Delete backup ─────────────────────────────────────────────────────────
  async function handleDelete(filename: string) {
    if (!confirm(`Delete ${filename}?`)) return
    try {
      await apiFetch(`/api/backups/${filename}/`, { method: 'DELETE' })
      setBackups((prev) => prev.filter((b) => b.filename !== filename))
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  // ── Drive config ──────────────────────────────────────────────────────────
  function handleCredFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setCredFileName(file.name)
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string)
        setCredJson(parsed)
        setDriveMsg('')
      } catch {
        setDriveMsg('Invalid JSON file.')
        setDriveMsgType('err')
        setCredJson(null)
      }
    }
    reader.readAsText(file)
  }

  async function handleSaveDrive() {
    if (!credJson && !driveInfo?.configured) {
      setDriveMsg('Please select a service account JSON file.')
      setDriveMsgType('err')
      return
    }
    if (!folderIdInput.trim()) {
      setDriveMsg('Please enter a Google Drive Folder ID.')
      setDriveMsgType('err')
      return
    }
    setSavingDrive(true)
    setDriveMsg('')
    try {
      const body: Record<string, unknown> = { folder_id: folderIdInput.trim() }
      if (credJson) body.credentials = credJson
      const data = await apiFetch<{ success: boolean; message: string; service_account_email: string }>(
        '/api/backups/drive/configure/',
        { method: 'POST', body: JSON.stringify(body) }
      )
      setDriveMsg(data.message)
      setDriveMsgType('ok')
      fetchDriveStatus()
      setCredJson(null)
      setCredFileName('')
    } catch (e: unknown) {
      setDriveMsg(e instanceof Error ? e.message : 'Failed to save.')
      setDriveMsgType('err')
    } finally {
      setSavingDrive(false)
    }
  }

  async function handleRemoveDrive() {
    if (!confirm('Remove Google Drive configuration?')) return
    setRemovingDrive(true)
    try {
      await apiFetch('/api/backups/drive/configure/', { method: 'DELETE' })
      setDriveInfo({ configured: false })
      setFolderIdInput('')
      setCredJson(null)
      setCredFileName('')
      setDriveMsg('Google Drive configuration removed.')
      setDriveMsgType('ok')
    } catch (e: unknown) {
      setDriveMsg(e instanceof Error ? e.message : 'Failed to remove.')
      setDriveMsgType('err')
    } finally {
      setRemovingDrive(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: '720px', animation: 'fadeIn 0.25s ease' }}>
      {/* ── Section heading ───────────────────────────────────────────────── */}
      <div className="page-hdr" style={{ marginBottom: '20px' }}>
        <div>
          <div className="page-title">Database Backup</div>
          <div className="page-sub">
            Dumps the PostgreSQL database, compresses it, saves it locally, and optionally uploads it to Google Drive.
          </div>
        </div>
      </div>

      {/* ── Create Backup ─────────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: '24px', boxShadow: 'var(--sh)' }}>
        <div className="card-hdr" style={{ background: '#f8fafc' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Database size={18} color="var(--primary)" />
            <span className="card-title">Create Backup</span>
          </div>
        </div>
        <div style={{ padding: '20px' }}>
          <p style={{ fontSize: '13px', color: 'var(--t2)', marginBottom: '16px' }}>
            Dumps the PostgreSQL database, compresses it, saves it locally
            {driveInfo?.configured ? ', and uploads it to Google Drive.' : '.'}
          </p>

          <button onClick={handleCreateBackup} disabled={creating} className="btn btn-primary">
            {creating ? (
              <>
                <span className="spinner" style={{ width: '12px', height: '12px', marginRight: '6px' }} />{' '}
                Creating backup…
              </>
            ) : (
              <>
                <UploadCloud size={15} /> Create Backup Now
              </>
            )}
          </button>

          {createError && (
            <div
              className="ferr"
              style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <AlertCircle size={14} /> <span>{createError}</span>
            </div>
          )}

          {lastResult && (
            <div
              style={{
                marginTop: '16px',
                background: 'var(--success-bg)',
                border: '1px solid #bbf7d0',
                borderRadius: 'var(--r)',
                padding: '12px 16px',
                color: '#047857'
              }}
            >
              <p
                style={{
                  fontSize: '13px',
                  margin: '4px 0',
                  display: 'flex',
                  gap: '6px',
                  alignItems: 'center',
                  fontWeight: 600
                }}
              >
                <CheckCircle2 size={15} /> Backup created successfully!
              </p>
              <div
                style={{
                  marginTop: 8,
                  paddingLeft: 21,
                  fontSize: '12.5px',
                  color: '#065f46',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4
                }}
              >
                <span>
                  <strong>File:</strong> {lastResult.filename}
                </span>
                <span>
                  <strong>Size:</strong> {lastResult.size_readable}
                </span>
                <span>
                  <strong>Created:</strong> {lastResult.created_at}
                </span>
                {lastResult.drive_status && (() => {
                  const { text, color, icon } = driveStatusLabel(lastResult.drive_status)
                  return (
                    <span style={{ color }}>
                      <strong>Drive status:</strong> {icon} {text}
                      {lastResult.drive_link && (
                        <a
                          href={lastResult.drive_link}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            color: 'var(--primary)',
                            textDecoration: 'none',
                            marginLeft: '8px',
                            fontWeight: 600
                          }}
                        >
                          Open ↗
                        </a>
                      )}
                    </span>
                  )
                })()}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Google Drive Setup ────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: '24px', boxShadow: 'var(--sh)' }}>
        <div className="card-hdr" style={{ background: '#f8fafc' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
            <Cloud size={18} color="var(--primary)" />
            <span className="card-title">Google Drive Connection</span>
          </div>
          {driveInfo?.configured && <span className="badge badge-green">Connected</span>}
        </div>
        <div style={{ padding: '20px' }}>
          {driveInfo?.configured && (
            <div
              style={{
                background: 'var(--success-bg)',
                border: '1px solid #bbf7d0',
                borderRadius: 'var(--r)',
                padding: '12px 16px',
                marginBottom: '16px'
              }}
            >
              <div style={{ fontSize: '12.5px', margin: '4px 0', display: 'flex', gap: '8px' }}>
                <span style={{ color: '#059669', fontWeight: 600, minWidth: '120px' }}>
                  Service Account
                </span>
                <span style={{ color: 'var(--t1)', wordBreak: 'break-all' }}>
                  {driveInfo.service_account_email}
                </span>
              </div>
              <div style={{ fontSize: '12.5px', margin: '4px 0', display: 'flex', gap: '8px' }}>
                <span style={{ color: '#059669', fontWeight: 600, minWidth: '120px' }}>Folder ID</span>
                <span style={{ color: 'var(--t1)', wordBreak: 'break-all' }}>{driveInfo.folder_id}</span>
              </div>
            </div>
          )}

          {/* Credentials file picker */}
          <div className="fgrp">
            <label className="flabel">
              Service Account JSON{driveInfo?.configured ? ' (re-upload to change)' : ''}
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="btn btn-outline"
              >
                📂 Choose File
              </button>
              <span style={{ fontSize: '13px', color: 'var(--t2)' }}>
                {credFileName || (driveInfo?.configured ? '(credentials saved)' : 'No file chosen')}
              </span>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleCredFileChange}
            style={{ display: 'none' }}
          />

          {/* Folder ID */}
          <div className="fgrp" style={{ marginTop: '16px' }}>
            <label className="flabel">Google Drive Folder ID</label>
            <input
              type="text"
              value={folderIdInput}
              onChange={(e) => setFolderIdInput(e.target.value)}
              placeholder="e.g. 1A2B3C4D5E6F7G8H9I0J"
              className="finput"
            />
            <p style={{ fontSize: '11px', color: 'var(--t3)', marginTop: '4px' }}>
              Copy from the folder URL: drive.google.com/drive/folders/<strong>[this-part]</strong>
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
            <button onClick={handleSaveDrive} disabled={savingDrive} className="btn btn-primary">
              {savingDrive ? 'Saving & Testing…' : 'Save & Test Connection'}
            </button>

            {driveInfo?.configured && (
              <button onClick={handleRemoveDrive} disabled={removingDrive} className="btn btn-danger">
                {removingDrive ? 'Removing…' : 'Remove Connection'}
              </button>
            )}
          </div>

          {driveMsg && (
            <p
              style={{
                fontSize: '13px',
                marginTop: '12px',
                color: driveMsgType === 'ok' ? '#059669' : 'var(--danger)',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              {driveMsgType === 'ok' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}{' '}
              {driveMsg}
            </p>
          )}

          {/* Setup guide */}
          <details
            style={{ marginTop: '20px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}
          >
            <summary
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--t2)',
                cursor: 'pointer',
                userSelect: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <HelpCircle size={14} color="var(--primary)" /> How to set up Google Drive (first time)
            </summary>
            <ol
              style={{
                fontSize: '12.5px',
                color: 'var(--t2)',
                lineHeight: '1.8',
                paddingLeft: '20px',
                marginTop: '8px'
              }}
            >
              <li>
                Go to <strong>console.cloud.google.com</strong> → Create a new project.
              </li>
              <li>
                Enable <strong>Google Drive API</strong> in APIs & Services.
              </li>
              <li>
                Go to <strong>IAM & Admin → Service Accounts</strong> → Create Service Account.
              </li>
              <li>
                Click the service account → <strong>Keys → Add Key → JSON</strong>. Download the file.
              </li>
              <li>
                Open <strong>Google Drive</strong> → create or pick a folder for backups.
              </li>
              <li>
                Right-click the folder → <strong>Share</strong> → paste the service account email
                (ends in <em>@…gserviceaccount.com</em>) → give <strong>Editor</strong> access.
              </li>
              <li>Upload the JSON file above and enter the folder ID, then click Save & Test Connection.</li>
            </ol>
          </details>
        </div>
      </div>

      {/* ── Local Backup List ─────────────────────────────────────────────── */}
      <div className="card" style={{ boxShadow: 'var(--sh)' }}>
        <div className="card-hdr" style={{ background: '#f8fafc' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
            <Folder size={18} color="var(--primary)" />
            <span className="card-title">Local Backups</span>
          </div>
          <button
            onClick={fetchList}
            className="btn btn-outline btn-icon"
            title="Refresh list"
            style={{ padding: '6px' }}
          >
            <RefreshCw size={14} />
          </button>
        </div>
        <div style={{ padding: '20px' }}>
          {backupDir && (
            <p
              style={{
                fontSize: '12px',
                color: 'var(--t3)',
                marginBottom: '12px',
                fontFamily: 'monospace',
                wordBreak: 'break-all'
              }}
            >
              Stored in: {backupDir}
            </p>
          )}

          {loadingList ? (
            <div style={{ textAlign: 'center', padding: '20px', color: 'var(--t3)' }}>
              <span className="spinner" style={{ width: '16px', height: '16px', display: 'inline-block' }} />{' '}
              Loading backups…
            </div>
          ) : backups.length === 0 ? (
            <p style={{ fontSize: '13px', color: 'var(--t3)', textAlign: 'center', padding: '20px 0' }}>
              No backups yet. Create your first backup above.
            </p>
          ) : (
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Filename</th>
                    <th style={{ textAlign: 'right' }}>Size</th>
                    <th style={{ textAlign: 'right' }}>Created</th>
                    <th style={{ textAlign: 'center' }}>Delete</th>
                  </tr>
                </thead>
                <tbody>
                  {backups.map((b) => (
                    <tr key={b.filename}>
                      <td style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <FileText size={15} color="var(--t3)" /> {b.filename}
                      </td>
                      <td
                        style={{
                          textAlign: 'right',
                          color: 'var(--t2)',
                          fontVariantNumeric: 'tabular-nums'
                        }}
                      >
                        {b.size_readable}
                      </td>
                      <td
                        style={{
                          textAlign: 'right',
                          color: 'var(--t2)',
                          fontVariantNumeric: 'tabular-nums'
                        }}
                      >
                        {b.created_at}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          onClick={() => handleDelete(b.filename)}
                          className="btn btn-ghost btn-icon"
                          title={`Delete ${b.filename}`}
                          style={{ color: 'var(--danger)', padding: 4 }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}