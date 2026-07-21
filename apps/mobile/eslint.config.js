// https://docs.expo.dev/guides/using-eslint/
const { defineConfig, globalIgnores } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettier = require('eslint-plugin-prettier');
const reactRefresh = require('eslint-plugin-react-refresh');
// const globals = require('globals');

module.exports = defineConfig([
  globalIgnores(['dist/*', '.expo/*']),

  expoConfig,

  {
    plugins: {
      prettier,
      'react-refresh': reactRefresh,
    },

    rules: {
      // 'react-refresh/only-export-components': [
      //   'warn',
      //   { allowConstantExport: true },
      // ],

      'prettier/prettier': [
        'error',
        {
          endOfLine: 'auto',
          semi: true,
          singleQuote: true,
          trailingComma: 'es5',
          printWidth: 80,
        },
      ],

      'no-restricted-syntax': [
        'error',
        {
          selector: 'FunctionDeclaration[async=true][id.name=/^[A-Z]/]',
          message:
            'React components must not be async (async components cause suspense/blinking issues)',
        },
      ],
    },
  },

  // {
  //   files: ['babel.config.js', 'metro.config.js', 'app.config.js'],
  //   languageOptions: {
  //     globals: globals.node,
  //   },
  // },
]);
