import { supabase } from '../lib/supabase'

const THEMES = [
  { id: 'default', label: 'Ledger', swatch: '#F7F2E7' },
  { id: 'green', label: 'Forest', swatch: '#1B3326' },
  { id: 'rose', label: 'Rose', swatch: '#FFF1F3' },
]

export default function ThemeSwitcher({ profile, onChange }) {
  const setTheme = async (theme) => {
    document.documentElement.setAttribute('data-theme', theme)
    onChange?.(theme)
    await supabase.from('profiles').update({ theme }).eq('id', profile.id)
  }

  return (
    <div className="flex items-center gap-1.5">
      {THEMES.map((t) => (
        <button
          key={t.id}
          onClick={() => setTheme(t.id)}
          title={t.label}
          aria-label={`${t.label} theme`}
          className={`w-5 h-5 rounded-full border-2 transition ${
            profile.theme === t.id ? 'border-ink scale-110' : 'border-paperLine'
          }`}
          style={{ backgroundColor: t.swatch }}
        />
      ))}
    </div>
  )
}
