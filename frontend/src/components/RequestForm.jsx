import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const CATEGORIES = [
  'LLM tokens',
  'Other AI tools',
  'Books / Courses',
  'Compute / Hosting',
  'Hardware',
  'Other',
]

export default function RequestForm({ profile, onSubmitted }) {
  const [summary, setSummary] = useState(null)
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState(CATEGORIES[0])
  const [details, setDetails] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState(null)

  const loadSummary = async () => {
    const { data } = await supabase.from('fund_summary').select('*').single()
    setSummary(data)
  }

  useEffect(() => {
    loadSummary()
  }, [])

  const remaining = summary?.remaining ?? null
  const overBudget =
    remaining !== null && amount !== '' && Number(amount) > remaining

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!details.trim()) {
      setMessage({ type: 'error', text: 'Please add details about this request.' })
      return
    }
    setSubmitting(true)
    setMessage(null)

    const { error, data } = await supabase
      .from('requests')
      .insert({
        user_id: profile.id,
        amount: Number(amount),
        category,
        details: details.trim(),
      })
      .select()
      .single()

    setSubmitting(false)

    if (error) {
      setMessage({ type: 'error', text: error.message })
      return
    }

    if (data.status === 'declined') {
      setMessage({
        type: 'error',
        text: `Auto-declined — ${data.reviewer_comment?.replace(/\[|\]/g, '') ?? 'amount exceeds remaining balance.'}`,
      })
    } else {
      setMessage({ type: 'success', text: 'Request submitted. The approver has been notified.' })
      setAmount('')
      setDetails('')
    }

    await loadSummary()
    onSubmitted?.()
  }

  return (
    <div className="ledger-card p-6 max-w-xl">
      <h2 className="font-display text-2xl mb-1">New request</h2>
      <p className="text-sm text-inkSoft mb-4">
        {summary ? (
          <>
            Remaining balance:{' '}
            <span className="font-mono font-semibold text-ink">
              ${Number(summary.remaining).toLocaleString()}
            </span>{' '}
            <span className="text-xs">
              (of ${Number(summary.total_fund).toLocaleString()} total — $
              {Number(summary.approved_total).toLocaleString()} approved, $
              {Number(summary.pending_total).toLocaleString()} pending)
            </span>
          </>
        ) : (
          'Loading fund balance…'
        )}
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Amount (USD)</label>
          <input
            type="number"
            min="0.01"
            step="0.01"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full border border-paperLine rounded px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-ink"
            placeholder="0.00"
          />
          {overBudget && (
            <p className="text-xs text-stampRed mt-1">
              This exceeds the remaining balance (${remaining.toLocaleString()}) and will be
              automatically declined — you can submit anyway and revise afterwards.
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full border border-paperLine rounded px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-ink"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Details <span className="text-inkSoft">(required — name the tool/item and why)</span>
          </label>
          <textarea
            required
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            rows={3}
            className="w-full border border-paperLine rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ink"
            placeholder='e.g. "Claude API credits for prototyping the eval pipeline"'
          />
        </div>

        {message && (
          <p className={`text-sm ${message.type === 'error' ? 'text-stampRed' : 'text-stampGreen'}`}>
            {message.text}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="border border-ink rounded px-5 py-2 font-medium hover:bg-ink hover:text-paper transition disabled:opacity-50"
        >
          {submitting ? 'Submitting…' : 'Submit request'}
        </button>
      </form>
    </div>
  )
}
