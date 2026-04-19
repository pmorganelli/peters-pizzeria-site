/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        red:        'var(--red)',
        'red-light':'var(--red-light)',
        green:      'var(--green)',
        'green-light':'var(--green-light)',
        cream:      'var(--cream)',
        cream2:     'var(--cream2)',
        gold:       'var(--gold)',
        ink:        'var(--ink)',
        ink2:       'var(--ink2)',
      },
      fontFamily: {
        serif: ['EB Garamond', 'Georgia', 'serif'],
        mono:  ['DM Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};
