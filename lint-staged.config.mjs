// lint-staged parses command strings rather than accepting argv arrays. Encode
// filenames as one shell-free argument so spaces and quote characters survive.
// Git invokes pre-commit from the repository root.
export default (files) =>
  `node scripts/lint-staged-files.mjs ${Buffer.from(JSON.stringify(files)).toString('base64url')}`;
