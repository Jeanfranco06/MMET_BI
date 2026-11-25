import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        display: ['var(--font-jakarta)', 'var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      colors: {
        sidebar: {
          DEFAULT: '#0B1220',
          surface: '#0F172A',
          hover: '#1E293B',
          border: '#1E293B',
        },
        brand: {
          teal: '#14B8A6',
          indigo: '#6366F1',
        },
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.03)',
        'card-hover': '0 4px 12px -2px rgb(15 23 42 / 0.07), 0 2px 4px -2px rgb(15 23 42 / 0.04)',
      },
    },
  },
  plugins: [],
};

export default config;
