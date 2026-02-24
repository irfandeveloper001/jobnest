/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx}', './app/**/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#16A34A',
        'background-light': '#f6f8f7',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 20px 45px rgba(15, 23, 42, 0.08)',
      },
    },
  },
  plugins: [require('@tailwindcss/forms')],
};
