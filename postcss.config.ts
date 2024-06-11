import postcssImport from 'postcss-import';
import tailwindcssNesting from 'tailwindcss/nesting';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

export default {
  plugins: [
    postcssImport(),
    tailwindcssNesting(),
    tailwindcss(),
    autoprefixer(),
  ],
};
