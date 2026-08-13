/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#0F766E',
        'primary-dark': '#115E59',
        'primary-light': '#2DD4BF',
        bg: '#F6F7F9',
        'bg-dark': '#0B1220',
        surface: '#FFFFFF',
        'surface-dark': '#152033',
        'surface-2': '#EEF1F4',
        'surface-2-dark': '#1C2A40',
        ink: '#0F172A',
        'ink-dark': '#E8EEF6',
        muted: '#64748B',
        'muted-dark': '#94A3B8',
        line: '#E2E8F0',
        'line-dark': '#243044',
      },
      fontFamily: {
        sans: [
          '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto',
          '"PingFang SC"', '"Hiragino Sans GB"', '"Microsoft YaHei"',
          '"Noto Sans SC"', 'sans-serif',
        ],
        mono: [
          'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas',
          '"PingFang SC"', '"Microsoft YaHei"', 'monospace',
        ],
        serif: [
          'Georgia', '"Times New Roman"', '"Songti SC"', 'SimSun', 'serif',
        ],
      },
      animation: {
        'scan-line': 'scan 3s ease-in-out infinite',
      },
      keyframes: {
        scan: {
          '0%, 100%': { top: '0%', opacity: '0' },
          '10%': { opacity: '1' },
          '50%': { top: '100%', opacity: '1' },
          '90%': { opacity: '1' },
        },
      },
      boxShadow: {
        panel: '0 1px 2px rgba(15, 23, 42, 0.06), 0 8px 24px rgba(15, 23, 42, 0.04)',
      },
    },
  },
  plugins: [],
};
