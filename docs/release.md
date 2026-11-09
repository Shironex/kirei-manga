# Releases and updates

How a version tag becomes signed installers on a GitHub release, how the app updates itself, and the one-time setup both need. The workflow is `.github/workflows/release.yml`; the updater is `apps/desktop/src-tauri/src/updater.rs`.

## What a release ships

| Platform              | Installer                          | Updater artifact                                |
| --------------------- | ---------------------------------- | ----------------------------------------------- |
| Windows x64           | `KireiManga_<v>_x64-setup.exe` (NSIS, per user) | the same installer, plus its `.sig`  |
| macOS Apple silicon   | `KireiManga_<v>_aarch64.dmg`       | `KireiManga_<v>_aarch64.app.tar.gz` plus `.sig` |
| macOS Intel           | `KireiManga_<v>_x64.dmg`           | `KireiManga_<v>_x64.app.tar.gz` plus `.sig`     |

Every release also carries `latest.json`, the updater feed: one entry per platform with the artifact URL and its minisign signature. No Linux build.

## One-time setup

### 1. Updater key pair

The app accepts an update only when its minisign signature matches the public key built into it. Generate the pair once, on your own machine:

```sh
pnpm tauri signer generate -w ~/.tauri/kireimanga.key
```

Give it a password when asked. This writes the private key to `~/.tauri/kireimanga.key` and the public key to `~/.tauri/kireimanga.key.pub`.

- Put the **public** key in `apps/desktop/src-tauri/tauri.conf.json` at `plugins.updater.pubkey`, replacing `REPLACE_WITH_UPDATER_PUBLIC_KEY`. The value is the whole content of the `.pub` file as it is (one base64 line), and is safe to commit.
- Keep the **private** key and its password out of the repo. Back both up: installs in the wild only accept updates signed with this key, and a lost key means users have to download the next version by hand.

The release workflow refuses to run while the placeholder is still in `tauri.conf.json`.

### 2. Repository secrets and variables

Settings > Secrets and variables > Actions. The first job of the workflow checks these and fails within seconds, naming every missing one.

Always required:

| Secret                               | Value                                            |
| ------------------------------------ | ------------------------------------------------ |
| `TAURI_SIGNING_PRIVATE_KEY`          | content of `~/.tauri/kireimanga.key`             |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | the password given to `tauri signer generate`    |

Windows code signing (Authenticode), only when the variable `WINDOWS_SIGNING_ENABLED` is `true`:

| Secret                         | Value                                           |
| ------------------------------ | ----------------------------------------------- |
| `WINDOWS_CERTIFICATE`          | the code signing `.pfx`, base64 encoded         |
| `WINDOWS_CERTIFICATE_PASSWORD` | the `.pfx` password                             |

macOS code signing and notarization, only when the variable `MACOS_SIGNING_ENABLED` is `true`:

| Secret                       | Value                                                                       |
| ---------------------------- | --------------------------------------------------------------------------- |
| `APPLE_CERTIFICATE`          | the Developer ID Application certificate exported as `.p12`, base64 encoded |
| `APPLE_CERTIFICATE_PASSWORD` | the `.p12` export password                                                  |
| `APPLE_SIGNING_IDENTITY`     | the identity name, for example `Developer ID Application: Name (TEAMID)`    |
| `APPLE_ID`                   | the Apple ID email used for notarization                                    |
| `APPLE_PASSWORD`             | an app-specific password for that Apple ID (appleid.apple.com)              |
| `APPLE_TEAM_ID`              | the 10 character team ID                                                    |

Base64 for the certificate secrets: `base64 -i cert.p12 | pbcopy` on macOS, `[Convert]::ToBase64String([IO.File]::ReadAllBytes("cert.pfx")) | Set-Clipboard` in PowerShell.

Variables (not secrets, so a job's `if:` can read them):

| Variable                  | Effect when `true`                                                        |
| ------------------------- | ------------------------------------------------------------------------- |
| `WINDOWS_SIGNING_ENABLED` | Authenticode-signs the installer and adds the signtool verify job          |
| `MACOS_SIGNING_ENABLED`   | signs with Developer ID, notarizes, staples and adds the Gatekeeper verify job |

Set a variable together with its secrets, never before. With both off, the Windows installer is unsigned (SmartScreen warns on first run) and the macOS app is ad-hoc signed (Gatekeeper asks the user to allow it once). The updater works either way, because update integrity comes from the minisign signature, not from the code signature.

## Cutting a release

1. Bump the version on a branch and merge it (`package.json`, `apps/desktop/package.json`, `tauri.conf.json`, `[workspace.package]` in `Cargo.toml`; `node scripts/set-version.mjs <version>` writes all four).
2. Tag the merge commit and push the tag:

   ```sh
   git tag v1.0.0
   git push origin v1.0.0
   ```

The tag is the version: the workflow stamps it onto every surface before building, so a mismatch with the committed version cannot ship, but keep them in step anyway so local builds report the truth.

### Stable tag (`v1.0.0`)

The workflow builds the three bundles, generates `latest.json` and the notes, and creates a **draft** release. A draft serves no files, so nobody is offered the update yet. Then:

1. Wait for the verify jobs to pass (update signatures always; Authenticode and notarization when enabled).
2. Edit the draft notes: rewrite the intro and Highlights (they are a draft built from commit subjects).
3. Publish, with "Set as the latest release" checked. From that moment `releases/latest/download/latest.json` serves the new feed and installs update on their next check.

### Prerelease tag (`v1.0.0-rc.1`, `-beta.2`, any `-` suffix)

The release is published at once and marked as a prerelease. After the update signatures verify, the workflow copies its `latest.json` to the rolling `updater-prerelease` release, which is the feed prerelease installs read (see Updater below). Stable installs never see a prerelease.

## Release notes

`scripts/release-notes.mjs` writes the body from the conventional commits since the previous tag (a stable tag skips earlier prereleases, so 1.0.0 covers everything since the last stable release). Order:

1. A one line intro.
2. Highlights (breaking changes, then the first feature of up to five scopes). Rewrite before publishing a stable release.
3. What's New, one heading per scope, from `feat` commits.
4. Bug Fixes (`fix`), Performance (`perf`), Accessibility (features and fixes about accessibility, focus, contrast, keyboard or screen readers), Under the Hood (`refactor`, `build`, `ci`, `test`, `chore`), Dependencies (scope `deps`).
5. Pull requests: one linked line per merged PR the commits landed in.
6. The Full changelog compare link.

`docs` commits and the `docs`, `spec` and `legacy` scopes are left out, as are empty sections. Run it locally against a tag with `node scripts/release-notes.mjs --tag v1.0.0 --repo Shironex/kirei-manga --out notes.md` (needs `gh` signed in); `--self-test` checks the grouping without network.

## Updater

Release builds check for updates when Settings opens; Settings > About > Updates shows the result, checks again on request and installs. Installing downloads the artifact, verifies its minisign signature against the built-in public key and replaces the app: on Windows the NSIS installer runs in passive mode and relaunches it, on macOS the bundle is swapped in place and the app restarts.

No updater in:

- debug builds (`pnpm tauri dev`): the plugin is not registered and the row says updates are not available;
- portable Windows copies: the update is the NSIS installer, which would install a second copy into the user profile. Replace the portable folder's executable by hand. Portable macOS copies update in place.

Feeds:

| Install       | Reads                                                                        |
| ------------- | ---------------------------------------------------------------------------- |
| Stable        | `https://github.com/Shironex/kirei-manga/releases/latest/download/latest.json` |
| Prerelease    | the stable feed and `.../releases/download/updater-prerelease/latest.json`, and takes the newer |

GitHub never counts a prerelease as the latest release, which is why prereleases need their own feed. The `updater-prerelease` release is created by the workflow on the first prerelease, is itself marked a prerelease so it can never become "latest", and holds nothing but `latest.json`; do not delete it. A feed that does not exist yet (before the first release, or while a draft waits) reads as "up to date", not as an error.

## Prerelease dry run

Proves signing, the feed and the update path end to end. Do it once after the setup above, and again whenever the signing setup changes.

1. Tag and push `v1.0.0-rc.1`. Check the run: the preflight passes, three builds, the manifest, the release, and the verify jobs go green; the `updater-prerelease` release appears with a `latest.json`.
2. Install rc.1 from the release on Windows and on macOS (whichever architecture you have). With signing enabled, the installer should open without SmartScreen or Gatekeeper prompts. Open Settings > About: the row should say you have the latest version.
3. Merge any small change, tag and push `v1.0.0-rc.2`, wait for its run to finish.
4. In the rc.1 install, open Settings > About (or press Check again). It should offer 1.0.0-rc.2. Install and restart, then confirm About shows 1.0.0-rc.2.
5. Delete the dry run releases and tags afterwards if you do not want them public, but keep `updater-prerelease`.

## When the workflow fails

| Symptom                                   | Cause                                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------------- |
| "Missing release secrets"                 | a listed secret is empty or a signing variable is on without its secrets              |
| "Updater public key not set"              | `plugins.updater.pubkey` still holds the placeholder                                  |
| "has no minisign signature"               | the build ran without `TAURI_SIGNING_PRIVATE_KEY`, or with a wrong password            |
| minisign verification fails               | the committed public key does not match the private key in the secret                 |
| notarization fails in the macOS build     | wrong app-specific password or team ID, or the certificate is not Developer ID Application |
| updates fail with a signature error       | the app was built with a different public key than the one that signed the release    |
