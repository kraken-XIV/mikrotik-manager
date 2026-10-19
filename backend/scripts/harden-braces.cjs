// Temporary local mitigation for GHSA-vfj7-8cjw-p6xm. npm has no fixed
// release as of 2026-10-19. Keep the advisory visible: this is not a claim
// that upstream braces@3.0.3 is patched. Run after each package install.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const cwd = process.cwd();
const lock = JSON.parse(fs.readFileSync(path.join(cwd, 'package-lock.json'), 'utf8'));
const marker = 'MTM_BRACES_DEPTH_GUARD';
for (const name of Object.keys(lock.packages)) {
  if (!name.endsWith('/braces')) continue;
  const root = path.join(cwd, name);
  if (!fs.existsSync(root)) {
    assert(lock.packages[name].dev, 'Missing runtime dependency');
    continue; // npm ci --omit=dev: no vulnerable package is installed.
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (pkg.version !== '3.0.3') throw new Error(`Review braces guard for version ${pkg.version}`);
  for (const file of ['parse', 'compile', 'expand', 'stringify']) {
    const filename = path.join(root, 'lib', `${file}.js`);
    let text = fs.readFileSync(filename, 'utf8');
    if (text.includes(marker)) continue;
    const original = text;
    if (file === 'parse') {
      assert(text.includes('stack.push(block);'), 'Parser shape changed');
      text = text.replaceAll(
        'stack.push(block);',
        `if (stack.length >= 128) throw new SyntaxError('${marker}: pattern nesting exceeds 128');\n      stack.push(block);`,
      );
    } else {
      const fn = file === 'stringify' ? 'stringify' : 'walk';
      const signature = `const ${fn} = (node, parent = {}) => {`;
      assert(text.includes(signature), 'Walker shape changed');
      text = text.replace(
        signature,
        `const ${fn} = (node, parent = {}, depth = 0) => {\n    if (depth > 128) throw new SyntaxError('${marker}: AST nesting exceeds 128');`,
      );
      text = text.replaceAll(`${fn}(child, node)`, `${fn}(child, node, depth + 1)`);
      if (file === 'stringify')
        text = text.replaceAll('stringify(child)', 'stringify(child, node, depth + 1)');
    }
    assert(text !== original && text.includes(marker));
    fs.writeFileSync(filename, text);
  }
  // Attack regression: ordinary patterns work, deep strings and caller-built
  // ASTs fail with our bounded SyntaxError instead of an uncaught stack overflow.
  const braces = require(root);
  assert.deepEqual(braces.expand('x{a,b}'), ['xa', 'xb']);
  const nested = '{'.repeat(500) + 'a,b' + '}'.repeat(500);
  for (const fn of [braces.parse, braces.compile, braces.expand]) {
    assert.throws(
      () => fn(nested),
      (e) => e instanceof SyntaxError && e.message.includes(marker),
    );
  }
  let ast = { type: 'text', value: 'x' };
  for (let i = 0; i < 500; i++) ast = { type: 'brace', commas: 1, ranges: 0, nodes: [ast] };
  ast = { type: 'root', nodes: [ast] };
  for (const file of ['compile', 'expand', 'stringify']) {
    const fn = require(path.join(root, 'lib', file));
    assert.throws(
      () => fn(ast),
      (e) => e instanceof SyntaxError && e.message.includes(marker),
    );
  }
  console.log(`braces depth guard verified: ${name} (128 levels)`);
}
