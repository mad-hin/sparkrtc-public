import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/renderer/**/*.{ts,tsx,html}'],
  darkMode: 'class',
  theme: {
    fontFamily: {
      sans: ['IBM Plex Sans', 'Helvetica Neue', 'Arial', 'sans-serif'],
      mono: ['IBM Plex Mono', 'Menlo', 'Courier', 'monospace'],
    },
    extend: {
      colors: {
        // IBM Carbon Gray 100 theme
        surface: {
          DEFAULT: '#161616',      // Gray 100 — page background
          secondary: '#262626',    // Gray 90 — layer 01 / cards
          tertiary: '#393939',     // Gray 80 — layer 02
          hover: '#353535',
        },
        accent: {
          DEFAULT: '#0f62fe',      // Blue 60 — primary interactive
          hover: '#0353e9',        // Blue 60 hover
          muted: '#002d9c',        // Blue 80 — active/pressed
        },
        success: '#24a148',        // Green 50
        warning: '#f1c21b',        // Yellow 30
        danger: '#da1e28',         // Red 60
      },
      borderRadius: {
        'none': '0px',
        'pill': '24px',
      },
      fontSize: {
        'display-01': ['3.75rem', { lineHeight: '1.17', fontWeight: '300' }],
        'heading-03': ['1.5rem', { lineHeight: '1.33', fontWeight: '400' }],
        'heading-04': ['1.25rem', { lineHeight: '1.4', fontWeight: '600' }],
        'body-long': ['1rem', { lineHeight: '1.5', fontWeight: '400' }],
        'body-short': ['0.875rem', { lineHeight: '1.29', fontWeight: '400', letterSpacing: '0.16px' }],
        'caption': ['0.75rem', { lineHeight: '1.33', fontWeight: '400', letterSpacing: '0.32px' }],
      },
    }
  },
  plugins: []
}

export default config
