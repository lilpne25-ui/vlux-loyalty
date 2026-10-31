module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0E1013',
        slate2: '#667085',
        line: '#E4E7EC',
        'cafe-ink': '#2B1B14',
        'cafe-body': '#5A4636',
        'cafe-muted': '#8C7663',
        'cafe-line': '#E6D9C6',
        'cafe-cream': '#F3E9DA',
      },
      fontFamily: {
        sans: ['Geist', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['"Young Serif"', 'Georgia', 'serif'],
        mono: ['"Geist Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};
