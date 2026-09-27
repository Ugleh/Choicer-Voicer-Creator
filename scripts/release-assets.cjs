const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const pkg = require('../package.json');
const version = pkg.version;
const tag = `v${version}`;
const directory = path.join(root, 'release', tag);
const stem = `Choicer-Voicer-Creator-${version}-windows-x64`;
const assetNames = [`${stem}-setup.exe`, `${stem}.zip`];

function check() {
  assert.match(version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, 'Invalid release version');
  const lock = require('../package-lock.json');
  assert.equal(lock.version, version, 'package-lock.json must match package.json');
  assert.equal(lock.packages[''].version, version, 'Lockfile root package must match');
  if (process.env.GITHUB_REF_TYPE === 'tag') {
    assert.equal(process.env.GITHUB_REF_NAME, tag, 'Git tag must match the package version');
  }
  assert.ok(fs.readFileSync(path.join(root, 'docs', 'releases', `${tag}.md`), 'utf8').trim(), 'Release notes are required');
  return { version, tag, directory, assetNames };
}

async function checksum(file) {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

async function assets() {
  check();
  const lines = [];
  for (const name of assetNames) {
    const file = path.join(directory, name);
    assert.ok(fs.statSync(file).size > 1_000_000, `Missing or incomplete release asset: ${name}`);
    lines.push(`${await checksum(file)}  ${name}`);
  }
  fs.writeFileSync(path.join(directory, 'SHA256SUMS.txt'), lines.join('\n') + '\n');
  fs.copyFileSync(path.join(root, 'docs', 'releases', `${tag}.md`), path.join(directory, 'RELEASE-NOTES.md'));
  console.log(`Prepared installer, ZIP, checksums, and release notes in release/${tag}`);
}

if (require.main === module) {
  Promise.resolve().then(() => {
    if (process.argv[2] === 'assets') return assets();
    assert.equal(process.argv[2], 'check', 'Use check or assets');
    check();
    if (process.env.GITHUB_OUTPUT) {
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\ntag=${tag}\n`);
    }
    console.log(`Release metadata verified: ${tag}`);
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { check, checksum, version, tag, directory, assetNames };
