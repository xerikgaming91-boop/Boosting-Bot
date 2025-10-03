/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/frontend/index.html',
    './src/frontend/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Primärfarbe: grün
        brand: {
          DEFAULT: '#22c55e', // emerald-500
          600: '#16a34a',     // emerald-600 (Hover)
          700: '#15803d',     // emerald-700 (Active)
        },
      },
      boxShadow: {
        soft: '0 8px 30px rgba(0,0,0,0.30), inset 0 1px 0 rgba(255,255,255,0.03)',
      },
      borderRadius: {
        xl: '0.9rem',
        '2xl': '1.25rem',
      },
    },
  },
  plugins: [require('@tailwindcss/forms')],
};
