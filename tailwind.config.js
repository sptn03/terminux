/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          base: '#11111b',
          mantle: '#181825',
          crust: '#1e1e2e',
          overlay: '#313244',
          soft: '#45475a',
          mid: '#585b70',
          subtle: '#6c7086',
          text: '#a6adc8',
          light: '#cdd6f4',
          white: '#ffffff'
        },
        accent: {
          blue: '#89b4fa',
          green: '#a6e3a1',
          yellow: '#f9e2af',
          red: '#f38ba8',
          mauve: '#cba6f7',
          teal: '#94e2d5',
          peach: '#fab387'
        }
      },
      spacing: { '4px': '4px', '16px': '16px', '36px': '36px' },
      animation: {
        'fade-in': 'fadeIn 0.18s cubic-bezier(0.16,1,0.3,1)',
        'slide-up': 'slideUp 0.22s cubic-bezier(0.16,1,0.3,1)',
        'pulse-dot': 'pulseDot 1.8s ease-in-out infinite',
        'glow-pulse': 'glowPulse 2s ease-in-out infinite',
        'scale-in': 'scaleIn 0.12s cubic-bezier(0.16,1,0.3,1)',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0', transform: 'scale(0.97)' }, '100%': { opacity: '1', transform: 'scale(1)' } },
        slideUp: { '0%': { opacity: '0', transform: 'translateY(6px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        pulseDot: { '0%,100%': { opacity: '0.4', transform: 'scale(1)' }, '50%': { opacity: '1', transform: 'scale(1.3)' } },
        glowPulse: { '0%,100%': { boxShadow: '0 0 8px rgba(137,180,250,0.15)' }, '50%': { boxShadow: '0 0 20px rgba(137,180,250,0.3)' } },
        scaleIn: { '0%': { transform: 'scale(0.92)', opacity: '0' }, '100%': { transform: 'scale(1)', opacity: '1' } },
      }
    }
  },
  plugins: []
}
