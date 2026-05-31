# macOS Packaging

Diurnum V1 ships as an Apple Silicon macOS app bundle distributed through GitHub Releases.

## Install

1. Download the `.dmg` from the GitHub Release.
2. Open the disk image and drag Diurnum into `/Applications`.
3. Launch the app from `/Applications`.

## Gatekeeper bypass

Because this slice uses ad-hoc signing rather than Developer ID signing, macOS may show a first-launch warning. Use the standard bypass flow:

1. Right-click `Diurnum.app` and choose `Open`.
2. If macOS still blocks the app, open `System Settings -> Privacy & Security`.
3. Choose `Open Anyway` for Diurnum.

## Updates

Diurnum checks GitHub Releases on launch when the update preference is enabled in Settings.
The notification is non-blocking and can be dismissed with `Later`.

## Release pipeline

The release workflow builds an Apple Silicon `aarch64-apple-darwin` bundle on GitHub Actions, produces the `.app` bundle and `.dmg`, and publishes the disk image to a GitHub Release.
