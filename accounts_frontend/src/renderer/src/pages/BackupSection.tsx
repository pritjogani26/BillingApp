import { useState, useRef, useEffect } from 'react'
import {
  Database,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Folder,
  Copy,
  Info,
  ShieldCheck,
  Server,
  Upload
} from 'lucide-react'
import client from '../api/client'
import { useAuth } from '../context/AuthContext'

interface BackupResult {
  filePath: string
  filename: string
  sizeReadable: string
  timestamp: string
}

export default function BackupSection() {
  const { user } = useAuth()
  const isSuperAdmin = user?.role === 'SUPERADMIN'

  // Backup State
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [successResult, setSuccessResult] = useState<BackupResult | null>(null)
  const [copied, setCopied] = useState(false)
  const [dbName, setDbName] = useState('accounts')

  // Restore State
  const [restoring, setRestoring] = useState(false)
  const [restoreError, setRestoreError] = useState('')
  const [restoreSuccess, setRestoreSuccess] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Fetch active database name on mount
  useEffect(() => {
    client.get<{ database_name: string }>('/backups/db-name/')
      .then((res) => {
        if (res.data && res.data.database_name) {
          setDbName(res.data.database_name)
        }
      })
      .catch((err) => {
        console.error('Failed to fetch database name:', err)
      })
  }, [])

  async function handleCreateBackup() {
    setCreating(true)
    setError('')
    setSuccessResult(null)
    setCopied(false)

    try {
      const now = new Date()
      const yyyy = now.getFullYear()
      const mm = String(now.getMonth() + 1).padStart(2, '0')
      const dd = String(now.getDate()).padStart(2, '0')
      const hh = String(now.getHours()).padStart(2, '0')
      const min = String(now.getMinutes()).padStart(2, '0')
      const ss = String(now.getSeconds()).padStart(2, '0')
      const timestamp = `${yyyy}${mm}${dd}_${hh}${min}${ss}`
      
      const defaultFilename = `backup_${dbName}_${timestamp}.dump`

      if (!window.electronAPI?.selectBackupSavePath) {
        throw new Error('Electron selectBackupSavePath API is not available.')
      }

      const { canceled, filePath } = await window.electronAPI.selectBackupSavePath(defaultFilename)
      if (canceled || !filePath) {
        setCreating(false)
        return
      }

      const response = await client.get('/backups/create/', {
        responseType: 'arraybuffer'
      })

      if (!window.electronAPI?.saveBackupFile) {
        throw new Error('Electron saveBackupFile API is not available.')
      }

      const saveRes = await window.electronAPI.saveBackupFile(filePath, response.data)
      if (!saveRes.success) {
        throw new Error(saveRes.reason || 'Failed to save backup file.')
      }

      const filename = filePath.split(/[/\\]/).pop() || defaultFilename
      const bytes = response.data.byteLength
      const sizeReadable = formatBytes(bytes)

      setSuccessResult({
        filePath,
        filename,
        sizeReadable,
        timestamp: now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
      })
    } catch (err: any) {
      console.error('Backup error:', err)
      if (err.response?.data) {
        try {
          const decoder = new TextDecoder('utf-8')
          const text = decoder.decode(err.response.data)
          const json = JSON.parse(text)
          setError(json.error || 'Backup creation failed on server.')
        } catch {
          setError('Backup creation failed.')
        }
      } else {
        setError(err.message || 'An unexpected error occurred during backup.')
      }
    } finally {
      setCreating(false)
    }
  }

  async function handleRestore(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    const confirmMsg = 
      "WARNING: Restoring a database will overwrite all existing tables, structures, and business data.\n\n" +
      "You will be automatically logged out after a successful restore to synchronize database records.\n\n" +
      "Are you absolutely sure you want to proceed?"

    if (!confirm(confirmMsg)) {
      event.target.value = ''
      return
    }

    setRestoring(true)
    setRestoreError('')
    setRestoreSuccess(false)

    try {
      const formData = new FormData()
      formData.append('file', file)

      // POST database dump to restore endpoint
      await client.post('/backups/restore/', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        timeout: 300000 // 5 minutes timeout for large dumps
      })

      setRestoreSuccess(true)

      // Clear authentication and trigger session expiration to redirect user to login
      setTimeout(() => {
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        window.dispatchEvent(new CustomEvent('auth:unauthorized'))
      }, 2500)

    } catch (err: any) {
      console.error('Restore error:', err)
      if (err.response?.data) {
        if (typeof err.response.data === 'object') {
          setRestoreError(err.response.data.error || 'Restore failed on server.')
        } else {
          setRestoreError(String(err.response.data))
        }
      } else {
        setRestoreError(err.message || 'An unexpected error occurred during restore.')
      }
    } finally {
      setRestoring(false)
      event.target.value = '' // Clear input
    }
  }

  function formatBytes(bytes: number, decimals = 2) {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const dm = decimals < 0 ? 0 : decimals
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
  }

  async function handleShowInFolder() {
    if (!successResult) return
    if (!window.electronAPI?.openFileLocation) {
      alert('Electron openFileLocation API is not available.')
      return
    }
    const res = await window.electronAPI.openFileLocation(successResult.filePath)
    if (!res.success) {
      alert(`Could not open file location: ${res.reason}`)
    }
  }

  function handleCopyPath() {
    if (!successResult) return
    navigator.clipboard.writeText(successResult.filePath)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto', animation: 'fadeIn 0.3s ease' }}>
      
      {/* Page Header */}
      <div className="page-hdr" style={{ marginBottom: '24px' }}>
        <div>
          <div className="page-title">Database Backup & Restore</div>
          <div className="page-sub">
            Manage your local offline PostgreSQL database backups and restore database state.
          </div>
        </div>
      </div>

      {/* ── CARD 1: Offline Database Backup ── */}
      <div className="card" style={{ boxShadow: 'var(--sh)', overflow: 'hidden', marginBottom: '24px' }}>
        {/* Top Accent Gradient Bar */}
        <div style={{
          height: '4px',
          background: 'linear-gradient(90deg, var(--primary) 0%, #a855f7 100%)'
        }} />

        <div style={{ padding: '32px', textAlign: 'center' }}>
          
          {/* Centered Pulsing Icon */}
          <div style={{ display: 'inline-block', position: 'relative', marginBottom: '24px' }}>
            <div style={{
              width: '80px',
              height: '80px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(168, 85, 247, 0.1) 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--primary)',
              transition: 'all 0.3s ease',
              boxShadow: creating ? '0 0 20px 5px rgba(99, 102, 241, 0.3)' : 'none'
            }}>
              <Database size={40} className={creating ? 'animate-pulse' : ''} />
            </div>
            {creating && (
              <span className="spinner" style={{
                position: 'absolute',
                top: '-4px',
                right: '-4px',
                width: '24px',
                height: '24px',
                borderWidth: '3px'
              }} />
            )}
          </div>

          <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--t1)', marginBottom: '8px' }}>
            {creating ? 'Running PostgreSQL Dump...' : 'Create Database Backup'}
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--t2)', maxWidth: '500px', margin: '0 auto 24px' }}>
            Initiating a backup runs <code>pg_dump</code> on the database server, creates a compressed binary format stream, and saves it to a path of your choosing.
          </p>

          {/* Backup Button */}
          <button
            onClick={handleCreateBackup}
            disabled={creating || restoring}
            className="btn btn-primary"
            style={{
              padding: '10px 24px',
              fontSize: '13.5px',
              fontWeight: 600,
              gap: '8px',
              display: 'inline-flex',
              alignItems: 'center',
              boxShadow: '0 4px 12px rgba(99, 102, 241, 0.2) ',
              cursor: (creating || restoring) ? 'not-allowed' : 'pointer'
            }}
          >
            {creating ? (
              <>
                <span className="spinner" style={{ width: '14px', height: '14px', marginRight: '4px' }} />
                Creating backup file...
              </>
            ) : (
              <>
                <Database size={15} /> Select Path & Start Backup
              </>
            )}
          </button>

          {/* Backup Checklist */}
          <div style={{
            marginTop: '28px',
            paddingTop: '20px',
            borderTop: '1px solid var(--border)',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '16px',
            textAlign: 'left',
            maxWidth: '520px',
            margin: '28px auto 0'
          }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
              <ShieldCheck size={16} style={{ color: '#10b981', marginTop: '2px', flexShrink: 0 }} />
              <div>
                <strong style={{ fontSize: '12.5px', color: 'var(--t1)', display: 'block' }}>100% Offline</strong>
                <span style={{ fontSize: '11.5px', color: 'var(--t3)' }}>Saved directly to your hard drive or external device.</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
              <Server size={16} style={{ color: '#10b981', marginTop: '2px', flexShrink: 0 }} />
              <div>
                <strong style={{ fontSize: '12.5px', color: 'var(--t1)', display: 'block' }}>Custom format</strong>
                <span style={{ fontSize: '11.5px', color: 'var(--t3)' }}>Uses pg_dump custom compressed format (.dump).</span>
              </div>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="ferr" style={{
              marginTop: '24px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 16px',
              textAlign: 'left'
            }}>
              <AlertCircle size={18} style={{ flexShrink: 0 }} />
              <div style={{ fontSize: '13px' }}>
                <strong>Backup failed:</strong> {error}
              </div>
            </div>
          )}

          {/* Success Result Container */}
          {successResult && (
            <div style={{
              marginTop: '24px',
              background: 'var(--success-bg)',
              border: '1px solid #bbf7d0',
              borderRadius: 'var(--r)',
              padding: '20px',
              color: '#065f46',
              textAlign: 'left',
              animation: 'slideUp 0.3s ease'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <CheckCircle2 size={18} style={{ color: '#10b981' }} />
                <span style={{ fontWeight: 600, fontSize: '13.5px', color: '#047857' }}>Backup Created Successfully!</span>
              </div>

              <div style={{
                fontSize: '12.5px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                background: 'rgba(255, 255, 255, 0.4)',
                padding: '14px',
                borderRadius: '6px',
                border: '1px solid rgba(16, 185, 129, 0.1)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#065f46', opacity: 0.8 }}>File Name:</span>
                  <span style={{ fontWeight: 500, fontFamily: 'monospace' }}>{successResult.filename}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#065f46', opacity: 0.8 }}>File Size:</span>
                  <span style={{ fontWeight: 500 }}>{successResult.sizeReadable}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#065f46', opacity: 0.8 }}>Backup Date:</span>
                  <span style={{ fontWeight: 500 }}>{successResult.timestamp}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px solid rgba(16, 185, 129, 0.1)', paddingTop: '8px' }}>
                  <span style={{ color: '#065f46', opacity: 0.8 }}>Saved Location:</span>
                  <span style={{
                    fontWeight: 500,
                    fontFamily: 'monospace',
                    fontSize: '11px',
                    wordBreak: 'break-all',
                    background: 'rgba(0, 0, 0, 0.04)',
                    padding: '6px 8px',
                    borderRadius: '4px'
                  }}>{successResult.filePath}</span>
                </div>
              </div>

              {/* Action Buttons for Success State */}
              <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
                <button
                  onClick={handleShowInFolder}
                  className="btn btn-outline"
                  style={{
                    background: '#fff',
                    borderColor: '#bbf7d0',
                    color: '#065f46',
                    fontSize: '12.5px',
                    padding: '8px 16px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Folder size={14} /> Show in Folder
                </button>
                <button
                  onClick={handleCopyPath}
                  className="btn btn-outline"
                  style={{
                    background: '#fff',
                    borderColor: '#bbf7d0',
                    color: '#065f46',
                    fontSize: '12.5px',
                    padding: '8px 16px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Copy size={14} /> {copied ? 'Copied!' : 'Copy Path'}
                </button>
              </div>
            </div>
          )}

        </div>

        {isSuperAdmin && (
          <>
            {/* ── CARD 2: Restore Database Backup (DANGER ZONE) ── */}
            <div className="card" style={{
              boxShadow: 'var(--sh)',
              overflow: 'hidden',
              borderLeft: '4px solid #f59e0b',
              marginBottom: '24px'
            }}>
              <div style={{ padding: '24px' }}>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '6px',
                      background: 'rgba(245, 158, 11, 0.1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#d97706'
                    }}>
                      <Upload size={16} />
                    </div>
                    <div>
                      <h4 style={{ fontSize: '14.5px', fontWeight: 600, color: 'var(--t1)', margin: 0 }}>Restore Database</h4>
                      <span style={{ fontSize: '11.5px', color: 'var(--t3)' }}>Restore schema and tables from a local custom format file (.dump).</span>
                    </div>
                  </div>
                  <span style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    background: '#fef3c7',
                    color: '#d97706',
                    padding: '2px 8px',
                    borderRadius: '20px',
                    letterSpacing: '0.05em'
                  }}>DANGER ZONE</span>
                </div>

                <p style={{ fontSize: '12.5px', color: 'var(--t2)', lineHeight: '1.5', margin: '0 0 20px' }}>
                  Restoring will cleanly drop the <code>public</code> database schema and reload all structural and data objects from your backup file.
                </p>

                {/* Action Trigger */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={creating || restoring}
                    className="btn btn-outline"
                    style={{
                      borderColor: '#f59e0b',
                      color: '#d97706',
                      fontWeight: 600,
                      fontSize: '13px',
                      padding: '8px 18px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      background: '#fff',
                      cursor: (creating || restoring) ? 'not-allowed' : 'pointer'
                    }}
                  >
                    <Upload size={14} /> Choose File & Restore
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".dump"
                    onChange={handleRestore}
                    style={{ display: 'none' }}
                  />

                  {restoring && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#d97706', fontSize: '13px', fontWeight: 500 }}>
                      <span className="spinner" style={{
                        width: '14px',
                        height: '14px',
                        borderWidth: '2px',
                        borderColor: '#f59e0b',
                        borderTopColor: 'transparent'
                      }} />
                      Restoring database state... Do not close window.
                    </div>
                  )}
                </div>

                {/* Restore Success Message */}
                {restoreSuccess && (
                  <div style={{
                    marginTop: '16px',
                    background: 'var(--success-bg)',
                    border: '1px solid #bbf7d0',
                    borderRadius: 'var(--r)',
                    padding: '12px 16px',
                    color: '#047857',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '13px',
                    animation: 'slideUp 0.25s ease'
                  }}>
                    <CheckCircle2 size={16} />
                    <span>
                      <strong>Database restored successfully!</strong> Session ending, redirecting to login to reload data...
                    </span>
                  </div>
                )}

                {/* Restore Error Message */}
                {restoreError && (
                  <div style={{
                    marginTop: '16px',
                    background: '#fee2e2',
                    border: '1px solid #fca5a5',
                    borderRadius: 'var(--r)',
                    padding: '12px 16px',
                    color: '#b91c1c',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '13px',
                    animation: 'slideUp 0.25s ease'
                  }}>
                    <AlertTriangle size={16} />
                    <span>
                      <strong>Restore failed:</strong> {restoreError}
                    </span>
                  </div>
                )}

              </div>
            </div>

            {/* Info Info Card */}
            <div className="card" style={{
              padding: '16px 20px',
              boxShadow: 'var(--sh)',
              display: 'flex',
              gap: '12px',
              alignItems: 'flex-start',
              borderLeft: '4px solid #6366f1',
              background: '#f8fafc'
            }}>
              <Info size={18} style={{ color: '#6366f1', marginTop: '2px', flexShrink: 0 }} />
              <div style={{ fontSize: '12.5px', color: 'var(--t2)', lineHeight: '1.5' }}>
                <strong style={{ color: 'var(--t1)', display: 'block', marginBottom: '4px' }}>Restoring Backups manually</strong>
                To restore the database manually via the terminal, run the following:
                <code style={{
                  display: 'block',
                  marginTop: '6px',
                  background: '#e2e8f0',
                  padding: '6px 10px',
                  borderRadius: '4px',
                  fontFamily: 'monospace',
                  fontSize: '11px',
                  color: '#1e293b'
                }}>
                  pg_restore -h localhost -U postgres -d [database_name] -c "[backup_file_path]"
                </code>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}