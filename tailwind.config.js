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
        // Quiet Surface (Coffee Minimal) — warm restrained palette.
        // espresso solid for primary chrome; amber (Tailwind scale) for accents.
        primary: '#4E3B2C',
        'primary-dark': '#3C2D21',
        'primary-light': '#C79A63',
        bg: '#F2ECE1',
        'bg-dark': '#161311',
        surface: '#FCFAF4',
        'surface-dark': '#211B15',
        'surface-2': '#E9E0D0',
        'surface-2-dark': '#2B241B',
        ink: '#2B2119',
        'ink-dark': '#F0E8DA',
        muted: '#7C6C56',
        'muted-dark': '#AD9E88',
        line: '#E4D9C6',
        'line-dark': '#372E23',
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
        // literary display serif for titles / metrics
        serif: [
          '"Iowan Old Style"', '"Palatino Linotype"', 'Palatino',
          '"Songti SC"', 'Georgia', 'serif',
        ],
      },
      borderRadius: {
        xl: '14px',
        '2xl': '22px',
        '3xl': '28px',
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
        panel: '0 1px 2px rgba(52, 38, 24, 0.05), 0 8px 24px rgba(52, 38, 24, 0.05)',
        card: '0 1px 2px rgba(52, 38, 24, 0.04), 0 10px 30px -14px rgba(52, 38, 24, 0.18)',
        lift: '0 2px 6px rgba(52, 38, 24, 0.06), 0 16px 40px -18px rgba(52, 38, 24, 0.28)',
      },
      transitionTimingFunction: {
        quiet: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [],
};
