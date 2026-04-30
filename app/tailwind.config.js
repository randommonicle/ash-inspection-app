/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ash: {
          navy:  '#1F3864',
          mid:   '#2E5395',
          light: '#D6E4F0',
          red:   '#C00000',
          amber: '#E26B0A',
          green: '#375623',
        },
      },
      fontFamily: {
        sans: ['Arial', 'Helvetica', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
