# AndroidToolkit

A desktop app for bulk ADB work over USB and the network. Built with Electron for macOS and Windows, in the same style and with the same build pipeline as [ShowTrak Server](https://github.com/ShowTrak/ShowTrakServer).

## What it does

- **See every ADB device** attached over USB or the network, with model, Android version and battery, refreshed every couple of seconds.
- **Discover network devices automatically** via mDNS (wireless debugging, legacy TCP/IP) and adb's own listener, and connect to them without typing an address.
- **Connect, pair and switch USB devices to wireless** ADB from the UI.
- **Deploy an APK** to any number of selected devices at once, with the usual install flags.
- **Remove device admins**, device owners and profile owners.
- **Factory reset** selected devices, behind a deliberate confirmation.
- **Reboot** to system, recovery or bootloader.

Every long-running operation is a job in the Activity panel with adb's own output attached.

## Requirements

- Node.js 22 or newer for development.
- [Android platform-tools](https://developer.android.com/tools/releases/platform-tools) on the machine. AndroidToolkit looks for `adb` in the SDK folder, `ANDROID_HOME`, Homebrew and `PATH`; an explicit path can be set in Settings.

## Development

```sh
npm install
npm start          # build, launch, and rebuild on change
npm test           # build + unit tests (node:test)
npm run lint
npm run format
npm run typecheck
```

`npm start -- --no-app` builds and watches without launching Electron.

## Layout

- `src/main.ts` — Electron main process entry.
- `src/main/` — window, menu, IPC plumbing and the per-domain IPC registrars.
- `src/Modules/Adb/` — the adb client: executable lookup, process runner, output parsers and command builders. The parsers and builders are pure and pinned by tests.
- `src/Modules/DeviceManager/` — polls `adb devices -l` and enriches devices.
- `src/Modules/Discovery/` — mDNS browsing and auto-connect.
- `src/Modules/Actions/` — install, device admin removal, factory reset, connectivity.
- `src/Modules/Jobs/` — the activity log.
- `src/UI/` — the renderer (jQuery + Bootstrap, bundled by esbuild).
- `src/shared/types.ts` — the contract between main and renderer.

## How the risky operations work

These were written before being exercised on real hardware; the exact adb output each one expects is pinned in `test/adb-parse.test.js`, which is the place to correct once devices are on hand.

- **Factory reset** sends the `FACTORY_RESET` broadcast to the system's `MasterClearReceiver` (after an `adb root` attempt, which only succeeds on userdebug builds), falling back to the older `MASTER_CLEAR` action. A production build denies that broadcast to shell; the `auto` strategy then reboots to recovery and tries `recovery --wipe_data`, which stock recoveries may not honour. The job reports exactly what adb said.
- **Device admin removal** uses `dpm remove-active-admin`, which also clears device and profile owners but only for apps that are debuggable or declare `android:testOnly`. Refusals are reported verbatim.
- **Enable wireless** reads the device's Wi-Fi address, runs `adb tcpip <port>` and connects to the result.

## Releasing

Releases are built by GitHub Actions (`.github/workflows/build-and-draft-release.yml`), which runs the full build on macOS and Windows, signs and notarizes the macOS build when the Apple secrets are configured, and drafts (or publishes) a GitHub release with the artifacts. Trigger it with:

```sh
npm version <x.y.z> && git push --follow-tags
npm run publish            # or: npm run publish -- --draft
```

CI (`.github/workflows/ci.yml`) runs lint, format check, typecheck and the test suite on every push.

## Licence

MIT.
