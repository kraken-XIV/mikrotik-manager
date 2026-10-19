import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = JSON.parse(Buffer.from(process.argv[2], 'base64url').toString('utf8')).map((file) =>
  path.resolve(root, file),
);

function run(script, args, cwd) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (files.length) {
  run(
    path.join(root, 'node_modules/prettier/bin/prettier.cjs'),
    ['--write', '--ignore-unknown', '--', ...files],
    root,
  );
  for (const pkg of ['frontend', 'backend']) {
    const cwd = path.join(root, pkg);
    const owned = files.filter((file) => {
      const relative = path.relative(cwd, file);
      return (
        !relative.startsWith(`..${path.sep}`) &&
        !path.isAbsolute(relative) &&
        /\.tsx?$/.test(relative)
      );
    });
    if (owned.length) {
      run(
        path.join(cwd, 'node_modules/eslint/bin/eslint.js'),
        ['--fix', '--no-warn-ignored', '--', ...owned],
        cwd,
      );
    }
  }
}
