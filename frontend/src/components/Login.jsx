import { supabase } from '../lib/supabase'

export default function Login() {
  const signIn = () => {
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-paper px-4">
      <div className="ledger-card max-w-sm w-full p-8 text-center">
        <p className="text-xs uppercase tracking-widest text-inkSoft mb-2">
          Exploratory Fund
        </p>
        <h1 className="font-display text-3xl mb-6">Ledger &amp; Requests</h1>
        <p className="text-sm text-inkSoft mb-8">
          Sign in with your work Google account to view the fund balance,
          submit a request, or review pending ones.
        </p>
        <button
          onClick={signIn}
          className="w-full border border-ink rounded px-4 py-2 font-medium hover:bg-ink hover:text-paper transition"
        >
          Continue with Google
        </button>
      </div>
    </div>
  )
}
