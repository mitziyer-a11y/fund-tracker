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

  const load = async () => {
    setLoading(true)
    // Explicit FK name (requests_user_id_fkey) needed since `requests` has
    // two relationships to `profiles` (user_id and reviewer_id).
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

  if (loading) return <p className="text-sm text-inkSoft">Loading requests…</p>

  return (
    <div>
      <h2 className="font-display text-2xl mb-3">All requests</h2>
      {error && <p className="text-sm text-stampRed mb-2">{error}</p>}
      {requests.length === 0 && (
        <p className="text-sm text-inkSoft">No requests yet. The ledger is empty — be the first entry.</p>
      )}

      <div className="space-y-3">
        {requests.map((r) => {
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
            </div>
          )
        })}
      </div>
    </div>
  )
}
