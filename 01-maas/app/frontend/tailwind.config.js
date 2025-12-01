/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#ff6600',
          50: '#fff5eb',
          100: '#ffe5cc',
          200: '#ffcc99',
          300: '#ffb366',
          400: '#ff9933',
          500: '#ff6600',
          600: '#cc5200',
          700: '#993d00',
          800: '#662900',
          900: '#331400',
        },
        secondary: {
          DEFAULT: '#ff6633',
          light: '#ff9933',
          dark: '#cc5229',
        },
        accent: {
          DEFAULT: '#ff9900',
          light: '#ff9933',
          dark: '#cc7a00',
        },
        dark: {
          DEFAULT: '#444444',
          light: '#666666',
          lighter: '#888888',
        }
      }
    },
  },
  plugins: [],
}
