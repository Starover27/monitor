/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        cyber: {
          bg: '#0b1017',
          panel: '#111a29',
          border: '#1e2a3d',
          up: '#34d399',
          down: '#fb7185',
          slow: '#fbbf24',
        },
      },
      boxShadow: {
        panel: '0 10px 32px rgba(2, 6, 16, 0.45)',
        glow: '0 0 20px rgba(52, 211, 153, 0.2)',
        'glow-up': '0 0 22px rgba(52, 211, 153, 0.16)',
        'glow-down': '0 0 22px rgba(251, 113, 133, 0.2)',
        'glow-slow': '0 0 22px rgba(251, 191, 36, 0.16)',
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Cascadia Mono', 'Consolas', 'monospace'],
      },
      keyframes: {
        'fade-in': {
          from: { opacity: 0, transform: 'translateY(6px)' },
          to: { opacity: 1, transform: 'translateY(0)' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0.35 },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.35s ease-out both',
        'pulse-soft': 'pulse-soft 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
