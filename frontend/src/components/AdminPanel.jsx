import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function AdminPanel({ onUpdated }) {
  const [current, setCurrent] = useState(null)
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)

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

  return (
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
  )
}
