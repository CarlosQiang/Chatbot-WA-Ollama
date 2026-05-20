import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
    './src/app/**/*.{ts,tsx}',
  ],
  theme: {
    container: { center: true, padding: '2rem' },
    extend: {
      colors: {
        bg: {
          DEFAULT: '#0a0a0b',
          elevated: '#111114',
          card: '#15151a',
          subtle: '#1c1c22',
        },
        border: {
          DEFAULT: '#22222a',
          strong: '#2e2e38',
        },
        fg: {
          DEFAULT: '#e6e6ea',
          muted: '#9090a0',
          subtle: '#5e5e6e',
        },
        accent: {
          DEFAULT: '#7cf3a5',
          muted: '#4a8a63',
        },
        danger: '#f87171',
        warn: '#f59e0b',
        info: '#60a5fa',
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        pulse: {
          '0%,100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
      },
      animation: {
        'fade-in': 'fade-in 200ms ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
export default config;
