const fs = require('node:fs');
const path = require('node:path');

// Vite bundles these dependencies into the renderer, so ship their notices
// alongside the app as well as the licenses retained inside app.asar.
const names = ['react', 'react-dom', 'scheduler', 'lucide-react', 'adm-zip'];
const sections = names.map(name => {
  const directory = path.join(__dirname, '..', 'node_modules', name);
  const { version } = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
  return `${name} ${version}\n${'='.repeat(60)}\n${fs.readFileSync(path.join(directory, 'LICENSE'), 'utf8').trim()}`;
});
const text = 'Third-party software notices\n\nElectron and Chromium notices are provided separately in LICENSE.electron.txt and LICENSES.chromium.html.\n\n' + sections.join('\n\n') + '\n';
fs.writeFileSync(path.join(__dirname, '..', 'dist', 'THIRD-PARTY-NOTICES.txt'), text);
