import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const ROLES = ['requester', 'approver', 'admin']
const STATUSES = ['active', 'pending', 'disabled']

export default function PeoplePanel({ currentProfileId }) {
  const [allowed, setAllowed] = useState([])
  const [newEmail, setNewEmail] = useState('')
  const [newRole, setNewRole] = useState('requester')
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
      .insert({ email, role: newRole, added_by: user.user.id })
    if (error) {
      setError(error.message)
      return
    }
    setNewEmail('')
    setNewRole('requester')
    await load()
  }

  const removeAllowed = async (email) => {
    setBusy(email)
    const { error } = await supabase.from('allowed_emails').delete().eq('email', email)
    setBusy(null)
    if (error) setError(error.message)
    await load()
  }

  // Remove a person entirely. If they have request history, a hard delete
  // would violate a foreign key — fall back to disabling instead, and say so.
  const removeProfile = async (p) => {
    if (p.id === currentProfileId) {
      setError("You can't remove your own account.")
      return
    }
    setBusy(p.id)
    setError(null)

    const { error: delErr } = await supabase.from('profiles').delete().eq('id', p.id)
    if (delErr) {
      // Likely a foreign key violation (they have requests on file) —
      // disable instead, so access is revoked even if the record stays.
      const { error: disErr } = await supabase
        .from('profiles')
        .update({ status: 'disabled' })
        .eq('id', p.id)
      setBusy(null)
      if (disErr) {
        setError(disErr.message)
      } else {
        setError(`${p.email} has existing requests on file, so they were disabled instead of removed.`)
      }
      await load()
      return
    }

    // Also drop any allowlist entry so they can't auto-reactivate
    await supabase.from('allowed_emails').delete().eq('email', p.email)
    setBusy(null)
    await load()
  }

  const updateAllowedRole = async (email, role) => {
    setBusy(email)
    const { error } = await supabase.from('allowed_emails').update({ role }).eq('email', email)
    setBusy(null)
    if (error) setError(error.message)
    await load()
  }

  const updateProfile = async (id, fields, email) => {
    setBusy(id)
    const { error } = await supabase.from('profiles').update(fields).eq('id', id)
    if (!error && fields.role && email) {
      // Keep the allowlist's role in sync so it always reflects current role,
      // not a stale snapshot from signup time.
      await supabase
        .from('allowed_emails')
        .upsert({ email: email.toLowerCase(), role: fields.role }, { onConflict: 'email' })
    }
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
          Anyone signing in with one of these emails is approved automatically
          and starts with the role you pick here. Everyone else lands on a
          "your access is pending approval" screen until you approve them in
          People below.
        </p>
        <form onSubmit={addAllowed} className="flex gap-2 mb-4">
          <input
            type="email"
            placeholder="name@gmail.com"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            className="flex-1 border border-paperLine rounded px-3 py-2"
          />
          <select
            value={newRole}
            onChange={(e) => setNewRole(e.target.value)}
            className="border border-paperLine rounded px-3 py-2 bg-card text-sm"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
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
              <li key={a.email} className="flex items-center justify-between text-sm ledger-rule py-1 gap-2">
                <span className="font-mono">{a.email}</span>
                <div className="flex items-center gap-2">
                  <select
                    value={a.role}
                    disabled={busy === a.email}
                    onChange={(e) => updateAllowedRole(a.email, e.target.value)}
                    className="border border-paperLine rounded px-2 py-1 bg-card text-xs"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => removeAllowed(a.email)}
                    disabled={busy === a.email}
                    className="text-xs underline text-inkSoft hover:text-stampRed"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* People — merged view of everyone allowlisted + everyone who's signed in */}
      <div className="ledger-card p-6">
        <h2 className="font-display text-2xl mb-1">People</h2>
        <p className="text-sm text-inkSoft mb-4">
          Approve pending sign-ins, change roles, or disable access (booting
          someone out immediately blocks them from reading or submitting
          requests). People who've been added to the allowlist but haven't
          signed in yet show as "Invited" — their role can still be changed
          here, and takes effect once they log in.
        </p>
        {error && <p className="text-sm text-stampRed mb-2">{error}</p>}

        {(() => {
          const profileEmails = new Set(profiles.map((p) => p.email.toLowerCase()))
          const invited = allowed.filter((a) => !profileEmails.has(a.email.toLowerCase()))
          const rows = [
            ...profiles.map((p) => ({ type: 'profile', ...p })),
            ...invited.map((a) => ({ type: 'invited', ...a })),
          ]

          if (rows.length === 0) {
            return <p className="text-sm text-inkSoft">Nobody yet — add emails to the allowlist above.</p>
          }

          return (
            <div className="space-y-2">
              {rows.map((p) => (
                <div key={p.type === 'profile' ? p.id : `inv-${p.email}`} className="flex flex-wrap items-center justify-between gap-2 ledger-rule py-2 text-sm">
                  <div>
                    <p className="font-medium">{p.full_name ?? p.email}</p>
                    <p className="text-inkSoft font-mono text-xs">{p.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {p.type === 'profile' ? (
                      <>
                        <select
                          value={p.role}
                          disabled={busy === p.id || p.id === currentProfileId}
                          onChange={(e) => updateProfile(p.id, { role: e.target.value }, p.email)}
                          className="border border-paperLine rounded px-2 py-1 bg-card text-xs"
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
                          className={`border rounded px-2 py-1 bg-card text-xs ${
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
                        <button
                          onClick={() => removeProfile(p)}
                          disabled={busy === p.id || p.id === currentProfileId}
                          className="text-xs underline text-inkSoft hover:text-stampRed"
                          title={p.id === currentProfileId ? "You can't remove your own account" : undefined}
                        >
                          Remove
                        </button>
                      </>
                    ) : (
                      <>
                        <select
                          value={p.role}
                          disabled={busy === p.email}
                          onChange={(e) => updateAllowedRole(p.email, e.target.value)}
                          className="border border-paperLine rounded px-2 py-1 bg-card text-xs"
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                        <span className="text-xs border border-paperLine rounded px-2 py-1 text-inkSoft">
                          Invited
                        </span>
                        <button
                          onClick={() => removeAllowed(p.email)}
                          disabled={busy === p.email}
                          className="text-xs underline text-inkSoft hover:text-stampRed"
                        >
                          Remove
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        })()}
      </div>
    </div>
  )
}
