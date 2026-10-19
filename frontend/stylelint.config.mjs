/**
 * stylelint for the frontend CSS surface.
 *
 * src/index.css is the design-token definition file: it legitimately contains
 * the raw hex values every other stylesheet should consume via var(--*). It
 * carries a file-level stylelint-disable for the two colour rules with that
 * rationale inline. Everywhere else the rules below apply from the first line
 * of the first new file: no raw hex, no named colours — consume the tokens.
 */
export default {
  ignoreFiles: ['dist/**', 'node_modules/**', 'coverage/**'],
  rules: {
    'at-rule-no-unknown': [
      true,
      {
        ignoreAtRules: [
          'tailwind',
          'apply',
          'layer',
          'screen',
          'variant',
          'variants',
          'responsive',
          'custom-variant',
          'source',
          'theme',
          'plugin',
          'utility',
        ],
      },
    ],
    'block-no-empty': true,
    'color-no-hex': true,
    'color-named': 'never',
    'color-no-invalid-hex': true,
    'custom-property-empty-line-before': 'never',
    'custom-property-pattern': [
      '^([a-z][a-z0-9]*)(-[a-z0-9]+)*$',
      { message: 'Custom properties are kebab-case (--accent-primary, not --accentPrimary)' },
    ],
    'declaration-block-no-duplicate-custom-properties': true,
    'declaration-block-no-duplicate-properties': [
      true,
      { ignore: ['consecutive-duplicates-with-different-values'] },
    ],
    'function-calc-no-unspaced-operator': true,
    'function-no-unknown': [true, { ignoreFunctions: ['theme'] }],
    'media-feature-name-no-unknown': true,
    'no-duplicate-selectors': true,
    'no-empty-source': true,
    'property-no-unknown': true,
    'selector-type-no-unknown': [true, { ignoreTypes: ['/^(mat|plt|sys|radix)$/'] }],
    'string-no-newline': true,
    'unit-no-unknown': true,
  },
};
