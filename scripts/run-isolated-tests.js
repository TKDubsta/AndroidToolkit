// `npm test`: run the suite with no AndroidToolkit application data.
//
// The settings store writes under the app-data directory as soon as it is
// loaded. Pointing HOME (and the Windows/XDG equivalents) at an empty directory
// moves that path somewhere that does not exist, so every run (local, CI and
// coverage) sees the same empty machine and never touches real settings.
//
// Extra arguments are passed through to `node --test`, so a single file runs as
// `npm test -- test/adb-parse.test.js`.
//
// Not named test-*.js: that matches node --test's default file pattern, so the
// suite would run this script as a test file of its own.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const Sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'android-toolkit-isolated-'));

try {
  const Result = spawnSync(
    process.execPath,
    [
      '--test',
      '--test-concurrency=1',
      '--test-timeout=60000',
      '--test-force-exit',
      ...process.argv.slice(2),
    ],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        HOME: Sandbox,
        USERPROFILE: Sandbox,
        APPDATA: path.join(Sandbox, 'AppData', 'Roaming'),
        XDG_DATA_HOME: path.join(Sandbox, '.local', 'share'),
      },
    }
  );
  process.exitCode = Result.status == null ? 1 : Result.status;
} finally {
  // Retries: on Windows a just-exited child can hold a file handle briefly.
  fs.rmSync(Sandbox, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
