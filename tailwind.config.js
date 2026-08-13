/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#C5A059',
        'primary-dark': '#A68545',
        'bg-cream': '#FDFBF7',
        'bg-dark': '#1C1611',
        'surface-light': '#F7F2E8',
        'surface-dark': '#2A2118',
        'surface-dark-lighter': '#3D3025',
        'text-brown': '#422A12',
        'text-cream': '#F3EFE5',
        'border-sepia': '#E6DCC8',
        'border-bronze': '#3C2F24',
      },
      fontFamily: {
        // 全部使用系统字体栈,内网环境无需加载任何外部字体
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
    },
  },
  plugins: [],
};
