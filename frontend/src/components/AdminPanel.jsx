import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function AdminPanel({ onUpdated }) {
  const [current, setCurrent] = useState(null)
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const [confirmText, setConfirmText] = useState('')
  const [resetting, setResetting] = useState(false)
  const [resetMessage, setResetMessage] = useState(null)

  const load = async () => {
    const { data } = await supabase.from('fund_pool').select('*').single()
    setCurrent(data)
    setValue(data?.total_fund ?? '')
  }

  useEffect(() => {
    load()
  }, [])

  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    setMessage(null)
    const { data: user } = await supabase.auth.getUser()
    const { error } = await supabase
      .from('fund_pool')
      .update({ total_fund: Number(value), updated_by: user.user.id })
      .eq('id', 1)
    setSaving(false)
    if (error) {
      setMessage({ type: 'error', text: error.message })
      return
    }
    setMessage({ type: 'success', text: 'Fund amount updated.' })
    await load()
    onUpdated?.()
  }

  const resetAllRequests = async () => {
    if (confirmText !== 'DELETE') return
    setResetting(true)
    setResetMessage(null)

    // Delete every request (requires admin-only delete RLS policy).
    // Receipts in storage are left orphaned but harmless — they're
    // tied to request ids that no longer resolve to anything.
    const { error } = await supabase.from('requests').delete().not('id', 'is', null)

    setResetting(false)
    if (error) {
      setResetMessage({ type: 'error', text: error.message })
      return
    }
    setConfirmText('')
    setResetMessage({ type: 'success', text: 'All requests deleted. Fund amount is unchanged.' })
    onUpdated?.()
  }

  return (
    <>
    <div className="ledger-card p-6 max-w-md">
      <h2 className="font-display text-2xl mb-1">Admin: fund amount (SGD)</h2>
      <p className="text-sm text-inkSoft mb-4">
        Update the total exploratory fund (e.g. when new funds are allocated).
        This is the only way the total changes — all other figures are derived
        automatically from requests.
      </p>
      {current && (
        <p className="text-sm mb-3">
          Current total: <span className="font-mono">SGD {Number(current.total_fund).toLocaleString()}</span>
          {current.updated_at && (
            <span className="text-inkSoft"> (last updated {new Date(current.updated_at).toLocaleString()})</span>
          )}
        </p>
      )}
      <form onSubmit={save} className="flex gap-2">
        <input
          type="number"
          min="0"
          step="0.01"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="flex-1 border border-paperLine rounded px-3 py-2 font-mono"
        />
        <button
          type="submit"
          disabled={saving}
          className="border border-ink rounded px-4 py-2 font-medium hover:bg-ink hover:text-paper transition disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Update'}
        </button>
      </form>
      {message && (
        <p className={`text-sm mt-2 ${message.type === 'error' ? 'text-stampRed' : 'text-stampGreen'}`}>
          {message.text}
        </p>
      )}
    </div>

    <div className="ledger-card p-6 max-w-md mt-6 border-stampRed">
      <h2 className="font-display text-2xl mb-1 text-stampRed">Reset all requests</h2>
      <p className="text-sm text-inkSoft mb-4">
        Permanently deletes every request (and their statuses/comments) —
        useful for clearing test data before going live. The fund amount
        itself is not changed. This cannot be undone.
      </p>
      <label className="block text-sm font-medium mb-1">
        Type <span className="font-mono">DELETE</span> to confirm
      </label>
      <input
        type="text"
        value={confirmText}
        onChange={(e) => setConfirmText(e.target.value)}
        className="w-full border border-paperLine rounded px-3 py-2 font-mono mb-3"
        placeholder="DELETE"
      />
      <button
        onClick={resetAllRequests}
        disabled={confirmText !== 'DELETE' || resetting}
        className="border border-stampRed text-stampRed rounded px-4 py-2 font-medium hover:bg-stampRed hover:text-paper transition disabled:opacity-40"
      >
        {resetting ? 'Deleting…' : 'Delete all requests'}
      </button>
      {resetMessage && (
        <p className={`text-sm mt-2 ${resetMessage.type === 'error' ? 'text-stampRed' : 'text-stampGreen'}`}>
          {resetMessage.text}
        </p>
      )}
    </div>
    </>
  )
}
