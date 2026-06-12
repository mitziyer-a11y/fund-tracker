/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#F7F2E7',
        paperLine: '#E2D8C3',
        ink: '#1F2A3C',
        inkSoft: '#4B5768',
        stampGreen: '#2F6F4F',
        stampRed: '#B33A3A',
        stampAmber: '#C98A2B',
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
