const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const AdmZip = require('adm-zip');
const asar = require('@electron/asar');
const { check, checksum, version, directory, assetNames } = require('./release-assets.cjs');

(async () => {
  check();
  const sums = await fs.readFile(path.join(directory, 'SHA256SUMS.txt'), 'utf8');
  assert.equal(sums.trim().split('\n').length, assetNames.length);
  for (const name of assetNames) {
    assert.ok(sums.includes(`${await checksum(path.join(directory, name))}  ${name}\n`), `Checksum mismatch: ${name}`);
  }
  const installer = await fs.open(path.join(directory, assetNames[0]), 'r');
  try {
    const magic = Buffer.alloc(2);
    await installer.read(magic, 0, 2, 0);
    assert.equal(magic.toString(), 'MZ', 'Installer must be a Windows executable');
  } finally { await installer.close(); }

  const zip = new AdmZip(path.join(directory, assetNames[1]));
  const entries = zip.getEntries().map(entry => entry.entryName);
  for (const name of ['Choicer Voicer Creator.exe', 'resources/app.asar', 'LICENSE.electron.txt', 'LICENSES.chromium.html', 'THIRD-PARTY-NOTICES.txt', 'README.txt']) {
    assert.ok(entries.includes(name), `ZIP missing ${name}`);
  }
  assert.ok(!entries.some(name => /(?:^|\/)(?:Packs|\.test-data|\.git)(?:\/|$)|\.cvcreator(?:\.|$)|(?:^|\/)(?:settings|jobs|recovery)\.json$/i.test(name)), 'ZIP contains private development data');

  await fs.mkdir(path.resolve('.test-data'), { recursive: true });
  const unpacked = await fs.mkdtemp(path.resolve('.test-data', 'release-zip-'));
  zip.extractAllTo(unpacked, false);
  const appArchive = path.join(unpacked, 'resources', 'app.asar');
  const appFiles = asar.listPackage(appArchive).map(file => file.replaceAll('\\', '/'));
  assert.ok(!appFiles.some(file => /^\/(?:Packs|\.test-data|\.git|docs|tests|scripts)(?:\/|$)|\.cvcreator(?:\.|$)/i.test(file)), 'App archive contains development files');
  assert.equal(JSON.parse(asar.extractFile(appArchive, 'package.json')).version, version);

  // Launch the downloaded shape, not the builder's working directory.
  const result = spawnSync(process.execPath, [path.join(__dirname, 'verify-package.cjs')], {
    stdio: 'inherit',
    env: { ...process.env, CV_PACKAGED_EXE: path.join(unpacked, 'Choicer Voicer Creator.exe') }
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, 'Extracted ZIP application did not pass its smoke check');
  console.log('Release verified: hashes, installer header, ZIP contents, licenses, version, and extracted app startup.');
})().catch(error => { console.error(error); process.exitCode = 1; });
