/** @type {import('tailwindcss').Config} */
export default {
  // Clase en <html> (ThemeContext.tsx la agrega/quita) en vez de la media
  // query 'media': así el toggle manual puede pisar prefers-color-scheme, no
  // solo reflejarlo.
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {}
  },
  plugins: []
};
