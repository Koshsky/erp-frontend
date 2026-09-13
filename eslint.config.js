// ESLint flat config (ESLint 9+/10, ESM — the package is "type": "module").
// Scope: `src/**/*.{ts,vue}`. Generated sources under `src/api` are excluded from
// linting — they are produced by the OpenAPI generator and are not hand-edited
// (see AGENTS.md).
import pluginVue from 'eslint-plugin-vue'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'

export default defineConfigWithVueTs(
  {
    name: 'app/files-to-lint',
    files: ['**/*.{ts,mts,tsx,vue}'],
  },
  {
    name: 'app/files-to-ignore',
    ignores: ['**/dist/**', '**/node_modules/**', '**/storybook-static/**', 'src/api/**'],
  },
  pluginVue.configs['flat/essential'],
  vueTsConfigs.recommended,
  {
    name: 'app/rules',
    rules: {
      // Single-word components are intentional (App, Bar, AppIcon, ...).
      'vue/multi-word-component-names': 'off',

      // The project logs deliberately (diagnostics, oidc/session flow).
      'no-console': 'off',

      // Types are checked by `npm run check` (vue-tsc); stay at essential level here.
      'vue/no-v-html': 'off',

      // Unused vars via TS-aware rule; `_`-prefixed args/vars are intentional.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'after-used',
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
        },
      ],
    },
  },
)
