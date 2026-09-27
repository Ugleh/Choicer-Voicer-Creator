# Windows releases

Downloads live at <https://github.com/Ugleh/Choicer-Voicer-Creator/releases>.
Each release contains a Windows x64 NSIS installer, an extract-and-run ZIP, and
SHA-256 checksums. Users do not need Node.js or npm. FFmpeg and FFprobe remain
external dependencies, and ElevenLabs is optional.

## Publish a version

1. Update `package.json` and the two root version entries in `package-lock.json`
   to the same version. Add `docs/releases/vVERSION.md` with release notes,
   download names, and any setup or migration changes. Update the local launcher
   if you want it to prefer that version's unpacked build.
2. Commit and push the changes to `main`.
3. Create and push the matching tag, for example:

   ```powershell
   git tag -a v0.1.17 -m "Choicer Voicer Creator 0.1.17"
   git push origin v0.1.17
   ```

The **Windows release** workflow installs locked dependencies on a Windows
runner, tests media processing with generated fixtures, builds the installer
and ZIP, verifies hashes/content/version, and launches the extracted ZIP in
an isolated test profile. After all checks pass it creates a draft, uploads
all assets, and publishes the GitHub Release. Normal versions become Latest;
versions with a prerelease suffix become prereleases. Tag/package version
mismatches fail before building. Only version tags publish a release.

The workflow uses GitHub's automatic `GITHUB_TOKEN` with `contents: write`;
no personal access token or ElevenLabs secret is required. Repository Actions
must be enabled and organization/repository policies must permit this workflow.

Use **Actions → Windows release → Run workflow** on a branch for a build-only
trial. Tested files remain downloadable as an Actions artifact for 14 days.
Public releases keep their assets independently of that artifact retention.

If an upload fails, rerun the failed workflow while its release remains a draft.
The workflow can replace incomplete draft assets. It refuses to replace an
already-published release; fix the problem and publish a new version instead.

## Build locally

On Windows x64, with Node 22.12+ (24 recommended), npm, FFmpeg, and FFprobe:

```powershell
npm ci
npm test
npm run test:integration
npm run package:release
npm run test:release
```

Find files under `release/vVERSION/`. `npm run package` still creates only an
unpacked directory for local development. Local packaging always uses
`--publish never`; it cannot upload a release accidentally.

`SHA256SUMS.txt` covers the installer and ZIP. Verify a download in PowerShell:

```powershell
Get-FileHash .\Choicer-Voicer-Creator-0.1.17-windows-x64-setup.exe -Algorithm SHA256
```

Compare that hash with the matching line in `SHA256SUMS.txt`.

## Distribution details

The installer offers an installation directory, creates a Start menu shortcut,
and provides an uninstaller. Uninstalling preserves application data. The ZIP
runs without installation but still uses Windows AppData for settings/caches.
Neither format contains source movies, user projects, API keys, or generated
packs. Third-party notices and quick-start instructions are included.

Builds are currently unsigned. Windows may show an unknown-publisher warning;
adding code signing requires a signing identity and separate configuration.
There is no automatic app updater. The release check launches the extracted ZIP
and checks the installer artifact; it does not install/uninstall on the user's
computer or claim a full installer lifecycle test.
