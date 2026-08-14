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
        // Quiet Surface (Coffee Minimal) — semantic tokens driven by the
        // colorway CSS variables in index.css (8 palettes). espresso-family
        // solid for primary chrome; amber (Tailwind scale) is the single accent.
        // The legacy `*-dark` names resolve to the SAME vars so existing
        // `dark:` variants stay consistent when a dark colorway is active.
        primary: 'rgb(var(--c-primary) / <alpha-value>)',
        'primary-dark': 'rgb(var(--c-primary-dark) / <alpha-value>)',
        'primary-light': 'rgb(var(--c-primary-light) / <alpha-value>)',
        'on-primary': 'rgb(var(--c-on-primary) / <alpha-value>)',
        bg: 'rgb(var(--c-bg) / <alpha-value>)',
        'bg-dark': 'rgb(var(--c-bg) / <alpha-value>)',
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
        'surface-dark': 'rgb(var(--c-surface) / <alpha-value>)',
        'surface-2': 'rgb(var(--c-surface-2) / <alpha-value>)',
        'surface-2-dark': 'rgb(var(--c-surface-2) / <alpha-value>)',
        ink: 'rgb(var(--c-ink) / <alpha-value>)',
        'ink-dark': 'rgb(var(--c-ink) / <alpha-value>)',
        muted: 'rgb(var(--c-muted) / <alpha-value>)',
        'muted-dark': 'rgb(var(--c-muted) / <alpha-value>)',
        line: 'rgb(var(--c-line) / <alpha-value>)',
        'line-dark': 'rgb(var(--c-line) / <alpha-value>)',
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
