import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import StatusBadge from './StatusBadge'
import Receipt from './Receipt'

const CATEGORIES = [
  'LLM tokens',
  'Other AI tools',
  'Books / Courses',
  'Compute / Hosting',
  'Hardware',
  'Other',
]

const CURRENCIES = ['SGD', 'USD', 'EUR', 'GBP', 'AUD', 'JPY', 'INR', 'MYR', 'HKD', 'CNY']
const STATUSES = ['pending', 'approved', 'declined', 'needs_revision']

export default function RequestsList({ profile, isReviewer, refreshKey }) {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [editAmount, setEditAmount] = useState('')
  const [editCurrency, setEditCurrency] = useState('SGD')
  const [editCategory, setEditCategory] = useState('')
  const [editDetails, setEditDetails] = useState('')
  const [savingId, setSavingId] = useState(null)
  const [error, setError] = useState(null)

  // Filters
  const [statusFilter, setStatusFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [mineOnly, setMineOnly] = useState(false)

  // Reviewer decision controls (available on every request, any status)
  const [reviewBusyId, setReviewBusyId] = useState(null)
  const [reviewComments, setReviewComments] = useState({})

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('requests')
      .select('*, profiles!requests_user_id_fkey(full_name, email)')
      .order('created_at', { ascending: false })
    if (error) setError(error.message)
    setRequests(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [refreshKey])

  const startEdit = (r) => {
    setEditingId(r.id)
    setEditAmount(r.amount)
    setEditCurrency(r.currency ?? 'SGD')
    setEditCategory(r.category)
    setEditDetails(r.details)
  }

  const cancelEdit = () => setEditingId(null)

  const saveEdit = async (id) => {
    setSavingId(id)
    const { error } = await supabase
      .from('requests')
      .update({
        amount: Number(editAmount),
        currency: editCurrency,
        category: editCategory,
        details: editDetails.trim(),
        status: 'pending',
        reviewer_comment: null,
      })
      .eq('id', id)

    setSavingId(null)
    if (error) {
      setError(error.message)
      return
    }
    setEditingId(null)
    await load()
  }

  // Reviewer: change status on ANY request, from anywhere in the list.
  const setStatus = async (id, status) => {
    setReviewBusyId(id)
    const { error } = await supabase
      .from('requests')
      .update({
        status,
        reviewer_comment: reviewComments[id]?.trim() || null,
        reviewer_id: profile.id,
      })
      .eq('id', id)
    setReviewBusyId(null)
    if (error) {
      setError(error.message)
      return
    }
    await load()
  }

  if (loading) return <p className="text-sm text-inkSoft">Loading requests…</p>

  const filtered = requests.filter((r) => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false
    if (categoryFilter !== 'all' && r.category !== categoryFilter) return false
    if (mineOnly && r.user_id !== profile.id) return false
    return true
  })

  return (
    <div>
      <h2 className="font-display text-2xl mb-3">All requests</h2>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 mb-4 text-sm">
        <div>
          <label className="block text-xs font-medium mb-1">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-paperLine rounded px-2 py-1 bg-card"
          >
            <option value="all">All</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s.replace('_', ' ')}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Category</label>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="border border-paperLine rounded px-2 py-1 bg-card"
          >
            <option value="all">All</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-1.5 pb-1.5">
          <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />
          Only my requests
        </label>
        {(statusFilter !== 'all' || categoryFilter !== 'all' || mineOnly) && (
          <button
            onClick={() => { setStatusFilter('all'); setCategoryFilter('all'); setMineOnly(false) }}
            className="text-xs underline text-inkSoft hover:text-ink pb-1.5"
          >
            Clear filters
          </button>
        )}
        <span className="text-xs text-inkSoft pb-1.5">
          {filtered.length} of {requests.length}
        </span>
      </div>

      {error && <p className="text-sm text-stampRed mb-2">{error}</p>}
      {filtered.length === 0 && (
        <p className="text-sm text-inkSoft">
          {requests.length === 0
            ? 'No requests yet. The ledger is empty — be the first entry.'
            : 'No requests match these filters.'}
        </p>
      )}

      <div className="space-y-3">
        {filtered.map((r) => {
          const isOwner = r.user_id === profile.id
          const isEditable = isOwner && (r.status === 'pending' || r.status === 'needs_revision')
          const isEditing = editingId === r.id

          return (
            <div key={r.id} className="ledger-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-mono text-lg font-semibold">
                    {r.currency ?? 'SGD'} {Number(r.amount).toLocaleString()}
                  </p>
                  <p className="text-sm text-inkSoft">
                    {r.category} · requested by{' '}
                    <span className="text-ink">{r.profiles?.full_name ?? r.profiles?.email}</span>
                  </p>
                  <p className="text-xs text-inkSoft mt-1">
                    {new Date(r.created_at).toLocaleString()}
                  </p>
                </div>
                <StatusBadge status={r.status} />
              </div>

              {!isEditing && (
                <p className="text-sm mt-2 ledger-rule pb-2">{r.details}</p>
              )}

              {r.reviewer_comment && !isEditing && (
                <p className="text-sm mt-2 text-inkSoft">
                  <span className="font-medium">Reviewer note:</span> {r.reviewer_comment}
                </p>
              )}

              {!isEditing && (
                <Receipt
                  request={r}
                  isOwner={isOwner}
                  canView={isOwner || isReviewer}
                  onAttached={load}
                />
              )}

              {isEditing && (
                <div className="mt-3 space-y-3 border-t border-paperLine pt-3">
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="block text-xs font-medium mb-1">Amount</label>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={editAmount}
                        onChange={(e) => setEditAmount(e.target.value)}
                        className="w-full border border-paperLine rounded px-3 py-2 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Currency</label>
                      <select
                        value={editCurrency}
                        onChange={(e) => setEditCurrency(e.target.value)}
                        className="border border-paperLine rounded px-3 py-2 bg-card"
                      >
                        {CURRENCIES.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Category</label>
                    <select
                      value={editCategory}
                      onChange={(e) => setEditCategory(e.target.value)}
                      className="w-full border border-paperLine rounded px-3 py-2 bg-card"
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Details</label>
                    <textarea
                      value={editDetails}
                      onChange={(e) => setEditDetails(e.target.value)}
                      rows={3}
                      className="w-full border border-paperLine rounded px-3 py-2"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => saveEdit(r.id)}
                      disabled={savingId === r.id}
                      className="border border-ink rounded px-4 py-1.5 text-sm font-medium hover:bg-ink hover:text-paper transition disabled:opacity-50"
                    >
                      {savingId === r.id ? 'Resubmitting…' : 'Resubmit'}
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="border border-paperLine rounded px-4 py-1.5 text-sm font-medium hover:bg-paperLine transition"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {isEditable && !isEditing && (
                <button
                  onClick={() => startEdit(r)}
                  className="text-sm underline text-inkSoft hover:text-ink mt-2"
                >
                  Edit &amp; resubmit
                </button>
              )}

              {/* Reviewer decision controls — available on every request */}
              {isReviewer && !isEditing && (
                <div className="mt-3 border-t border-paperLine pt-3">
                  <textarea
                    placeholder="Optional note for the requester"
                    value={reviewComments[r.id] ?? ''}
                    onChange={(e) => setReviewComments((c) => ({ ...c, [r.id]: e.target.value }))}
                    rows={1}
                    className="w-full border border-paperLine rounded px-3 py-2 text-sm mb-2"
                  />
                  <div className="flex flex-wrap gap-2">
                    {r.status !== 'approved' && (
                      <button
                        onClick={() => setStatus(r.id, 'approved')}
                        disabled={reviewBusyId === r.id}
                        className="border border-stampGreen text-stampGreen rounded px-3 py-1 text-xs font-medium hover:bg-stampGreen hover:text-paper transition disabled:opacity-50"
                      >
                        {r.status === 'pending' ? 'Approve' : 'Switch to Approved'}
                      </button>
                    )}
                    {r.status !== 'declined' && (
                      <button
                        onClick={() => setStatus(r.id, 'declined')}
                        disabled={reviewBusyId === r.id}
                        className="border border-stampRed text-stampRed rounded px-3 py-1 text-xs font-medium hover:bg-stampRed hover:text-paper transition disabled:opacity-50"
                      >
                        {r.status === 'pending' ? 'Decline' : 'Switch to Declined'}
                      </button>
                    )}
                    {r.status !== 'needs_revision' && r.status === 'pending' && (
                      <button
                        onClick={() => setStatus(r.id, 'needs_revision')}
                        disabled={reviewBusyId === r.id}
                        className="border border-stampAmber text-stampAmber rounded px-3 py-1 text-xs font-medium hover:bg-stampAmber hover:text-paper transition disabled:opacity-50"
                      >
                        Request revision
                      </button>
                    )}
                    {r.status !== 'pending' && (
                      <button
                        onClick={() => setStatus(r.id, 'pending')}
                        disabled={reviewBusyId === r.id}
                        className="border border-paperLine text-inkSoft rounded px-3 py-1 text-xs font-medium hover:bg-paperLine transition disabled:opacity-50"
                      >
                        Reopen as pending
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
