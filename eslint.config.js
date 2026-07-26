const { defineConfig, globalIgnores } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettier = require('eslint-plugin-prettier');
const reactRefresh = require('eslint-plugin-react-refresh');

module.exports = defineConfig([
  globalIgnores([
    '**/dist/**',
    '**/.expo/**',
    '**/expo-env.d.ts',
    '**/node_modules/**',
  ]),

  expoConfig,

  {
    files: ['apps/mobile/**/*.{js,jsx,ts,tsx}'],
    settings: {
      'import/resolver': {
        typescript: {
          project: './apps/mobile/tsconfig.json',
        },
      },
    },
  },

  {
    plugins: {
      prettier,
      'react-refresh': reactRefresh,
    },

    rules: {
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
]);
