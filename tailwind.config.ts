/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx}',
    './src/components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      'spring green': '#00ff7f',
      scarlet: {
        '50': '#fff1f0',
        '100': '#ffe0dd',
        '200': '#ffc6c0',
        '300': '#ff9e94',
        '400': '#ff6757',
        '500': '#ff3923',
        '600': '#ff1900',
        '700': '#d71500',
        '800': '#b11403',
        '900': '#92170a',
        '950': '#500800',
      },
      'blue ribbon': {
        100: '#d6ebff',
        400: '#48aaff',
        500: '#1e84ff',
        600: '#0662ff',
        700: '#0662ff',
      },
    },
    plugins: [],
  },
};
