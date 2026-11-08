// Guard rail, not a style guide: the package's production code stays free of `any`.
// Tests build partial mock requests and documents, so they keep their casts.
import tseslint from 'typescript-eslint'

// `src/` carries `eslint-disable` comments for rules of plugins this package doesn't load
// (the host app's react-hooks and Next configs). ESLint errors on a directive naming a rule
// it has never heard of, so declare those names as no-ops.
const noop = { meta: { schema: [] }, create: () => ({}) }
const hostRules = {
  'react-hooks': { rules: { 'exhaustive-deps': noop } },
  '@next/next': { rules: { 'no-img-element': noop } },
}

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', 'scripts/**', '*.config.*'] },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { parser: tseslint.parser },
    plugins: { '@typescript-eslint': tseslint.plugin, ...hostRules },
    // The no-op rules never report, so their directives would all read as "unused".
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    rules: { '@typescript-eslint/no-explicit-any': 'error' },
  },
  {
    files: ['src/**/__tests__/**', 'src/**/*.test.{ts,tsx}'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
)
