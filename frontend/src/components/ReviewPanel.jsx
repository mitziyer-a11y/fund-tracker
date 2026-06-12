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
      .order('updated_at', { ascending: false })
      .limit(100)
    if (error) setError(error.message)
    setRequests(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [refreshKey])

  const act = async (id, status, useComment = true) => {
    setBusyId(id)
    const { error } = await supabase
      .from('requests')
      .update({
        status,
        reviewer_comment: useComment ? (comments[id]?.trim() || null) : null,
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
  const decided = requests.filter((r) => r.status === 'approved' || r.status === 'declined').slice(0, 15)

  return (
    <div>
      <h2 className="font-display text-2xl mb-1">Review queue</h2>
      <p className="text-sm text-inkSoft mb-4">
        Approve, decline, or send a request back for revision.
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

      {decided.length > 0 && (
        <>
          <h3 className="font-display text-lg mt-6 mb-2 text-inkSoft">
            Recently decided — change your mind?
          </h3>
          <p className="text-xs text-inkSoft mb-2">
            Flipping a decision here updates the request's status for everyone to see.
          </p>
          <div className="space-y-2">
            {decided.map((r) => (
              <div key={r.id} className="ledger-card p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm">
                    <span className="font-mono">{r.currency ?? 'SGD'} {Number(r.amount).toLocaleString()}</span> ·{' '}
                    {r.category} · {r.profiles?.full_name ?? r.profiles?.email}
                  </p>
                  <StatusBadge status={r.status} />
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {r.status !== 'approved' && (
                    <button
                      onClick={() => act(r.id, 'approved', false)}
                      disabled={busyId === r.id}
                      className="border border-stampGreen text-stampGreen rounded px-3 py-1 text-xs font-medium hover:bg-stampGreen hover:text-paper transition disabled:opacity-50"
                    >
                      Switch to Approved
                    </button>
                  )}
                  {r.status !== 'declined' && (
                    <button
                      onClick={() => act(r.id, 'declined', false)}
                      disabled={busyId === r.id}
                      className="border border-stampRed text-stampRed rounded px-3 py-1 text-xs font-medium hover:bg-stampRed hover:text-paper transition disabled:opacity-50"
                    >
                      Switch to Declined
                    </button>
                  )}
                  <button
                    onClick={() => act(r.id, 'pending', false)}
                    disabled={busyId === r.id}
                    className="border border-paperLine text-inkSoft rounded px-3 py-1 text-xs font-medium hover:bg-paperLine transition disabled:opacity-50"
                  >
                    Reopen as pending
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
