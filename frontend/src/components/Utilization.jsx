import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  PieChart, Pie, Cell, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
} from 'recharts'

const COLORS = ['#2F6F4F', '#C98A2B', '#B33A3A', '#8A5FB0', '#3E6FA8', '#A8763E']

export default function Utilization({ refreshKey }) {
  const [summary, setSummary] = useState(null)
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const [{ data: s }, { data: r }] = await Promise.all([
        supabase.from('fund_summary').select('*').single(),
        supabase.from('requests').select('*, profiles!requests_user_id_fkey(full_name, email)'),
      ])
      setSummary(s)
      setRequests(r ?? [])
      setLoading(false)
    }
    load()
  }, [refreshKey])

  if (loading) return <p className="text-sm text-inkSoft">Loading…</p>
  if (!summary) return <p className="text-sm text-inkSoft">No fund data yet.</p>

  // Count of requests by category (all statuses except declined — i.e. real activity)
  const active = requests.filter((r) => r.status !== 'declined')
  const countByCategory = {}
  const spendByCategory = {}
  const spendByUser = {}

  active.forEach((r) => {
    countByCategory[r.category] = (countByCategory[r.category] ?? 0) + 1
    if (r.status === 'approved') {
      spendByCategory[r.category] = (spendByCategory[r.category] ?? 0) + Number(r.amount)
      const name = r.profiles?.full_name ?? r.profiles?.email ?? 'Unknown'
      spendByUser[name] = (spendByUser[name] ?? 0) + Number(r.amount)
    }
  })

  const countData = Object.entries(countByCategory).map(([name, value]) => ({ name, value }))
  const spendCategoryData = Object.entries(spendByCategory).map(([name, value]) => ({ name, value }))
  const spendUserData = Object.entries(spendByUser)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)

  const totalRequests = active.length

  return (
    <div className="space-y-8">
      {/* Fund balance breakdown */}
      <div className="ledger-card p-6">
        <h2 className="font-display text-2xl mb-4">Fund balance</h2>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-center">
          <Stat label="Total fund" value={summary.total_fund} />
          <Stat label="Approved" value={summary.approved_total} color="text-stampGreen" />
          <Stat label="Pending" value={summary.pending_total} color="text-stampAmber" />
          <Stat label="Remaining" value={summary.remaining} color="text-ink" emphasize />
        </div>
        {/* Simple proportional bar */}
        <div className="mt-4 h-3 w-full rounded overflow-hidden flex border border-paperLine">
          <div
            className="bg-stampGreen"
            style={{ width: `${(summary.approved_total / summary.total_fund) * 100}%` }}
            title="Approved"
          />
          <div
            className="bg-stampAmber"
            style={{ width: `${(summary.pending_total / summary.total_fund) * 100}%` }}
            title="Pending"
          />
        </div>
        <p className="text-xs text-inkSoft mt-2">
          z = x + y, where remaining (z = ${Number(summary.remaining).toLocaleString()}) plus
          approved (x = ${Number(summary.approved_total).toLocaleString()}) plus pending
          (y = ${Number(summary.pending_total).toLocaleString()}) equals the total fund.
        </p>
      </div>

      {/* Requests by category — "5 of 10 requests were for X" */}
      <div className="ledger-card p-6">
        <h2 className="font-display text-2xl mb-1">Where requests come from</h2>
        <p className="text-sm text-inkSoft mb-4">
          {countData.length > 0 && (
            <>
              {countData.sort((a, b) => b.value - a.value)[0]?.value} of {totalRequests} requests
              are for <b>{countData.sort((a, b) => b.value - a.value)[0]?.name}</b>.
            </>
          )}
        </p>
        {countData.length === 0 ? (
          <p className="text-sm text-inkSoft">No requests yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={countData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={100}
                label={(d) => `${d.name} (${d.value})`}
              >
                {countData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* $ spend by category */}
      <div className="ledger-card p-6">
        <h2 className="font-display text-2xl mb-1">Where the money goes</h2>
        <p className="text-sm text-inkSoft mb-4">
          Approved spend by category. Figures are summed as raw numbers
          regardless of each request's currency — fine if everyone mostly
          uses SGD, but treat totals as approximate if requests use mixed
          currencies.
        </p>
        {spendCategoryData.length === 0 ? (
          <p className="text-sm text-inkSoft">No approved spend yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={spendCategoryData} layout="vertical" margin={{ left: 40 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis type="category" dataKey="name" width={130} />
              <Tooltip formatter={(v) => `SGD ${v.toLocaleString()}`} />
              <Bar dataKey="value" fill="#2F6F4F" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* $ spend by user */}
      <div className="ledger-card p-6">
        <h2 className="font-display text-2xl mb-1">Fund usage by person</h2>
        <p className="text-sm text-inkSoft mb-4">Approved spend per requester (summed as raw numbers, see note above)</p>
        {spendUserData.length === 0 ? (
          <p className="text-sm text-inkSoft">No approved spend yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(200, spendUserData.length * 45)}>
            <BarChart data={spendUserData} layout="vertical" margin={{ left: 60 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis type="category" dataKey="name" width={150} />
              <Tooltip formatter={(v) => `SGD ${v.toLocaleString()}`} />
              <Bar dataKey="value" fill="#3E6FA8" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, color = 'text-ink', emphasize = false }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-inkSoft">{label}</p>
      <p className={`font-mono ${emphasize ? 'text-2xl' : 'text-xl'} font-semibold ${color}`}>
        SGD {Number(value).toLocaleString()}
      </p>
    </div>
  )
}
