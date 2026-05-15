/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        osrs: {
          bg: '#3e3529',
          border: '#5e4a31',
          panel: '#c8b18a',
          text: '#ffff00',
          red: '#c81414',
          green: '#1ca81c',
          yellow: '#ffff00'
        }
      },
      fontFamily: {
        osrs: ['"Courier New"', 'monospace']
      }
    }
  },
  plugins: []
};
