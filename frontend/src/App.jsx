import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import Login from './components/Login'
import RequestForm from './components/RequestForm'
import RequestsList from './components/RequestsList'
import ReviewPanel from './components/ReviewPanel'
import Utilization from './components/Utilization'
import AdminPanel from './components/AdminPanel'
import PeoplePanel from './components/PeoplePanel'
import ThemeSwitcher from './components/ThemeSwitcher'

const ROLE_LABELS = {
  requester: 'Requester',
  approver: 'Approver',
  admin: 'Admin',
}

export default function App() {
  const [session, setSession] = useState(undefined) // undefined = loading
  const [profile, setProfile] = useState(null)
  const [profileLoadFailed, setProfileLoadFailed] = useState(false)
  const [tab, setTab] = useState('request')
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) {
      setProfile(null)
      return
    }
    const loadProfile = async () => {
      setProfileLoadFailed(false)
      for (let i = 0; i < 5; i++) {
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single()
        if (data) {
          setProfile(data)
          document.documentElement.setAttribute('data-theme', data.theme ?? 'default')
          return
        }
        await new Promise((r) => setTimeout(r, 500))
      }
      setProfileLoadFailed(true)
    }
    loadProfile()
  }, [session])

  if (session === undefined) {
    return <div className="min-h-screen flex items-center justify-center bg-paper">Loading…</div>
  }

  if (!session) return <Login />

  if (!profile) {
    if (profileLoadFailed) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-paper px-4">
          <div className="ledger-card max-w-sm w-full p-8 text-center">
            <p className="text-xs uppercase tracking-widest text-inkSoft mb-2">Exploratory Fund</p>
            <h1 className="font-display text-2xl mb-4">Couldn't set up your account</h1>
            <p className="text-sm text-inkSoft mb-6">
              Something went wrong creating your account. Please try signing
              in again, or contact an admin if this keeps happening.
            </p>
            <button
              onClick={() => supabase.auth.signOut()}
              className="text-sm underline text-inkSoft hover:text-ink"
            >
              Sign out and try again
            </button>
          </div>
        </div>
      )
    }
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper">
        Setting up your account…
      </div>
    )
  }

  if (profile.status !== 'active') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper px-4">
        <div className="ledger-card max-w-sm w-full p-8 text-center">
          <p className="text-xs uppercase tracking-widest text-inkSoft mb-2">Exploratory Fund</p>
          <h1 className="font-display text-2xl mb-4">
            {profile.status === 'disabled' ? 'Access disabled' : 'Awaiting approval'}
          </h1>
          <p className="text-sm text-inkSoft mb-6">
            {profile.status === 'disabled'
              ? 'An admin has disabled access for your account. Contact an admin if you think this is a mistake.'
              : `Signed in as ${profile.email}. Your access request has been routed to an admin — please wait for them to approve it.`}
          </p>
          <button
            onClick={() => supabase.auth.signOut()}
            className="text-sm underline text-inkSoft hover:text-ink"
          >
            Sign out
          </button>
        </div>
      </div>
    )
  }

  const isReviewer = profile.role === 'approver' || profile.role === 'admin'
  const isAdmin = profile.role === 'admin'

  const bump = () => setRefreshKey((k) => k + 1)

  const tabs = [
    { id: 'request', label: 'New request' },
    { id: 'all', label: 'All requests' },
    ...(isReviewer ? [{ id: 'review', label: 'Review' }] : []),
    { id: 'utilization', label: 'Utilization' },
    ...(isAdmin ? [{ id: 'admin', label: 'Admin' }] : []),
    ...(isAdmin ? [{ id: 'people', label: 'People' }] : []),
  ]

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-paperLine">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-inkSoft">Exploratory Fund</p>
            <h1 className="font-display text-2xl">Ledger &amp; Requests</h1>
          </div>
          <div className="flex items-center gap-3">
            <ThemeSwitcher
              profile={profile}
              onChange={(theme) => setProfile((p) => ({ ...p, theme }))}
            />
            {profile.avatar_url && (
              <img
                src={profile.avatar_url}
                alt=""
                className="w-9 h-9 rounded-full border border-paperLine"
              />
            )}
            <div className="text-right text-sm">
              <p className="font-medium">{profile.full_name ?? profile.email}</p>
              <p className="text-xs text-inkSoft uppercase tracking-wide">
                {ROLE_LABELS[profile.role] ?? profile.role}
              </p>
              <button
                onClick={() => supabase.auth.signOut()}
                className="text-xs underline text-inkSoft hover:text-ink"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
        <nav className="max-w-4xl mx-auto px-4 flex gap-6 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className="tab-btn py-2 px-1 text-sm whitespace-nowrap text-inkSoft aria-selected:text-ink"
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        {tab === 'request' && <RequestForm profile={profile} onSubmitted={bump} />}
        {tab === 'all' && <RequestsList profile={profile} isReviewer={isReviewer} refreshKey={refreshKey} />}
        {tab === 'review' && isReviewer && (
          <ReviewPanel profile={profile} refreshKey={refreshKey} onActed={bump} />
        )}
        {tab === 'utilization' && <Utilization refreshKey={refreshKey} />}
        {tab === 'admin' && isAdmin && <AdminPanel onUpdated={bump} />}
        {tab === 'people' && isAdmin && <PeoplePanel currentProfileId={profile.id} />}
      </main>
    </div>
  )
}
