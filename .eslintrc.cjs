module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: './tsconfig.json',
  },
  plugins: ['@typescript-eslint', 'react', 'jsx-a11y', 'import', 'prettier'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'plugin:jsx-a11y/recommended',
    'plugin:import/recommended',
    'plugin:import/typescript',
    'plugin:@next/next/recommended',
    'prettier',
    'plugin:prettier/recommended',
  ],
  ignorePatterns: [
    'dist/',
    'node_modules/',
    'ecosystem.config.js',
    'next.config.js',
  ],
  rules: {
    '@typescript-eslint/no-explicit-any': 'off',
    'react/react-in-jsx-scope': 'off',
    '@typescript-eslint/no-unused-vars': 'warn',
    'jsx-a11y/anchor-is-valid': 'warn',
    'react-hooks/exhaustive-deps': 'warn',
    'jsx-a11y/label-has-associated-control': 'off',
    'import/no-unresolved': 'off',
    'import/no-named-as-default-member': 'off',
    'prefer-const': 'warn',
    'prettier/prettier': 'error',
    'react/prop-types': 'off',
    'import/no-named-as-default': 'off',
  },
  overrides: [
    {
      files: ['**/*.ts', '**/*.tsx'],
      excludedFiles: 'dist/**',
      parserOptions: {
        project: './tsconfig.json',
      },
    },
  ],
  settings: {
    react: {
      version: 'detect',
    },
  },
};
