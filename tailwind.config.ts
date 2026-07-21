import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          900: '#0c4a6e',
        },
        ink: {
          50: '#fafafa',
          100: '#f4f4f5',
          200: '#e4e4e7',
          400: '#a1a1aa',
          600: '#52525b',
          900: '#18181b',
        },
      },
    },
  },
  plugins: [],
};
export default config;
