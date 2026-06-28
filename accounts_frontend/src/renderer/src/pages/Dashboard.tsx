import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  FileText,
  IndianRupee,
  CheckCircle2,
  Clock,
  ChevronRight,
  TrendingUp,
  Plus,
  LucideIcon
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import client from '../api/client'

/* ── helpers ─────────────────────────────────────────────── */
const inr = (n: number | string | null | undefined) => {
  if (n == null) return '₹0.00'
  const val = Number(n)
  if (isNaN(val)) return '₹0.00'
  return '₹' + val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const greeting = () => {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

interface StatCardProps {
  icon: LucideIcon
  bg: string
  color: string
  label: string
  value: string | number
  sub?: string
  delay?: number
}

function StatCard({ icon: Icon, bg, color, label, value, sub, delay = 0 }: StatCardProps) {
  return (
    <div className="stat-card" style={{ animationDelay: `${delay}s` }}>
      <div className="stat-icon" style={{ background: bg }}>
        <Icon size={20} color={color} strokeWidth={2} />
      </div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
}

interface Invoice {
  invoice_id: number
  invoice_number: string
  customer_name: string
  customer_mobile?: string
  invoice_date: string
  invoice_type: string
  grand_total: number | string
  due_amount: number | string
  payment_status: string
}

interface DashboardStats {
  total_invoices: number
  total_billed: number | string
  total_collected: number | string
  total_pending: number | string
  pending_count: number
}

/* ── Component ───────────────────────────────────────────── */
export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const { data: statsData, isLoading: loadingStats } = useQuery({
    queryKey: ['dashboardStats'],
    queryFn: async () => {
      const res = await client.get('/invoices/dashboard/')
      return res.data.data as DashboardStats
    }
  })

  const { data: invoicesData, isLoading: loadingInvoices } = useQuery({
    queryKey: ['recentInvoices'],
    queryFn: async () => {
      const res = await client.get('/invoices/')
      return (res.data.data.invoices || []) as Invoice[]
    }
  })

  const loading = loadingStats || loadingInvoices
  const stats = statsData || null
  const invoices = (invoicesData || []).slice(0, 8)

  return (
    <>
      {/* Header */}
      <div className="page-hdr">
        <div>
          <div className="page-title">
            {greeting()}, {user?.full_name?.split(' ')[0] || 'there'}
          </div>
          <div className="page-sub">Here's a snapshot of this month</div>
        </div>
        <div className="page-hdr-actions">
          <button className="btn btn-primary" onClick={() => navigate('/invoices')}>
            <Plus size={15} /> New Invoice
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading">
          <div className="spinner" />
        </div>
      ) : (
        <>
          {/* Stat cards */}
          <div className="stats-grid">
            <StatCard
              icon={FileText}
              bg="#EFF6FF"
              color="#3B82F6"
              label="Total Invoices"
              value={stats?.total_invoices ?? 0}
              sub="This month"
              delay={0.05}
            />
            <StatCard
              icon={IndianRupee}
              bg="#F0FDF4"
              color="#10B981"
              label="Total Billed"
              value={inr(stats?.total_billed)}
              sub="This month"
              delay={0.1}
            />
            <StatCard
              icon={CheckCircle2}
              bg="#F0FDF4"
              color="#059669"
              label="Collected"
              value={inr(stats?.total_collected)}
              sub="This month"
              delay={0.15}
            />
            <StatCard
              icon={Clock}
              bg="#FFFBEB"
              color="#F59E0B"
              label="Outstanding"
              value={inr(stats?.total_pending)}
              sub={`${stats?.pending_count ?? 0} customer(s) with balance`}
              delay={0.2}
            />
          </div>

          {/* Recent invoices */}
          <div className="card" style={{ animation: 'fadeUp 0.35s ease 0.25s both' }}>
            <div className="card-hdr">
              <span className="card-title">Recent Invoices</span>
              <button
                className="btn btn-ghost btn-sm row gap-1"
                onClick={() => navigate('/invoices')}
              >
                View all <ChevronRight size={13} />
              </button>
            </div>

            <div className="tbl-wrap">
              {invoices.length === 0 ? (
                <div className="empty">
                  <TrendingUp size={40} className="empty-icon" />
                  <div className="empty-text">No invoices found</div>
                  <div className="empty-sub">Create your first invoice to get started!</div>
                </div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Invoice #</th>
                      <th>Customer</th>
                      <th>Date</th>
                      <th>Type</th>
                      <th style={{ textAlign: 'right' }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv) => (
                      <tr key={inv.invoice_id}>
                        <td>
                          <span
                            style={{
                              color: '#3B82F6',
                              fontWeight: 600,
                              fontVariantNumeric: 'tabular-nums'
                            }}
                          >
                            {inv.invoice_number}
                          </span>
                        </td>
                        <td>
                          <div style={{ fontWeight: 500 }}>{inv.customer_name}</div>
                          {inv.customer_mobile && (
                            <div className="fs12 t3">{inv.customer_mobile}</div>
                          )}
                        </td>
                        <td className="t2">
                          {new Date(inv.invoice_date).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric'
                          })}
                        </td>
                        <td>
                          <span
                            className={`badge ${inv.invoice_type === 'TAX' ? 'badge-blue' : 'badge-yellow'}`}
                          >
                            {inv.invoice_type}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 500 }}>
                          {inr(inv.grand_total)}
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
    </>
  )
}
