/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        paper: 'var(--color-paper)',
        paperLine: 'var(--color-paperLine)',
        ink: 'var(--color-ink)',
        inkSoft: 'var(--color-inkSoft)',
        card: 'var(--color-card)',
        stampGreen: 'var(--color-stamp-green)',
        stampAmber: 'var(--color-stamp-amber)',
        stampRed: 'var(--color-stamp-red)',
        stampRevision: 'var(--color-stamp-revision)',
      },
      fontFamily: {
        display: ['"Source Serif 4"', 'Georgia', 'serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
}
