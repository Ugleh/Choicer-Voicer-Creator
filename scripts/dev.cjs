const { spawn } = require('node:child_process');
const path = require('node:path');
const server = spawn(process.execPath, [path.join(__dirname, '../node_modules/vite/bin/vite.js')], { stdio: 'inherit', windowsHide: true });
let desktop;
async function boot() {
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch('http://127.0.0.1:5173')).ok) break; } catch {}
    await new Promise(r => setTimeout(r, 250));
  }
  desktop = spawn(require('electron'), [path.join(__dirname, '..')], { stdio: 'inherit', env: { ...process.env, CV_DEV: '1' }, windowsHide: true });
  desktop.on('exit', () => { server.kill(); process.exit(); });
}
process.on('SIGINT', () => { desktop?.kill(); server.kill(); process.exit(); });
boot();
