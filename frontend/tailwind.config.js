/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
          800: '#5b21b6',
          900: '#4c1d95',
        },
        glass: {
          white: 'rgba(255, 255, 255, 0.72)',
          light: 'rgba(255, 255, 255, 0.45)',
          border: 'rgba(255, 255, 255, 0.35)',
          hover: 'rgba(255, 255, 255, 0.85)',
        },
        surface: {
          50: '#f8f7ff',
          100: '#f0eeff',
          200: '#e8e4fd',
        },
      },
      backgroundImage: {
        'gradient-main': 'linear-gradient(135deg, #e8e4fd 0%, #ddd6fe 30%, #e0e7ff 60%, #ede9fe 100%)',
        'gradient-sidebar': 'linear-gradient(180deg, #7c3aed 0%, #6d28d9 50%, #5b21b6 100%)',
        'gradient-purple': 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
        'gradient-blue': 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
        'gradient-emerald': 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
        'gradient-amber': 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
        'gradient-rose': 'linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)',
      },
      backdropBlur: {
        xs: '2px',
      },
      boxShadow: {
        glass: '0 4px 30px rgba(0, 0, 0, 0.06)',
        'glass-lg': '0 8px 40px rgba(0, 0, 0, 0.08)',
        'glass-xl': '0 12px 50px rgba(0, 0, 0, 0.10)',
        'card': '0 2px 20px rgba(124, 58, 237, 0.06)',
        'card-hover': '0 8px 30px rgba(124, 58, 237, 0.12)',
        'purple': '0 4px 20px rgba(124, 58, 237, 0.25)',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.25rem',
        '4xl': '1.5rem',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [],
};
