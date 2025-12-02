/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Refined coral/terracotta palette - warm but sophisticated
        primary: {
          DEFAULT: '#e85d3b',
          50: '#fef6f4',
          100: '#fdeae5',
          200: '#fbd5cc',
          300: '#f7b5a6',
          400: '#f08a72',
          500: '#e85d3b',
          600: '#d44425',
          700: '#b1361c',
          800: '#922e1b',
          900: '#792a1c',
        },
        // Warm sage/olive accent
        sage: {
          DEFAULT: '#7c9082',
          50: '#f5f7f5',
          100: '#e8ece9',
          200: '#d2dbd5',
          300: '#b0c0b5',
          400: '#8aa392',
          500: '#7c9082',
          600: '#5f7366',
          700: '#4d5d53',
          800: '#414d45',
          900: '#38423b',
        },
        // Cream/warm white backgrounds
        cream: {
          DEFAULT: '#faf8f5',
          50: '#fefdfb',
          100: '#faf8f5',
          200: '#f5f0e8',
          300: '#ebe3d6',
          400: '#ddd1be',
          500: '#cdbda3',
        },
        // Warm charcoal for text
        charcoal: {
          DEFAULT: '#2d2926',
          50: '#f7f6f6',
          100: '#e5e2e1',
          200: '#ccc7c4',
          300: '#a9a19c',
          400: '#857b75',
          500: '#6b615b',
          600: '#554d48',
          700: '#46403c',
          800: '#3b3734',
          900: '#2d2926',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Plus Jakarta Sans', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'soft': '0 2px 15px -3px rgba(0, 0, 0, 0.07), 0 10px 20px -2px rgba(0, 0, 0, 0.04)',
        'soft-lg': '0 10px 40px -15px rgba(0, 0, 0, 0.1)',
        'inner-soft': 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.02)',
      },
    },
  },
  plugins: [],
}
