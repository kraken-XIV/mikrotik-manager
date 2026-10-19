/**
 * lint-staged configuration for the mikrotik-manager monorepo.
 *
 * Staged files arrive as repo-root-relative paths, but each package owns its
 * ESLint flat config and node_modules, so the frontend/backend entries strip
 * the directory prefix and run that package's ESLint from inside it. Prettier
 * runs once from the repo root, where the shared .prettierrc.json and
 * .prettierignore live.
 *
 * --no-warn-ignored lets ESLint succeed when a staged file is covered by an
 * ignore list (e.g. dist/ output that git tracked before an ignore landed).
 */
const inPackage = (pkg, files) => {
  const rel = files.filter((f) => f.startsWith(`${pkg}/`)).map((f) => f.slice(pkg.length + 1));
  if (rel.length === 0) return undefined;
  return `cd ${pkg} && npx eslint --fix --no-warn-ignored ${rel.join(' ')}`;
};

export default {
  'frontend/**/*.{ts,tsx}': (files) =>
    [`prettier --write ${files.join(' ')}`, inPackage('frontend', files)]
      .filter(Boolean)
      .join(' && '),
  'backend/**/*.ts': (files) =>
    [`prettier --write ${files.join(' ')}`, inPackage('backend', files)]
      .filter(Boolean)
      .join(' && '),
  '*.{js,mjs,json,md,yml,yaml,css,html}': (files) => `prettier --write ${files.join(' ')}`,
};
