/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        cyber: {
          bg: '#0a0e14',
          panel: '#121821',
          border: '#1e2a3a',
          up: '#22d3ee',
          down: '#f43f5e',
          slow: '#facc15',
        },
      },
      boxShadow: {
        glow: '0 0 20px rgba(34, 211, 238, 0.25)',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
}
