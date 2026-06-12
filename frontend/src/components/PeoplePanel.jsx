import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const ROLES = ['requester', 'approver', 'admin']
const STATUSES = ['active', 'pending', 'disabled']

export default function PeoplePanel({ currentProfileId }) {
  const [allowed, setAllowed] = useState([])
  const [newEmail, setNewEmail] = useState('')
  const [profiles, setProfiles] = useState([])
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(null)

  const load = async () => {
    const [{ data: a }, { data: p }] = await Promise.all([
      supabase.from('allowed_emails').select('*').order('added_at', { ascending: false }),
      supabase.from('profiles').select('*').order('email'),
    ])
    setAllowed(a ?? [])
    setProfiles(p ?? [])
  }

  useEffect(() => {
    load()
  }, [])

  const addAllowed = async (e) => {
    e.preventDefault()
    const email = newEmail.trim().toLowerCase()
    if (!email) return
    setError(null)
    const { data: user } = await supabase.auth.getUser()
    const { error } = await supabase
      .from('allowed_emails')
      .insert({ email, added_by: user.user.id })
    if (error) {
      setError(error.message)
      return
    }
    setNewEmail('')
    await load()
  }

  const removeAllowed = async (email) => {
    setBusy(email)
    const { error } = await supabase.from('allowed_emails').delete().eq('email', email)
    setBusy(null)
    if (error) setError(error.message)
    await load()
  }

  const updateProfile = async (id, fields) => {
    setBusy(id)
    const { error } = await supabase.from('profiles').update(fields).eq('id', id)
    setBusy(null)
    if (error) setError(error.message)
    await load()
  }

  return (
    <div className="space-y-8">
      {/* Allowlist */}
      <div className="ledger-card p-6 max-w-xl">
        <h2 className="font-display text-2xl mb-1">Auto-approve list</h2>
        <p className="text-sm text-inkSoft mb-4">
          Anyone signing in with one of these emails is approved automatically.
          Everyone else lands on an "awaiting approval" screen until you approve
          them below.
        </p>
        <form onSubmit={addAllowed} className="flex gap-2 mb-4">
          <input
            type="email"
            placeholder="name@gmail.com"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            className="flex-1 border border-paperLine rounded px-3 py-2"
          />
          <button
            type="submit"
            className="border border-ink rounded px-4 py-2 font-medium hover:bg-ink hover:text-paper transition"
          >
            Add
          </button>
        </form>
        {allowed.length === 0 ? (
          <p className="text-sm text-inkSoft">No emails on the allowlist yet.</p>
        ) : (
          <ul className="space-y-1">
            {allowed.map((a) => (
              <li key={a.email} className="flex items-center justify-between text-sm ledger-rule py-1">
                <span className="font-mono">{a.email}</span>
                <button
                  onClick={() => removeAllowed(a.email)}
                  disabled={busy === a.email}
                  className="text-xs underline text-inkSoft hover:text-stampRed"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Existing users */}
      <div className="ledger-card p-6">
        <h2 className="font-display text-2xl mb-1">People</h2>
        <p className="text-sm text-inkSoft mb-4">
          Approve pending sign-ins, change roles, or disable access (booting
          someone out immediately blocks them from reading or submitting
          requests).
        </p>
        {error && <p className="text-sm text-stampRed mb-2">{error}</p>}

        <div className="space-y-2">
          {profiles.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 ledger-rule py-2 text-sm">
              <div>
                <p className="font-medium">{p.full_name ?? p.email}</p>
                <p className="text-inkSoft font-mono text-xs">{p.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={p.role}
                  disabled={busy === p.id || p.id === currentProfileId}
                  onChange={(e) => updateProfile(p.id, { role: e.target.value })}
                  className="border border-paperLine rounded px-2 py-1 bg-white text-xs"
                  title={p.id === currentProfileId ? "You can't change your own role" : undefined}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                <select
                  value={p.status}
                  disabled={busy === p.id || p.id === currentProfileId}
                  onChange={(e) => updateProfile(p.id, { status: e.target.value })}
                  className={`border rounded px-2 py-1 bg-white text-xs ${
                    p.status === 'disabled' ? 'border-stampRed text-stampRed'
                    : p.status === 'pending' ? 'border-stampAmber text-stampAmber'
                    : 'border-stampGreen text-stampGreen'
                  }`}
                  title={p.id === currentProfileId ? "You can't change your own status" : undefined}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
