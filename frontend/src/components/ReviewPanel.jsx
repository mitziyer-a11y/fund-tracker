import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import StatusBadge from './StatusBadge'
import Receipt from './Receipt'

export default function ReviewPanel({ profile, refreshKey, onActed }) {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [comments, setComments] = useState({})
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState(null)

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('requests')
      .select('*, profiles!requests_user_id_fkey(full_name, email)')
      .in('status', ['pending', 'needs_revision'])
      .order('created_at', { ascending: true })
    if (error) setError(error.message)
    setRequests(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [refreshKey])

  const act = async (id, status) => {
    setBusyId(id)
    const { error } = await supabase
      .from('requests')
      .update({
        status,
        reviewer_comment: comments[id]?.trim() || null,
        reviewer_id: profile.id,
      })
      .eq('id', id)

    setBusyId(null)
    if (error) {
      setError(error.message)
      return
    }
    await load()
    onActed?.()
  }

  if (loading) return <p className="text-sm text-inkSoft">Loading…</p>

  const actionable = requests.filter((r) => r.status === 'pending')
  const awaitingRequester = requests.filter((r) => r.status === 'needs_revision')

  return (
    <div>
      <h2 className="font-display text-2xl mb-1">Review queue</h2>
      <p className="text-sm text-inkSoft mb-4">
        As an approver, your approve / decline / request-revision decisions are
        emailed to the requester automatically.
      </p>
      {error && <p className="text-sm text-stampRed mb-2">{error}</p>}

      {actionable.length === 0 && (
        <p className="text-sm text-inkSoft mb-4">Nothing pending review. The queue is clear.</p>
      )}

      <div className="space-y-3">
        {actionable.map((r) => (
          <div key={r.id} className="ledger-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-mono text-lg font-semibold">
                  {r.currency ?? 'SGD'} {Number(r.amount).toLocaleString()}
                </p>
                <p className="text-sm text-inkSoft">
                  {r.category} · from{' '}
                  <span className="text-ink">{r.profiles?.full_name ?? r.profiles?.email}</span>
                </p>
                <p className="text-xs text-inkSoft mt-1">
                  {new Date(r.created_at).toLocaleString()}
                </p>
              </div>
              <StatusBadge status={r.status} />
            </div>

            <p className="text-sm mt-2 ledger-rule pb-2">{r.details}</p>
            <Receipt request={r} isOwner={false} canView={true} />

            <div className="mt-3 space-y-2">
              <textarea
                placeholder="Optional note (e.g. 'amount too high — please reduce to $X')"
                value={comments[r.id] ?? ''}
                onChange={(e) => setComments((c) => ({ ...c, [r.id]: e.target.value }))}
                rows={2}
                className="w-full border border-paperLine rounded px-3 py-2 text-sm"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => act(r.id, 'approved')}
                  disabled={busyId === r.id}
                  className="border border-stampGreen text-stampGreen rounded px-4 py-1.5 text-sm font-medium hover:bg-stampGreen hover:text-paper transition disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  onClick={() => act(r.id, 'needs_revision')}
                  disabled={busyId === r.id}
                  className="border border-stampAmber text-stampAmber rounded px-4 py-1.5 text-sm font-medium hover:bg-stampAmber hover:text-paper transition disabled:opacity-50"
                >
                  Request revision
                </button>
                <button
                  onClick={() => act(r.id, 'declined')}
                  disabled={busyId === r.id}
                  className="border border-stampRed text-stampRed rounded px-4 py-1.5 text-sm font-medium hover:bg-stampRed hover:text-paper transition disabled:opacity-50"
                >
                  Decline
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {awaitingRequester.length > 0 && (
        <>
          <h3 className="font-display text-lg mt-6 mb-2 text-inkSoft">
            Awaiting requester revisions
          </h3>
          <div className="space-y-2">
            {awaitingRequester.map((r) => (
              <div key={r.id} className="ledger-card p-3 opacity-70">
                <p className="text-sm">
                  <span className="font-mono">{r.currency ?? 'SGD'} {Number(r.amount).toLocaleString()}</span> ·{' '}
                  {r.category} · {r.profiles?.full_name ?? r.profiles?.email} —{' '}
                  <span className="italic">{r.reviewer_comment}</span>
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
