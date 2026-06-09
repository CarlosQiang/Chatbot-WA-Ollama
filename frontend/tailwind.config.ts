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
          focus: '#3a3a48',
        },
        fg: {
          DEFAULT: '#e6e6ea',
          muted: '#9090a0',
          subtle: '#5e5e6e',
        },
        accent: {
          DEFAULT: '#7cf3a5',
          muted: '#4a8a63',
          dim: 'rgba(124,243,165,0.12)',
        },
        danger: '#f87171',
        warn: '#f59e0b',
        info: '#60a5fa',
        success: '#7cf3a5',
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
        'xs':  ['0.75rem',   { lineHeight: '1.125rem' }],
        'sm':  ['0.8125rem', { lineHeight: '1.25rem' }],
        'base':['0.875rem',  { lineHeight: '1.375rem' }],
        'md':  ['0.9375rem', { lineHeight: '1.5rem' }],
        'lg':  ['1rem',      { lineHeight: '1.5rem' }],
        'xl':  ['1.125rem',  { lineHeight: '1.75rem' }],
      },
      spacing: {
        '4.5': '1.125rem',
        '13': '3.25rem',
        '18': '4.5rem',
      },
      borderRadius: {
        'sm':  '0.375rem',
        'md':  '0.5rem',
        'lg':  '0.75rem',
        'xl':  '1rem',
        '2xl': '1.25rem',
      },
      boxShadow: {
        'card':         '0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)',
        'card-hover':   '0 4px 12px rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.4)',
        'elevated':     '0 8px 24px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.4)',
        'glow-accent':  '0 0 12px rgba(124,243,165,0.25)',
        'glow-sm':      '0 0 6px rgba(124,243,165,0.2)',
        'inner-border': 'inset 0 1px 0 rgba(255,255,255,0.04)',
      },
      ringColor: {
        DEFAULT: '#7cf3a5',
        accent: '#7cf3a5',
      },
      ringOffsetColor: {
        DEFAULT: '#0a0a0b',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to:   { opacity: '1', transform: 'scale(1)' },
        },
        'slide-in-left': {
          from: { opacity: '0', transform: 'translateX(-8px)' },
          to:   { opacity: '1', transform: 'translateX(0)' },
        },
        'shimmer': {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition:  '200% 0' },
        },
        'pulse-dot': {
          '0%, 100%': { transform: 'scale(1)', opacity: '1' },
          '50%':      { transform: 'scale(1.4)', opacity: '0.7' },
        },
        'spin-slow': {
          from: { transform: 'rotate(0deg)' },
          to:   { transform: 'rotate(360deg)' },
        },
        'blink': {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.2' },
        },
        pulse: {
          '0%,100%': { opacity: '1' },
          '50%':     { opacity: '0.5' },
        },
      },
      animation: {
        'fade-in':       'fade-in 200ms ease-out',
        'fade-up':       'fade-up 240ms cubic-bezier(0.22,1,0.36,1)',
        'scale-in':      'scale-in 180ms cubic-bezier(0.22,1,0.36,1)',
        'slide-in-left': 'slide-in-left 220ms cubic-bezier(0.22,1,0.36,1)',
        'shimmer':       'shimmer 1.6s linear infinite',
        'pulse-dot':     'pulse-dot 2s ease-in-out infinite',
        'spin-slow':     'spin-slow 1.2s linear infinite',
        'blink':         'blink 1.4s ease-in-out infinite',
      },
      transitionTimingFunction: {
        'spring': 'cubic-bezier(0.22, 1, 0.36, 1)',
        'ease-out-expo': 'cubic-bezier(0.19, 1, 0.22, 1)',
      },
      transitionDuration: {
        '120': '120ms',
        '180': '180ms',
        '220': '220ms',
        '320': '320ms',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
export default config;
